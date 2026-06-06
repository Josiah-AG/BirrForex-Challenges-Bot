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
IDLE_TIMEOUT = 300  # seconds before restoring base account (long enough to cover a full pull+eval cycle)

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

    # Detect account subtype by checking available symbols
    account_subtype = "unknown"
    if account_info.currency == "USC":
        account_subtype = "standard_cent"
    else:
        # Check which EURUSD variant exists on this account
        sym_m = mt5.symbol_info("EURUSDm")
        sym_z = mt5.symbol_info("EURUSDz")
        sym_raw = mt5.symbol_info("EURUSD")
        if sym_m and sym_m.visible is not None:
            account_subtype = "standard"
        elif sym_z and sym_z.visible is not None:
            account_subtype = "zero"
        elif sym_raw and sym_raw.visible is not None:
            account_subtype = "pro"
        else:
            account_subtype = "unknown"

    return {
        "success": True,
        "message": "Credentials verified successfully",
        "account_name": account_info.name,
        "balance": account_info.balance,
        "equity": account_info.equity,
        "server": account_info.server,
        "currency": account_info.currency,
        "account_subtype": account_subtype,
        "leverage": account_info.leverage,
        "margin_free": account_info.margin_free,
        "profit": account_info.profit,
        "login": account_info.login,
        "trade_mode": account_info.trade_mode,
        "terminal_id": TERMINAL_ID,
    }


def do_pull(account: int, server: str, password: str, from_date: str = None, orders_from_date: str = None) -> dict:
    """Pull trade history — incremental approach.
    
    from_date: Filter deals from this time (incremental window, e.g. last 5 hours)
    orders_from_date: Filter orders from this time (challenge start — needed for open_time/open_price)
    """
    if not login_user(account, password, server):
        error = mt5.last_error()
        return {"success": False, "message": f"Login failed: {error}"}

    account_info = mt5.account_info()
    balance = account_info.balance if account_info else 0
    equity = account_info.equity if account_info else 0

    # Date range for deals (incremental window)
    if from_date:
        try:
            date_from = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
            date_from = date_from - timedelta(hours=1)
        except:
            date_from = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        date_from = datetime(2020, 1, 1, tzinfo=timezone.utc)

    # Date range for orders (full challenge period — lightweight, provides open_time/open_price)
    if orders_from_date:
        try:
            orders_date_from = datetime.fromisoformat(orders_from_date.replace("Z", "+00:00"))
            orders_date_from = orders_date_from - timedelta(hours=1)
        except:
            orders_date_from = date_from
    else:
        orders_date_from = date_from

    date_to = datetime.now(timezone.utc)

    # Capture SL/TP of currently open positions (only reliable source for modified SL/TP)
    open_positions_sl = {}
    try:
        open_pos = mt5.positions_get()
        if open_pos:
            for pos in open_pos:
                if pos.sl or pos.tp:
                    open_positions_sl[pos.ticket] = {"sl": pos.sl, "tp": pos.tp}
    except:
        pass

    # Wait for terminal to sync history after account switch.
    # Poll history_deals_get until count stabilizes (two consecutive calls return same count).
    prev_count = -1
    trades_raw = None
    for attempt in range(10):
        trades_raw = mt5.history_deals_get(date_from, date_to)
        current_count = len(trades_raw) if trades_raw is not None else 0
        if current_count == prev_count and current_count >= 0:
            break  # History is stable
        prev_count = current_count
        time.sleep(0.5)

    trades_list = []
    deals_list = []

    # Same approach for orders — poll until stable
    prev_order_count = -1
    orders_raw = None
    for attempt in range(10):
        orders_raw = mt5.history_orders_get(orders_date_from, date_to)
        current_count = len(orders_raw) if orders_raw is not None else 0
        if current_count == prev_order_count and current_count >= 0:
            break
        prev_order_count = current_count
        time.sleep(0.3)

    orders_by_position = {}
    if orders_raw is not None:
        for order in orders_raw:
            pos_id = order.position_id
            if not pos_id:
                continue
            if pos_id not in orders_by_position:
                # First order for this position — store open_time and open_price
                orders_by_position[pos_id] = {
                    "sl": order.sl,
                    "tp": order.tp,
                    "open_time": datetime.fromtimestamp(order.time_setup, tz=timezone.utc).isoformat() if order.time_setup else None,
                    "open_price": order.price_open,
                }
            else:
                # Later order for same position — update SL/TP if non-zero
                # (user may have added/modified SL after opening)
                if order.sl and order.sl != 0:
                    orders_by_position[pos_id]["sl"] = order.sl
                if order.tp and order.tp != 0:
                    orders_by_position[pos_id]["tp"] = order.tp

    # First pass: collect all deals and index opening deals by position_id
    open_deals_by_position = {}  # position_id -> {time, price, type}

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
                "sl": deal.sl if hasattr(deal, "sl") else 0,
                "tp": deal.tp if hasattr(deal, "tp") else 0,
                "comment": deal.comment,
                "position_id": deal.position_id,
            }
            deals_list.append(deal_dict)

            # Index opening deals (entry==0) by position_id for open_time/open_price lookup
            if deal.entry == 0 and deal.symbol and deal.position_id:
                open_deals_by_position[deal.position_id] = {
                    "time": datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
                    "price": deal.price,
                    "type": deal.type,
                }

        # Second pass: each closing deal (entry==1) becomes its own trade
        # This correctly handles partial closes — each partial close deal is a separate trade
        for deal in trades_raw:
            if deal.entry == 1 and deal.symbol:
                # Use the deal's own ticket as the trade ticket (unique per partial close)
                trade_ticket = deal.ticket
                pos_id = deal.position_id or deal.ticket

                # Determine trade direction from the OPENING deal's type
                # (closing deal type is inverted: buy close = sell deal, sell close = buy deal)
                open_deal = open_deals_by_position.get(pos_id, {})
                if open_deal:
                    # Opening deal type: 0=buy, 1=sell
                    trade_type = "Buy" if open_deal.get("type") == 0 else "Sell" if open_deal.get("type") == 1 else "Other"
                else:
                    # Fallback: invert the closing deal type
                    trade_type = "Sell" if deal.type == 0 else "Buy" if deal.type == 1 else "Other"

                # Get order info for SL/TP — use per-position lookup for accuracy
                order_info = orders_by_position.get(pos_id, {})

                # If SL is still 0, look up the CLOSING ORDER by ticket
                # The closing order (deal.order) carries the final SL/TP of the position
                if not order_info.get("sl") and deal.order:
                    closing_order = mt5.history_orders_get(ticket=deal.order)
                    if closing_order and len(closing_order) > 0:
                        co = closing_order[0]
                        if co.sl and co.sl != 0:
                            if not order_info:
                                order_info = {
                                    "sl": co.sl,
                                    "tp": co.tp,
                                    "open_time": None,
                                    "open_price": None,
                                }
                            else:
                                order_info["sl"] = co.sl
                            if co.tp and co.tp != 0:
                                order_info["tp"] = co.tp
                        # Cache for other partial closes of same position
                        if order_info.get("sl"):
                            orders_by_position[pos_id] = order_info

                # Open time/price: prefer order info, then opening deal, then fallback
                open_time = order_info.get("open_time") or open_deal.get("time")
                open_price = order_info.get("open_price") or open_deal.get("price", deal.price)

                # Get SL/TP: prefer order info, then deal's own sl/tp (if available in newer MT5)
                final_sl = order_info.get("sl", 0)
                final_tp = order_info.get("tp", 0)
                # Fallback: use deal.sl/tp if available (MT5 build 4150+)
                if not final_sl and hasattr(deal, "sl") and deal.sl:
                    final_sl = deal.sl
                if not final_tp and hasattr(deal, "tp") and deal.tp:
                    final_tp = deal.tp
                # Fallback: use open position SL/TP (captured before history fetch)
                if not final_sl and pos_id in open_positions_sl:
                    final_sl = open_positions_sl[pos_id].get("sl", 0)
                if not final_tp and pos_id in open_positions_sl:
                    final_tp = open_positions_sl[pos_id].get("tp", 0)

                trades_list.append({
                    "ticket": trade_ticket,
                    "position_id": pos_id,
                    "symbol": deal.symbol,
                    "type": trade_type,
                    "volume": deal.volume,
                    "open_time": open_time,
                    "close_time": datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
                    "open_price": open_price,
                    "close_price": deal.price,
                    "stop_loss": final_sl,
                    "take_profit": final_tp,
                    "profit": deal.profit,
                    "commission": deal.commission,
                    "swap": deal.swap,
                    "comment": deal.comment or "",
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


# ==================== CANDLES ====================

def do_candles(symbol: str, timeframe: str, from_time: str, to_time: str) -> dict:
    """Fetch OHLC candle data for a symbol. Uses the base account (already logged in)."""
    import MetaTrader5 as mt5

    # Map timeframe string to MT5 constant
    tf_map = {
        "M1": mt5.TIMEFRAME_M1,
        "M5": mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15,
        "H1": mt5.TIMEFRAME_H1,
        "H4": mt5.TIMEFRAME_H4,
        "D1": mt5.TIMEFRAME_D1,
    }
    tf = tf_map.get(timeframe, mt5.TIMEFRAME_M1)

    try:
        date_from = datetime.fromisoformat(from_time.replace("Z", "+00:00").replace(" ", "T"))
        date_to = datetime.fromisoformat(to_time.replace("Z", "+00:00").replace(" ", "T"))
    except:
        return {"success": False, "message": "Invalid date format"}

    # Restore base account for candle data (candles don't need user login)
    if not _ipc_connected:
        if not mt5.initialize(TERMINAL_PATH):
            return {"success": False, "message": "MT5 not initialized"}

    rates = mt5.copy_rates_range(symbol, tf, date_from, date_to)

    if rates is None or len(rates) == 0:
        return {"success": False, "message": f"No candle data for {symbol}", "candles": []}

    candles = []
    for rate in rates:
        candles.append({
            "time": datetime.fromtimestamp(rate[0], tz=timezone.utc).isoformat(),
            "open": float(rate[1]),
            "high": float(rate[2]),
            "low": float(rate[3]),
            "close": float(rate[4]),
            "volume": int(rate[5]),
        })

    return {"success": True, "candles": candles, "count": len(candles)}


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
    orders_from_date: Optional[str] = None


class CandlesRequest(BaseModel):
    symbol: str
    timeframe: str = "M1"
    from_time: str
    to_time: str
    api_key: str
    terminal_id: Optional[int] = None


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
        result = do_pull(account_number, req.server, req.password, req.from_date, req.orders_from_date)

    _schedule_idle_restore()
    return result


@app.post("/candles")
def candles(req: CandlesRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    with _lock:
        result = do_candles(req.symbol, req.timeframe, req.from_time, req.to_time)

    # Reset idle timer so candle requests during evaluation don't trigger premature base-account restore
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
