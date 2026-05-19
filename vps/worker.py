"""
WinnerPip VPS Worker — Single Terminal Owner
Each instance owns ONE MT5 terminal exclusively.
Run with: python worker.py <terminal_id> <port>
Example:  python worker.py 1 8001

The worker initializes its terminal at startup and keeps it ready.
All requests are handled sequentially (one at a time per terminal).
"""

import MetaTrader5 as mt5
import time
import sys
import os
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn

# Parse args
if len(sys.argv) < 3:
    print("Usage: python worker.py <terminal_id> <port>")
    print("Example: python worker.py 1 8001")
    sys.exit(1)

TERMINAL_ID = int(sys.argv[1])
PORT = int(sys.argv[2])
TERMINAL_PATH = f"C:\\MT5_{TERMINAL_ID}\\terminal64.exe"

# API key
API_KEY = os.environ.get("VPS_API_KEY", "")

app = FastAPI(title=f"VPS Worker {TERMINAL_ID}", version="5.0.0")


# ==================== MT5 OPERATIONS ====================

def init_terminal() -> bool:
    """Initialize connection to this worker's terminal. Launches it if not running."""
    try:
        mt5.shutdown()
    except:
        pass
    time.sleep(0.5)

    # mt5.initialize(path) will launch the terminal if not running
    # portable=True is CRITICAL for multiple terminals from different paths
    # It tells MT5 to use the terminal's own data directory, preventing conflicts
    if not mt5.initialize(TERMINAL_PATH, portable=True):
        error = mt5.last_error()
        print(f"  [W{TERMINAL_ID}] Init failed: {error}")
        return False

    # Wait for terminal to connect to broker
    time.sleep(2)
    info = mt5.terminal_info()
    if info:
        print(f"  [W{TERMINAL_ID}] Terminal connected (path: {info.path})")
    else:
        print(f"  [W{TERMINAL_ID}] Terminal launched (waiting for broker)")
    mt5.shutdown()
    return True


def do_verify(account: int, server: str, password: str) -> dict:
    """Verify credentials on this terminal."""
    try:
        mt5.shutdown()
    except:
        pass
    time.sleep(0.2)

    if not mt5.initialize(TERMINAL_PATH, portable=True):
        error = mt5.last_error()
        return {"success": False, "message": f"MT5 init error: {error}"}

    time.sleep(0.2)

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
    }


def do_pull(account: int, server: str, password: str, from_date: str = None) -> dict:
    """Pull trade history on this terminal."""
    try:
        mt5.shutdown()
    except:
        pass
    time.sleep(0.2)

    if not mt5.initialize(TERMINAL_PATH, portable=True):
        error = mt5.last_error()
        return {"success": False, "message": f"MT5 init error: {error}"}

    time.sleep(0.2)

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
    return do_verify(account_number, req.server, req.password)


@app.post("/pull")
def pull(req: PullRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    account_number = int(req.account.replace("#", "").replace(" ", ""))
    return do_pull(account_number, req.server, req.password, req.from_date)


# ==================== STARTUP ====================

if __name__ == "__main__":
    print(f"=" * 40)
    print(f"  VPS Worker {TERMINAL_ID}")
    print(f"  Terminal: {TERMINAL_PATH}")
    print(f"  Port: {PORT}")
    print(f"=" * 40)

    # Initialize terminal at startup (launches it if not running)
    # The worker OWNS this terminal — it launched it
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
