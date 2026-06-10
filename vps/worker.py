"""
WinnerPip VPS Worker v8.0 — Fixed Base Account
Each instance owns ONE MT5 terminal exclusively.
Run with: py -3.12 worker.py <terminal_id> <port>
Example:  py -3.12 worker.py 1 8001

New in v8.0:
- Home account is fixed — always the hardcoded standard base account (no /set-home-account)
- Removes dynamic subtype self-correct in do_candles() — base account is always standard
- Symbol remapping (XAUUSDc → XAUUSDm etc.) is handled by the Node.js API before the request
- Eliminates terminal login failures caused by dynamic home account switching
"""

import MetaTrader5 as mt5
import time
import sys
import os
import subprocess
import threading
import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn

# Parse args
if len(sys.argv) < 3:
    print("Usage: py -3.12 worker.py <terminal_id> <port>")
    sys.exit(1)

TERMINAL_ID = int(sys.argv[1])
PORT = int(sys.argv[2])
TERMINAL_PATH = f"C:\\MetaTrader\\Terminal {TERMINAL_ID}\\terminal64.exe"

# Fallback base account (standard demo) — used only when entire subtype pool is exhausted
BASE_ACCOUNT  = int(os.environ.get("VPS_BASE_ACCOUNT", "435924397"))
BASE_PASSWORD = os.environ.get("VPS_BASE_PASSWORD", "Abc@1234")
BASE_SERVER   = os.environ.get("VPS_BASE_SERVER",   "Exness-MT5Trial9")

# API key
API_KEY = os.environ.get("VPS_API_KEY", "")

# Lock — one operation at a time per terminal
_lock = threading.Lock()

# IPC state
_ipc_connected = False
_last_request_time = time.time()
_consecutive_failures = 0
MAX_FAILURES_BEFORE_HEAL = 3

# Idle restore
_idle_timer = None
IDLE_TIMEOUT = 30  # seconds — fast restore, home account is always correct subtype

# Current logged-in account (updated on every successful login)
_current_account_str = str(BASE_ACCOUNT)

app = FastAPI(title=f"VPS Worker {TERMINAL_ID}", version="7.0.0")


# ==================== BASE ACCOUNT RESTORE ====================

def force_login_base_account(reason: str = "") -> bool:
    """
    Full hard reset: shutdown IPC → reinitialize → login to base account.
    Used at startup and after any credential failure.
    Retries up to 5 times with increasing delays.
    """
    global _ipc_connected, _current_account_str
    tag = f"  [W{TERMINAL_ID}]"
    print(f"{tag} ── force_login_base_account ── reason: {reason}")
    print(f"{tag}    terminal path : {TERMINAL_PATH}")
    print(f"{tag}    base account  : {BASE_ACCOUNT}")
    print(f"{tag}    base server   : {BASE_SERVER}")
    print(f"{tag}    _ipc_connected: {_ipc_connected}")

    print(f"{tag}    step 1: mt5.shutdown()")
    try:
        mt5.shutdown()
        print(f"{tag}    mt5.shutdown() OK")
    except Exception as e:
        print(f"{tag}    mt5.shutdown() raised: {e}")
    _ipc_connected = False

    for attempt in range(5):
        delay = 1 + attempt
        print(f"{tag}    attempt {attempt+1}/5 — waiting {delay}s ...")
        time.sleep(delay)
        try:
            print(f"{tag}    step 2: mt5.initialize({TERMINAL_PATH})")
            init_ok = mt5.initialize(TERMINAL_PATH)
            print(f"{tag}    mt5.initialize → {'OK' if init_ok else f'FAILED: {mt5.last_error()}'}")
            if init_ok:
                _ipc_connected = True
                print(f"{tag}    step 3: mt5.login({BASE_ACCOUNT}, server={BASE_SERVER})")
                login_ok = mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER)
                print(f"{tag}    mt5.login → {'OK' if login_ok else f'FAILED: {mt5.last_error()}'}")
                if login_ok:
                    _current_account_str = str(BASE_ACCOUNT)
                    info = mt5.account_info()
                    if info:
                        print(f"{tag}    account_info: login={info.login} balance={info.balance} server={info.server} currency={info.currency}")
                    else:
                        print(f"{tag}    account_info: None (mt5.last_error={mt5.last_error()})")
                    print(f"{tag} ✓ Base account login SUCCESS")
                    return True
                else:
                    print(f"{tag}    login failed — doing mt5.shutdown() before retry")
                    mt5.shutdown()
                    _ipc_connected = False
            else:
                print(f"{tag}    initialize failed — will retry")
        except Exception as e:
            print(f"{tag}    attempt {attempt+1} exception: {e}")

    print(f"{tag} ✗ Base account login FAILED after 5 attempts")
    return False


# ==================== SELF-HEALING ====================

def kill_terminal():
    try:
        mt5.shutdown()
    except:
        pass
    try:
        subprocess.run(
            ["wmic", "process", "where",
             f"ExecutablePath like '%Terminal {TERMINAL_ID}%'",
             "call", "terminate"],
            capture_output=True, text=True, timeout=10
        )
        print(f"  [W{TERMINAL_ID}] Killed terminal process")
    except Exception as e:
        try:
            subprocess.run(
                ["taskkill", "/F", "/FI", f"WINDOWTITLE eq *Terminal {TERMINAL_ID}*"],
                capture_output=True, text=True, timeout=5
            )
        except:
            pass


def relaunch_terminal() -> bool:
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

    print(f"  [W{TERMINAL_ID}] Waiting 20s for terminal to connect...")
    time.sleep(20)

    for attempt in range(5):
        if mt5.initialize(TERMINAL_PATH):
            if mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER):
                _ipc_connected = True
                global _current_account_str
                _current_account_str = str(BASE_ACCOUNT)
                print(f"  [W{TERMINAL_ID}] Terminal relaunched and connected ✓")
                return True
            mt5.shutdown()
        time.sleep(3)

    print(f"  [W{TERMINAL_ID}] Relaunch: could not connect after 5 attempts")
    return False


def self_heal():
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
    global _ipc_connected
    if _ipc_connected:
        return True
    if not mt5.initialize(TERMINAL_PATH):
        _ipc_connected = False
        return False
    _ipc_connected = True
    return True


def full_reconnect() -> bool:
    global _ipc_connected
    try:
        mt5.shutdown()
    except:
        pass
    _ipc_connected = False
    time.sleep(0.3)
    if not mt5.initialize(TERMINAL_PATH):
        return False
    _ipc_connected = True
    return True


def login_user(account: int, password: str, server: str) -> bool:
    global _consecutive_failures, _current_account_str
    tag = f"  [W{TERMINAL_ID}]"
    print(f"{tag} login_user: account={account} server={server} _ipc_connected={_ipc_connected}")

    if _ipc_connected:
        ok = mt5.login(account, password=password, server=server)
        print(f"{tag} login_user: direct login → {'OK' if ok else f'FAILED: {mt5.last_error()}'}")
        if ok:
            _consecutive_failures = 0
            _current_account_str = str(account)
            return True

    print(f"{tag} login_user: trying full_reconnect()")
    if full_reconnect():
        print(f"{tag} login_user: full_reconnect OK — retrying login")
        ok = mt5.login(account, password=password, server=server)
        print(f"{tag} login_user: post-reconnect login → {'OK' if ok else f'FAILED: {mt5.last_error()}'}")
        if ok:
            _consecutive_failures = 0
            _current_account_str = str(account)
            return True
    else:
        print(f"{tag} login_user: full_reconnect FAILED: {mt5.last_error()}")

    _consecutive_failures += 1
    print(f"  [W{TERMINAL_ID}] Login failed (consecutive: {_consecutive_failures})")

    if _consecutive_failures >= MAX_FAILURES_BEFORE_HEAL:
        print(f"{tag} login_user: triggering self_heal()")
        if self_heal():
            ok = mt5.login(account, password=password, server=server)
            print(f"{tag} login_user: post-heal login → {'OK' if ok else f'FAILED: {mt5.last_error()}'}")
            if ok:
                _consecutive_failures = 0
                _current_account_str = str(account)
                return True

    print(f"{tag} login_user: returning False")
    return False


# ==================== IDLE RESTORE ====================

def _schedule_idle_restore():
    global _idle_timer, _last_request_time
    _last_request_time = time.time()
    if _idle_timer:
        _idle_timer.cancel()
    _idle_timer = threading.Timer(IDLE_TIMEOUT, _do_idle_restore)
    _idle_timer.daemon = True
    _idle_timer.start()


def _do_idle_restore():
    """Always restore to the hardcoded standard base account. No dynamic subtype logic."""
    global _ipc_connected

    if time.time() - _last_request_time < IDLE_TIMEOUT - 1:
        return

    acquired = _lock.acquire(timeout=5)
    if not acquired:
        return

    try:
        if login_user(BASE_ACCOUNT, BASE_PASSWORD, BASE_SERVER):
            print(f"  [W{TERMINAL_ID}] Idle restore: home account ({BASE_ACCOUNT}) ✓")
        else:
            print(f"  [W{TERMINAL_ID}] Idle restore: home account login failed — {mt5.last_error()}")
    finally:
        _lock.release()


# ==================== MT5 OPERATIONS ====================

def init_terminal() -> bool:
    """Startup: force login to base account using full hard reset."""
    return force_login_base_account("startup")


def do_verify(account: int, server: str, password: str) -> dict:
    if not login_user(account, password, server):
        err = mt5.last_error()
        force_login_base_account("credential failure in verify")
        return {"success": False, "message": f"Login failed: {err}"}

    account_info = mt5.account_info()
    if not account_info:
        return {"success": False, "message": "Could not get account info"}

    account_subtype = "unknown"
    if account_info.currency == "USC":
        account_subtype = "standard_cent"
    else:
        sym_m   = mt5.symbol_info("EURUSDm")
        sym_z   = mt5.symbol_info("EURUSDz")
        sym_raw = mt5.symbol_info("EURUSD")
        if sym_m is not None:
            account_subtype = "standard"
        elif sym_z is not None:
            account_subtype = "zero"
        elif sym_raw is not None:
            account_subtype = "pro"

    return {
        "success":        True,
        "message":        "Credentials verified successfully",
        "account_name":   account_info.name,
        "balance":        account_info.balance,
        "equity":         account_info.equity,
        "server":         account_info.server,
        "currency":       account_info.currency,
        "account_subtype": account_subtype,
        "leverage":       account_info.leverage,
        "margin_free":    account_info.margin_free,
        "profit":         account_info.profit,
        "login":          account_info.login,
        "trade_mode":     account_info.trade_mode,
        "terminal_id":    TERMINAL_ID,
    }


def do_pull(account: int, server: str, password: str, from_date: str = None, orders_from_date: str = None) -> dict:
    if not login_user(account, password, server):
        err = mt5.last_error()
        force_login_base_account("credential failure in pull")
        return {"success": False, "message": f"Login failed: {err}"}

    # MT5 needs time to sync deal history from the broker after switching accounts.
    # Without this wait, history_deals_get() returns 0 deals on the first call.
    time.sleep(2)

    account_info = mt5.account_info()
    balance = account_info.balance if account_info else 0
    equity  = account_info.equity  if account_info else 0

    if from_date:
        try:
            date_from = datetime.fromisoformat(from_date.replace("Z", "+00:00")) - timedelta(hours=1)
        except:
            date_from = datetime(2020, 1, 1, tzinfo=timezone.utc)
    else:
        date_from = datetime(2020, 1, 1, tzinfo=timezone.utc)

    if orders_from_date:
        try:
            orders_date_from = datetime.fromisoformat(orders_from_date.replace("Z", "+00:00")) - timedelta(hours=1)
        except:
            orders_date_from = date_from
    else:
        orders_date_from = date_from

    date_to = datetime.now(timezone.utc)

    open_positions_sl = {}
    try:
        open_pos = mt5.positions_get()
        if open_pos:
            for pos in open_pos:
                if pos.sl or pos.tp:
                    open_positions_sl[pos.ticket] = {"sl": pos.sl, "tp": pos.tp}
    except:
        pass

    prev_count = -1
    trades_raw = None
    for _ in range(10):
        trades_raw = mt5.history_deals_get(date_from, date_to)
        current_count = len(trades_raw) if trades_raw is not None else 0
        if current_count == prev_count:
            break
        prev_count = current_count
        time.sleep(0.5)

    trades_list = []
    deals_list  = []

    prev_order_count = -1
    orders_raw = None
    for _ in range(10):
        orders_raw = mt5.history_orders_get(orders_date_from, date_to)
        current_count = len(orders_raw) if orders_raw is not None else 0
        if current_count == prev_order_count:
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
                orders_by_position[pos_id] = {
                    "sl":         order.sl,
                    "tp":         order.tp,
                    "open_time":  datetime.fromtimestamp(order.time_setup, tz=timezone.utc).isoformat() if order.time_setup else None,
                    "open_price": order.price_open,
                }
            else:
                if order.sl and order.sl != 0:
                    orders_by_position[pos_id]["sl"] = order.sl
                if order.tp and order.tp != 0:
                    orders_by_position[pos_id]["tp"] = order.tp

    open_deals_by_position = {}

    if trades_raw is not None:
        for deal in trades_raw:
            deal_dict = {
                "ticket":      deal.ticket,
                "order":       deal.order,
                "time":        datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
                "type":        deal.type,
                "entry":       deal.entry,
                "symbol":      deal.symbol,
                "volume":      deal.volume,
                "price":       deal.price,
                "profit":      deal.profit,
                "commission":  deal.commission,
                "swap":        deal.swap,
                "fee":         deal.fee if hasattr(deal, "fee") else 0,
                "sl":          deal.sl  if hasattr(deal, "sl")  else 0,
                "tp":          deal.tp  if hasattr(deal, "tp")  else 0,
                "comment":     deal.comment,
                "position_id": deal.position_id,
            }
            deals_list.append(deal_dict)

            if deal.entry == 0 and deal.symbol and deal.position_id:
                open_deals_by_position[deal.position_id] = {
                    "time":  datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
                    "price": deal.price,
                    "type":  deal.type,
                }

        for deal in trades_raw:
            if deal.entry == 1 and deal.symbol:
                trade_ticket = deal.ticket
                pos_id       = deal.position_id or deal.ticket
                open_deal    = open_deals_by_position.get(pos_id, {})

                if open_deal:
                    trade_type = "Buy" if open_deal.get("type") == 0 else "Sell" if open_deal.get("type") == 1 else "Other"
                else:
                    trade_type = "Sell" if deal.type == 0 else "Buy" if deal.type == 1 else "Other"

                order_info = orders_by_position.get(pos_id, {})

                if not order_info.get("sl") and deal.order:
                    closing_order = mt5.history_orders_get(ticket=deal.order)
                    if closing_order and len(closing_order) > 0:
                        co = closing_order[0]
                        if co.sl and co.sl != 0:
                            if not order_info:
                                order_info = {"sl": co.sl, "tp": co.tp, "open_time": None, "open_price": None}
                            else:
                                order_info["sl"] = co.sl
                            if co.tp and co.tp != 0:
                                order_info["tp"] = co.tp
                            if order_info.get("sl"):
                                orders_by_position[pos_id] = order_info

                open_time  = order_info.get("open_time")  or open_deal.get("time")
                open_price = order_info.get("open_price") or open_deal.get("price", deal.price)
                final_sl   = order_info.get("sl", 0)
                final_tp   = order_info.get("tp", 0)
                if not final_sl and hasattr(deal, "sl") and deal.sl:
                    final_sl = deal.sl
                if not final_tp and hasattr(deal, "tp") and deal.tp:
                    final_tp = deal.tp
                if not final_sl and pos_id in open_positions_sl:
                    final_sl = open_positions_sl[pos_id].get("sl", 0)
                if not final_tp and pos_id in open_positions_sl:
                    final_tp = open_positions_sl[pos_id].get("tp", 0)

                trades_list.append({
                    "ticket":      trade_ticket,
                    "position_id": pos_id,
                    "symbol":      deal.symbol,
                    "type":        trade_type,
                    "volume":      deal.volume,
                    "open_time":   open_time,
                    "close_time":  datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
                    "open_price":  open_price,
                    "close_price": deal.price,
                    "stop_loss":   final_sl,
                    "take_profit": final_tp,
                    "profit":      deal.profit,
                    "commission":  deal.commission,
                    "swap":        deal.swap,
                    "comment":     deal.comment or "",
                })

    return {
        "success":     True,
        "message":     f"Pulled {len(trades_list)} trades, {len(deals_list)} deals",
        "balance":     balance,
        "equity":      equity,
        "trades":      trades_list,
        "deals":       deals_list,
        "terminal_id": TERMINAL_ID,
    }


def do_candles(symbol: str, timeframe: str, from_time: str, to_time: str, required_subtype: str = None) -> dict:
    global _current_account_str

    tf_map = {
        "M1":  mt5.TIMEFRAME_M1,
        "M5":  mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15,
        "H1":  mt5.TIMEFRAME_H1,
        "H4":  mt5.TIMEFRAME_H4,
        "D1":  mt5.TIMEFRAME_D1,
    }
    tf = tf_map.get(timeframe, mt5.TIMEFRAME_M1)

    try:
        date_from = datetime.fromisoformat(from_time.replace("Z", "+00:00").replace(" ", "T"))
        date_to   = datetime.fromisoformat(to_time.replace("Z",   "+00:00").replace(" ", "T"))
    except:
        return {"success": False, "message": "Invalid date format"}

    # All terminals idle on the hardcoded standard base account.
    # No subtype self-correct needed — just ensure MT5 is initialised.
    if not _ipc_connected:
        if not mt5.initialize(TERMINAL_PATH):
            return {"success": False, "message": "MT5 not initialized"}

    rates = mt5.copy_rates_range(symbol, tf, date_from, date_to)

    if rates is None or len(rates) == 0:
        return {"success": False, "message": f"No candle data for {symbol}", "candles": []}

    candles = [
        {
            "time":   datetime.fromtimestamp(rate[0], tz=timezone.utc).isoformat(),
            "open":   float(rate[1]),
            "high":   float(rate[2]),
            "low":    float(rate[3]),
            "close":  float(rate[4]),
            "volume": int(rate[5]),
        }
        for rate in rates
    ]

    return {"success": True, "candles": candles, "count": len(candles)}


# ==================== MODELS ====================

class VerifyRequest(BaseModel):
    account:  str
    server:   str
    password: str
    api_key:  str


class PullRequest(BaseModel):
    account:          str
    server:           str
    password:         str
    api_key:          str
    from_date:        Optional[str] = None
    orders_from_date: Optional[str] = None


class CandlesRequest(BaseModel):
    symbol:            str
    timeframe:         str = "M1"
    from_time:         str
    to_time:           str
    api_key:           str
    terminal_id:       Optional[int] = None
    required_subtype:  Optional[str] = None


# ==================== ENDPOINTS ====================

@app.get("/health")
def health():
    return {
        "status":               "ok",
        "terminal_id":          TERMINAL_ID,
        "port":                 PORT,
        "ipc_connected":        _ipc_connected,
        "consecutive_failures": _consecutive_failures,
        "home_account":         str(BASE_ACCOUNT),
        "current_account":      _current_account_str,
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
        result = do_candles(req.symbol, req.timeframe, req.from_time, req.to_time, req.required_subtype)
    _schedule_idle_restore()
    return result


# ==================== STARTUP ====================

if __name__ == "__main__":
    print(f"=" * 50)
    print(f"  VPS Worker {TERMINAL_ID} (v8.0 — Fixed Base Account)")
    print(f"  Terminal: {TERMINAL_PATH}")
    print(f"  Port:     {PORT}")
    print(f"  Home:     {BASE_ACCOUNT} @ {BASE_SERVER} (standard)")
    print(f"  Idle:     {IDLE_TIMEOUT}s — always restores to home account")
    print(f"  Heal after: {MAX_FAILURES_BEFORE_HEAL} consecutive failures")
    print(f"=" * 50)

    for attempt in range(10):
        if init_terminal():
            print(f"  [W{TERMINAL_ID}] Ready!")
            break
        print(f"  [W{TERMINAL_ID}] Retry {attempt + 1}/10 in 5s...")
        time.sleep(5)
    else:
        print(f"  [W{TERMINAL_ID}] WARNING: Could not init. Will self-heal on first request.")

    print(f"  [W{TERMINAL_ID}] Starting on port {PORT}...")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
