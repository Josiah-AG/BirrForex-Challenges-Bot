"""
WinnerPip VPS API v3.0 — Dedicated Terminal Architecture
Each terminal is exclusively assigned via terminal_id parameter.
No lock contention — the scheduler decides which terminal handles which account.

Endpoints:
  POST /verify       — Verify MT5 credentials (rotates terminals)
  POST /pull         — Pull trade history (uses dedicated terminal_id)
  GET  /health       — Health check

Run: python vps/verify_api.py
"""

import MetaTrader5 as mt5
import time
import os
import threading
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn

app = FastAPI(title="WinnerPip VPS API", version="3.0.0")

# Terminal paths
TERMINALS = [
    r"C:\MT5_1\terminal64.exe",
    r"C:\MT5_2\terminal64.exe",
    r"C:\MT5_3\terminal64.exe",
    r"C:\MT5_4\terminal64.exe",
    r"C:\MT5_5\terminal64.exe",
    r"C:\MT5_6\terminal64.exe",
    r"C:\MT5_7\terminal64.exe",
    r"C:\MT5_8\terminal64.exe",
    r"C:\MT5_9\terminal64.exe",
    r"C:\MT5_10\terminal64.exe",
]

# One lock per terminal — ensures only one operation per terminal at a time
terminal_locks = [threading.Lock() for _ in TERMINALS]

# Round-robin for /verify (which doesn't use terminal_id)
_next_terminal = 0
_counter_lock = threading.Lock()

# API key
API_KEY = os.environ.get("VPS_API_KEY", "")
if not API_KEY:
    print("⚠️  WARNING: VPS_API_KEY not set! API will reject all requests.")

# Constants
MAX_VERIFY_RETRIES = 3
RETRY_DELAY = 1.0


# ==================== MODELS ====================

class VerifyRequest(BaseModel):
    account: str
    server: str
    password: str
    api_key: str


class VerifyResponse(BaseModel):
    success: bool
    message: str
    account_name: Optional[str] = None
    balance: Optional[float] = None
    equity: Optional[float] = None
    server: Optional[str] = None


class PullRequest(BaseModel):
    account: str
    server: str
    password: str
    api_key: str
    terminal_id: int  # 1-10, dedicated terminal for this request
    from_date: Optional[str] = None  # ISO format for incremental pull


class PullResponse(BaseModel):
    success: bool
    message: str
    balance: Optional[float] = None
    equity: Optional[float] = None
    trades: Optional[list] = None
    deals: Optional[list] = None


# ==================== HELPERS ====================

def get_next_terminal_index() -> int:
    global _next_terminal
    with _counter_lock:
        idx = _next_terminal
        _next_terminal = (_next_terminal + 1) % len(TERMINALS)
    return idx


def execute_on_terminal(terminal_idx: int, account: int, server: str, password: str,
                        operation: str = "verify", from_date=None):
    """
    Execute an operation on a specific terminal.
    Acquires the terminal's lock, initializes, logs in, performs operation, shuts down.
    """
    if terminal_idx < 0 or terminal_idx >= len(TERMINALS):
        return {"success": False, "message": f"Invalid terminal_id: {terminal_idx + 1}"}

    terminal_path = TERMINALS[terminal_idx]
    lock = terminal_locks[terminal_idx]

    # Wait for terminal to be free (up to 60s for pulls)
    timeout = 60 if operation == "pull" else 15
    acquired = lock.acquire(timeout=timeout)
    if not acquired:
        return {"success": False, "message": f"Terminal {terminal_idx + 1} busy (timeout)"}

    try:
        # Clean shutdown of any previous state
        try:
            mt5.shutdown()
        except:
            pass
        time.sleep(0.3)

        # Initialize
        if not mt5.initialize(terminal_path):
            error = mt5.last_error()
            return {"success": False, "message": f"MT5 terminal error: {error}"}

        time.sleep(0.3)

        # Login
        if not mt5.login(account, password=password, server=server):
            error = mt5.last_error()
            mt5.shutdown()
            return {"success": False, "message": f"MT5 terminal error: {error}"}

        # === VERIFY OPERATION ===
        if operation == "verify":
            account_info = mt5.account_info()
            mt5.shutdown()
            if not account_info:
                return {"success": False, "message": "Could not retrieve account info"}
            return {
                "success": True,
                "message": "Credentials verified successfully",
                "account_name": account_info.name,
                "balance": account_info.balance,
                "equity": account_info.equity,
                "server": account_info.server,
            }

        # === PULL OPERATION ===
        elif operation == "pull":
            account_info = mt5.account_info()
            balance = account_info.balance if account_info else 0
            equity = account_info.equity if account_info else 0

            # Date range
            if from_date:
                try:
                    date_from = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
                    date_from = date_from - timedelta(hours=1)  # 1hr overlap buffer
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
                        "fee": deal.fee if hasattr(deal, 'fee') else 0,
                        "comment": deal.comment,
                        "position_id": deal.position_id,
                    }
                    deals_list.append(deal_dict)

                    # Closing deals = trades (entry == 1 means OUT)
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

    except Exception as e:
        try:
            mt5.shutdown()
        except:
            pass
        return {"success": False, "message": f"Exception: {str(e)}"}
    finally:
        lock.release()


# ==================== ENDPOINTS ====================

@app.get("/health")
def health():
    available = sum(1 for lock in terminal_locks if not lock.locked())
    return {"status": "ok", "terminals": len(TERMINALS), "available": available}


@app.post("/verify", response_model=VerifyResponse)
def verify_credentials(req: VerifyRequest):
    """Verify credentials — rotates across terminals with retry."""
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    account_number = int(req.account.replace("#", "").replace(" ", ""))

    for attempt in range(MAX_VERIFY_RETRIES):
        idx = get_next_terminal_index()
        result = execute_on_terminal(idx, account_number, req.server, req.password, "verify")

        if result["success"]:
            return VerifyResponse(**result)

        # Definitive failure — don't retry
        msg = result["message"].lower()
        if "invalid account" in msg or "no connection" in msg:
            return VerifyResponse(**result)

        # Terminal issue — retry on different terminal
        if attempt < MAX_VERIFY_RETRIES - 1:
            time.sleep(RETRY_DELAY)

    return VerifyResponse(success=False, message=result.get("message", "Verification failed"))


@app.post("/pull", response_model=PullResponse)
def pull_account(req: PullRequest):
    """
    Pull trade history using a DEDICATED terminal.
    The scheduler assigns terminal_id (1-10) to avoid contention.
    """
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    if req.terminal_id < 1 or req.terminal_id > len(TERMINALS):
        raise HTTPException(status_code=400, detail=f"terminal_id must be 1-{len(TERMINALS)}")

    account_number = int(req.account.replace("#", "").replace(" ", ""))
    terminal_idx = req.terminal_id - 1  # Convert to 0-based index

    result = execute_on_terminal(
        terminal_idx, account_number, req.server, req.password,
        "pull", req.from_date
    )

    return PullResponse(
        success=result.get("success", False),
        message=result.get("message", ""),
        balance=result.get("balance"),
        equity=result.get("equity"),
        trades=result.get("trades"),
        deals=result.get("deals"),
    )


# ==================== MAIN ====================

if __name__ == "__main__":
    print("=" * 50)
    print("  WinnerPip VPS API v3.0")
    print("  Dedicated Terminal Architecture")
    print("=" * 50)
    print(f"\n  API Key: {API_KEY[:10]}..." if API_KEY else "\n  ⚠️  NO API KEY SET")
    print(f"  Terminals: {len(TERMINALS)}")
    print(f"\n  /verify — rotates terminals (for registration)")
    print(f"  /pull   — dedicated terminal_id (for scheduled pulls)")
    print(f"\n  Starting on http://0.0.0.0:8000")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=8000)
