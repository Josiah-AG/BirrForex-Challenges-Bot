"""
WinnerPip VPS Worker v6.3 — Persistent IPC + Self-Healing
Each instance owns ONE MT5 terminal exclusively.
Run with: py -3.12 worker.py <terminal_id> <port>
Example:  py -3.12 worker.py 1 8001

Features:
- Persistent IPC: no shutdown between requests, direct login switch
- Self-healing: if terminal gets stuck, kill and relaunch it automatically
- Idle restore: login to base account after 30s of no activity
- Health endpoint: lock-free, always responds instantly
"""

import MetaTrader5 as mt5
import time
import sys
import os
import subprocess
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

# Track state
_ipc_connected = False
_last_request_time = time.time()
_consecutive_failures = 0
MAX_FAILURES_BEFORE_HEAL = 3  # After 3 consecutive failures, self-heal

# Idle restore timer
_idle_timer = None
IDLE_TIMEOUT = 30  # seconds before restoring base account

app = FastAPI(title=f"VPS Worker {TERMINAL_ID}", version="6.3.0")


# ==================== SELF-HEALING ====================

def kill_terminal():
    """Kill the MT5 terminal process for this worker."""
    try:
        mt5.shutdown()
    except:
        pass

    # Find and kill the terminal process by path
    terminal_name = f"Terminal {TERMINAL_ID}"
    try:
        # Use taskkill to find processes matching our terminal path
        result = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq terminal64.exe", "/FO", "CSV"],
            capture_output=True, text=True, timeout=10
        )
        # Kill all terminal64.exe that match our terminal folder
        # Since we can't easily filter by path with tasklist, use wmic
        subprocess.run(
            ["wmic", "process", "where",
             f"ExecutablePath like '%Terminal {TERMINAL_ID}%'",
             "call", "terminate"],
            capture_output=True, text=True, timeout=10
        )
        print(f"  [W{TERMINAL_ID}] Killed terminal process")
    except Exception as e:
        print(f"  [W{TERMINAL_ID}] Kill attempt: {e}")
        # Fallback: try to kill by window title or just proceed
        try:
            subprocess.run(
                ["taskkill", "/F", "/FI", f"WINDOWTITLE eq *Terminal {TERMINAL_ID}*"],
                capture_output=True, text=True, timeout=5
            )
        except:
            pass


def relaunch_terminal() -> bool:
    """Relaunch the MT5 terminal and wait for it to connect."""
    global _ipc_connected
    _ipc_connected = False

    print(f"  [W{TERMINAL_ID}] Relaunching terminal...")
    try:
        subprocess.Popen(
            [TERMINAL_PATH],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        )
    except Exception as e:
        print(f"  [W{TERMINAL_ID}] Relaunch failed: {e}")
        return False

    # Wait for terminal to start and connect to broker
    print(f"  [W{TERMINAL_ID}] Waiting 20s for terminal to connect...")
    time.sleep(20)

    # Try to initialize and login
    for attempt in range(5):
        if mt5.initialize(TERMINAL_PATH):
            if mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER):
                _ipc_connected = True
                print(f"  [W{TERMINAL_ID}] Terminal relaunched and connected ✓")
                return True
            mt5.shutdown()
        time.sleep(3)

    print(f"  [W{TERMINAL_ID}] Relaunch: could not connect after 5 attempts")
    return False


def self_heal():
    """Kill stuck terminal, relaunch, and reconnect."""
    global _consecutive_failures, _ipc_connected
    print(f"  [W{TERMINAL_ID}] === SELF-HEALING ===")

    kill_terminal()
    time.sleep(3)

    if relaunch_terminal():
        _consecutive_failures = 0
        print(f"  [W{TERMINAL_ID}] === HEALED ===")
        return True
    else:
        print(f"  [W{TERMINAL_ID}] === HEAL FAILED ===")
        return False


# ==================== IPC MANAGEMENT ====================

def ensure_ipc() -> bool:
    """Ensure IPC is connected. Initialize if not."""
    global _ipc_connected
    if _ipc_connected:
        return True

    if not mt5.initialize(TERMINAL_PATH):
        error = mt5.last_error()
        print(f"  [W{TERMINAL_ID}] IPC init failed: {error}")
        _ipc_connected = False
        return False

    _ipc_connected = True
    return True


def full_reconnect() -> bool:
    """Full shutdown and reinitialize (fallback path)."""
    global _ipc_connected
    try:
        mt5.shutdown()
    except:
        pass
    _ipc_connected = False
    time.sleep(0.3)

    if not mt5.initialize(TERMINAL_PATH):
        error = mt5.last_error()
        print(f"  [W{TERMINAL_ID}] Reconnect failed: {error}")
        return False

    _ipc_connected = True
    return True


def login_user(account: int, password: str, server: str) -> bool:
    """
    Login to user account. Fast path: direct login on open IPC.
    Fallback: full reconnect. Last resort: self-heal.
    """
    global _consecutive_failures

    # Fast path — IPC already open, just switch account
    if _ipc_connected:
        if mt5.login(account, password=password, server=server):
            _consecutive_failures = 0
            return True

    # Fallback — full reconnect
    if full_reconnect():
        if mt5.login(account, password=password, server=server):
            _consecutive_failures = 0
            return True

    # Track failures
    _consecutive_failures += 1
    print(f"  [W{TERMINAL_ID}] Login failed (consecutive: {_consecutive_failures})")

    # Self-heal after too many consecutive failures
    if _consecutive_failures >= MAX_FAILURES_BEFORE_HEAL:
        if self_heal():
            if mt5.login(account, password=password, server=server):
                _consecutive_failures = 0
                return True

    return False


# ==================== IDLE RESTORE ====================

def _schedule_idle_restore():
    """Schedule base account restore after IDLE_TIMEOUT seconds of no activity."""
    global _idle_timer, _last_request_time
    _last_request_time = time.time()

    if _idle_timer:
        _idle_timer.cancel()
    _idle_timer = threading.Timer(IDLE_TIMEOUT, _do_idle_restore)
    _idle_timer.daemon = True
    _idle_timer.start()


def _do_idle_restore():
    """Restore base account when worker is idle. Has timeout protection."""
    global _ipc_connected

    # Only restore if truly idle (no request came in during the wait)
    if time.time() - _last_request_time < IDLE_TIMEOUT - 1:
        return

    acquired = _lock.acquire(timeout=5)
    if not acquired:
        # Lock is held by an active request — skip, it'll reschedule
        return

    try:
        # Try direct login first (fast)
        if _ipc_connected:
            if mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER):
                print(f"  [W{TERMINAL_ID}] Idle restore: base ✓")
                return

        # Full reconnect
        if full_reconnect():
            if mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER):
                print(f"  [W{TERMINAL_ID}] Idle restore: base ✓ (reconnected)")
                return

        print(f"  [W{TERMINAL_ID}] Idle restore: failed (will retry next idle)")
    finally:
        _lock.release()


# ==================== MT5 OPERATIONS ====================

def init_terminal() -> bool:
    """Connect to terminal and login to base account at startup."""
    global _ipc_connected
    try:
        mt5.shutdown()
    except:
        pass
    _ipc_connected = False
    time.sleep(0.5)

    if not mt5.initialize(TERMINAL_PATH):
        error = mt5.last_error()
        print(f"  [W{TERMINAL_ID}] Init failed: {error}")
        return False

    _ipc_connected = True

    if not mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER):
        error = mt5.last_error()
        print(f"  [W{TERMINAL_ID}] Base login failed: {error}")
        mt5.shutdown()
        _ipc_connected = False
        return False

    info = mt5.account_info()
    if info:
        print(f"  [W{TERMINAL_ID}] Connected — Base account balance: {info.balance}")

    return True


def do_verify(account: int, server: str, password: str) -> dict:
    """Verify credentials — fast path with fallback and self-heal."""
    if not login_user(account, password, server):
        error = mt5.last_error()
        return {"success": False, "message": f"Login failed: {error}"}

    account_info = mt5.account_info()

    if not account_info:
        return {"success": False, "message": "Could not get account info"}

    return {
        "success": True,
        "message": "Credentials verified successfully",
        "account_name": account_info.name,
        "balance": account_info.balance,
        "equity": account_info.equity,
        "server": account_info.server,
        "currency": account_info.currency,
        "terminal_id": TERMINAL_ID,
    }


def do_pull(account: int, server: str, password: str, from_date: str = None) -> dict:
    """Pull trade history — fast path with fallback and self-heal."""
    if not login_user(account, password, server):
        error = mt5.last_error()
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
    """Health check — NO LOCK, always responds instantly."""
    return {
        "status": "ok",
        "terminal_id": TERMINAL_ID,
        "port": PORT,
        "ipc_connected": _ipc_connected,
        "consecutive_failures": _consecutive_failures,
    }


@app.post("/verify")
def verify(req: VerifyRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    account_number = int(req.account.replace("#", "").replace(" ", ""))

    with _lock:
        result = do_verify(account_number, req.server, req.password)

    _schedule_idle_restore()
    return result


@app.post("/pull")
def pull(req: PullRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    account_number = int(req.account.replace("#", "").replace(" ", ""))

    with _lock:
        result = do_pull(account_number, req.server, req.password, req.from_date)

    _schedule_idle_restore()
    return result


# ==================== STARTUP ====================

if __name__ == "__main__":
    print(f"=" * 50)
    print(f"  VPS Worker {TERMINAL_ID} (v6.3 — Self-Healing)")
    print(f"  Terminal: {TERMINAL_PATH}")
    print(f"  Port: {PORT}")
    print(f"  Base Account: {BASE_ACCOUNT} @ {BASE_SERVER}")
    print(f"  Idle Timeout: {IDLE_TIMEOUT}s")
    print(f"  Self-heal after: {MAX_FAILURES_BEFORE_HEAL} consecutive failures")
    print(f"=" * 50)

    # Connect at startup
    for attempt in range(10):
        if init_terminal():
            print(f"  [W{TERMINAL_ID}] Ready! (Persistent IPC + Self-Healing)")
            break
        print(f"  [W{TERMINAL_ID}] Retry {attempt + 1}/10 in 5s...")
        time.sleep(5)
    else:
        print(f"  [W{TERMINAL_ID}] WARNING: Could not init. Will self-heal on first request.")

    print(f"  [W{TERMINAL_ID}] Starting on port {PORT}...")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
