"""
WinnerPip VPS Worker v6.1 — Single Terminal Owner (Optimized)
Each instance owns ONE MT5 terminal exclusively.
Run with: py -3.12 worker.py <terminal_id> <port>
Example:  py -3.12 worker.py 1 8001

Flow per request:
  1. mt5.initialize(terminal_path)
  2. mt5.login(user_account, password, server)
  3. Do operation (verify or pull trade history)
  4. mt5.shutdown() — disconnect IPC (terminal stays open)
  5. Return result

Base account restore:
  - NOT done after every request (saves ~4s per request)
  - Done when worker goes IDLE (no requests for 10 seconds)
  - Ensures terminal stays logged in and connected when not in use
"""

import MetaTrader5 as mt5
import time
import sys
import os
import threading
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn

# Parse args
if len(sys.argv) < 3:
    print("Usage: py -3.12 worker.py <terminal_id> <port>")
    print("Example: py -3.12 worker.py 1 8001")
    sys.exit(1)

TERMINAL_ID = int(sys.argv[1])
PORT = int(sys.argv[2])
TERMINAL_PATH = f"C:\\MetaTrader\\Terminal {TERMINAL_ID}\\terminal64.exe"

# Base account — restore when idle
BASE_ACCOUNT = 435924397
BASE_PASSWORD = "Abc@1234"
BASE_SERVER = "Exness-MT5Trial9"

# API key
API_KEY = os.environ.get("VPS_API_KEY", "")

# Lock — one operation at a time per terminal
_lock = threading.Lock()

# Idle restore timer
_idle_timer = None
IDLE_TIMEOUT = 10  # seconds before restoring base account

app = FastAPI(title=f"VPS Worker {TERMINAL_ID}", version="6.1.0")


# ==================== IDLE RESTORE ====================

def _schedule_idle_restore():
    """Schedule base account restore after IDLE_TIMEOUT seconds of no activity."""
    global _idle_timer
    if _idle_timer:
        _idle_timer.cancel()
    _idle_timer = threading.Timer(IDLE_TIMEOUT, _do_idle_restore)
    _idle_timer.daemon = True
    _idle_timer.start()


def _do_idle_restore():
    """Restore base account when worker is idle. Runs in background thread."""
    global _idle_timer
    with _lock:
        try:
            mt5.shutdown()
        except:
            pass
        time.sleep(0.3)

        if not mt5.initialize(TERMINAL_PATH):
            print(f"  [W{TERMINAL_ID}] Idle restore: init failed")
            return

        if mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER):
            print(f"  [W{TERMINAL_ID}] Idle restore: base account connected ✓")
        else:
            print(f"  [W{TERMINAL_ID}] Idle restore: base login failed")

        # Keep IPC connected — do NOT shutdown here
        # Terminal stays logged into base account and ready


# ==================== MT5 OPERATIONS ====================

def init_terminal() -> bool:
    """Connect to this worker's already-running terminal and verify base account."""
    try:
        mt5.shutdown()
    except:
        pass
    time.sleep(0.5)

    if not mt5.initialize(TERMINAL_PATH):
        error = mt5.last_error()
        print(f"  [W{TERMINAL_ID}] Init failed: {error}")
        return False

    # Login to base account to confirm terminal is working
    if not mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER):
        error = mt5.last_error()
        print(f"  [W{TERMINAL_ID}] Base login failed: {error}")
        mt5.shutdown()
        return False

    info = mt5.account_info()
    if info:
        print(f"  [W{TERMINAL_ID}] Connected — Base account balance: {info.balance}")
    else:
        print(f"  [W{TERMINAL_ID}] Connected (no account_info)")

    # Keep connected — don't shutdown at startup
    return True


def do_verify(account: int, server: str, password: str) -> dict:
    """Verify credentials on this terminal."""
    try:
        mt5.shutdown()
    except:
        pass
    time.sleep(0.2)

    if not mt5.initialize(TERMINAL_PATH):
        error = mt5.last_error()
        return {"success": False, "message": f"MT5 init error: {error}"}

    time.sleep(0.3)

    # Login to user account
    if not mt5.login(account, password=password, server=server):
        error = mt5.last_error()
        mt5.shutdown()
        return {"success": False, "message": f"Login failed: {error}"}

    account_info = mt5.account_info()
    mt5.shutdown()

    if not account_info:
        return {"success": False, "message": "Could not get account info"}

    return {
        "success": True,
        "message": "Credentials verified successfully",
        "account_name": account_info.name,
        "balance": account_info.balance,
        "equity": account_info.equity,
        "server": account_info.server,
        "terminal_id": TERMINAL_ID,
    }


def do_pull(account: int, server: str, password: str, from_date: str = None) -> dict:
    """Pull trade history on this terminal."""
    try:
        mt5.shutdown()
    except:
        pass
    time.sleep(0.2)

    if not mt5.initialize(TERMINAL_PATH):
        error = mt5.last_error()
        return {"success": False, "message": f"MT5 init error: {error}"}

    time.sleep(0.3)

    # Login to user account
    if not mt5.login(account, password=password, server=server):
        error = mt5.last_error()
        mt5.shutdown()
        return {"success": False, "message": f"Login failed: {error}"}

    account_info = mt5.account_info()
    balance = account_info.balance if account_info else 0
    equity = account_info.equity if account_info else 0

    # Date range
    if from_date:
        try:
            date_from = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
            date_from = date_from - timedelta(hours=1)
        except:
            date_from = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        date_from = datetime(2020, 1, 1, tzinfo=timezone.utc)

    date_to = datetime.now(timezone.utc)

    # Fetch deals
    trades_raw = mt5.history_deals_get(date_from, date_to)
    trades_list = []
    deals_list = []

    if trades_raw is not None:
        for deal in trades_raw:
            deal_dict = {
                "ticket": deal.ticket,
                "order": deal.order,
                "time": datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
                "type": deal.type,
                "entry": deal.entry,
                "symbol": deal.symbol,
                "volume": deal.volume,
                "price": deal.price,
                "profit": deal.profit,
                "commission": deal.commission,
                "swap": deal.swap,
                "fee": deal.fee if hasattr(deal, "fee") else 0,
                "comment": deal.comment,
                "position_id": deal.position_id,
            }
            deals_list.append(deal_dict)

            # Entry == 1 means trade exit (closed trade)
            if deal.entry == 1 and deal.symbol:
                trade_type = "Buy" if deal.type == 0 else "Sell" if deal.type == 1 else "Other"
                trades_list.append({
                    "ticket": deal.position_id or deal.ticket,
                    "symbol": deal.symbol,
                    "type": trade_type,
                    "volume": deal.volume,
                    "close_time": datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
                    "close_price": deal.price,
                    "profit": deal.profit,
                    "commission": deal.commission,
                    "swap": deal.swap,
                    "comment": deal.comment,
                })

    mt5.shutdown()

    return {
        "success": True,
        "message": f"Pulled {len(trades_list)} trades, {len(deals_list)} deals",
        "balance": balance,
        "equity": equity,
        "trades": trades_list,
        "deals": deals_list,
        "terminal_id": TERMINAL_ID,
    }


# ==================== MODELS ====================

class VerifyRequest(BaseModel):
    account: str
    server: str
    password: str
    api_key: str


class PullRequest(BaseModel):
    account: str
    server: str
    password: str
    api_key: str
    from_date: Optional[str] = None


# ==================== ENDPOINTS ====================

@app.get("/health")
def health():
    return {"status": "ok", "terminal_id": TERMINAL_ID, "port": PORT}


@app.post("/verify")
def verify(req: VerifyRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    account_number = int(req.account.replace("#", "").replace(" ", ""))

    with _lock:
        result = do_verify(account_number, req.server, req.password)

    # Schedule idle restore (resets timer on each request)
    _schedule_idle_restore()
    return result


@app.post("/pull")
def pull(req: PullRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    account_number = int(req.account.replace("#", "").replace(" ", ""))

    with _lock:
        result = do_pull(account_number, req.server, req.password, req.from_date)

    # Schedule idle restore (resets timer on each request)
    _schedule_idle_restore()
    return result


# ==================== STARTUP ====================

if __name__ == "__main__":
    print(f"=" * 50)
    print(f"  VPS Worker {TERMINAL_ID} (v6.1 — Idle Restore)")
    print(f"  Terminal: {TERMINAL_PATH}")
    print(f"  Port: {PORT}")
    print(f"  Base Account: {BASE_ACCOUNT} @ {BASE_SERVER}")
    print(f"  Idle Timeout: {IDLE_TIMEOUT}s")
    print(f"=" * 50)

    # Verify terminal is reachable at startup
    for attempt in range(10):
        if init_terminal():
            print(f"  [W{TERMINAL_ID}] Ready!")
            break
        print(f"  [W{TERMINAL_ID}] Retry {attempt + 1}/10 in 5s...")
        time.sleep(5)
    else:
        print(f"  [W{TERMINAL_ID}] WARNING: Could not init terminal. Will retry on requests.")

    print(f"  [W{TERMINAL_ID}] Starting on port {PORT}...")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
