"""
WinnerPip VPS API v4.0 — Multi-Process Architecture
Each MT5 terminal runs in its own dedicated subprocess.
The main API routes requests to the correct worker process.

This solves the MT5 Python library limitation: only ONE terminal per process.

Architecture:
  Main Process (FastAPI on port 8000)
    ├── Worker 1 (owns C:\MT5_1\terminal64.exe)
    ├── Worker 2 (owns C:\MT5_2\terminal64.exe)
    ├── ...
    └── Worker 10 (owns C:\MT5_10\terminal64.exe)

Each worker has its own request queue and response queue.
No shared MT5 state. No lock contention. True parallelism.

Run: python vps/verify_api.py
"""

import MetaTrader5 as mt5
import time
import os
import multiprocessing
from multiprocessing import Process, Queue
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn
import queue as queue_module

app = FastAPI(title="WinnerPip VPS API", version="4.0.0")

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

NUM_TERMINALS = len(TERMINALS)

# API key
API_KEY = os.environ.get("VPS_API_KEY", "")
if not API_KEY:
    print("⚠️  WARNING: VPS_API_KEY not set!")

# Worker queues: request_queues[i] sends work TO worker i, response_queues[i] gets results FROM worker i
request_queues: list = []
response_queues: list = []
workers: list = []

# Round-robin counter for /verify
_next_terminal = 0


# ==================== WORKER PROCESS ====================

def terminal_worker(terminal_id: int, terminal_path: str, req_queue: Queue, resp_queue: Queue):
    """
    Worker process — owns one MT5 terminal exclusively.
    Initializes the terminal at startup and keeps it running.
    """
    print(f"  Worker {terminal_id}: Starting (PID {os.getpid()}) → {terminal_path}")

    # Initialize terminal at startup — this launches the MT5 exe if not running
    max_init_attempts = 3
    initialized = False
    for attempt in range(max_init_attempts):
        if mt5.initialize(terminal_path):
            initialized = True
            print(f"  Worker {terminal_id}: ✅ Terminal initialized")
            break
        else:
            error = mt5.last_error()
            print(f"  Worker {terminal_id}: Init attempt {attempt+1} failed: {error}")
            time.sleep(5)  # Wait for terminal to start

    if not initialized:
        print(f"  Worker {terminal_id}: ❌ FAILED to initialize after {max_init_attempts} attempts")
        # Still run the loop — will try to re-initialize on each request
    else:
        # Shutdown after init — terminal stays running in background
        mt5.shutdown()

    # Wait a moment for terminal to stabilize
    time.sleep(2)

    while True:
        try:
            request = req_queue.get()
            if request is None:
                break

            request_id = request.get("request_id")
            operation = request.get("operation", "verify")
            account = request.get("account")
            server = request.get("server")
            password = request.get("password")
            from_date = request.get("from_date")

            result = execute_mt5_operation(terminal_path, account, server, password, operation, from_date)
            result["request_id"] = request_id
            resp_queue.put(result)

        except Exception as e:
            resp_queue.put({"request_id": request.get("request_id", ""), "success": False, "message": f"Worker error: {e}"})


def execute_mt5_operation(terminal_path: str, account: int, server: str, password: str,
                          operation: str = "verify", from_date=None) -> dict:
    """Execute a single MT5 operation (verify or pull) on the dedicated terminal."""

    # Shutdown any previous state
    try:
        mt5.shutdown()
    except:
        pass
    time.sleep(0.2)

    # Initialize terminal
    if not mt5.initialize(terminal_path):
        error = mt5.last_error()
        return {"success": False, "message": f"MT5 init error: {error}"}

    time.sleep(0.2)

    # Login
    if not mt5.login(account, password=password, server=server):
        error = mt5.last_error()
        mt5.shutdown()
        return {"success": False, "message": f"Login failed: {error}"}

    # === VERIFY ===
    if operation == "verify":
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

    # === PULL ===
    elif operation == "pull":
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
                    "fee": deal.fee if hasattr(deal, 'fee') else 0,
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

    mt5.shutdown()
    return {"success": False, "message": f"Unknown operation: {operation}"}


# ==================== API HELPERS ====================

def send_to_worker(terminal_id: int, request: dict, timeout: float = 60) -> dict:
    """Send a request to a specific worker and wait for response."""
    import uuid
    request_id = str(uuid.uuid4())
    request["request_id"] = request_id

    idx = terminal_id - 1  # Convert to 0-based
    if idx < 0 or idx >= NUM_TERMINALS:
        return {"success": False, "message": f"Invalid terminal_id: {terminal_id}"}

    request_queues[idx].put(request)

    # Wait for response
    try:
        result = response_queues[idx].get(timeout=timeout)
        return result
    except queue_module.Empty:
        return {"success": False, "message": f"Terminal {terminal_id} timeout ({timeout}s)"}


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
    terminal_id: int
    from_date: Optional[str] = None


class PullResponse(BaseModel):
    success: bool
    message: str
    balance: Optional[float] = None
    equity: Optional[float] = None
    trades: Optional[list] = None
    deals: Optional[list] = None


# ==================== ENDPOINTS ====================

@app.get("/health")
def health():
    alive = sum(1 for w in workers if w.is_alive())
    return {"status": "ok", "terminals": NUM_TERMINALS, "alive_workers": alive}


@app.post("/verify", response_model=VerifyResponse)
def verify_credentials(req: VerifyRequest):
    """Verify credentials — round-robin across workers."""
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    global _next_terminal
    account_number = int(req.account.replace("#", "").replace(" ", ""))

    # Try up to 3 different terminals
    for attempt in range(3):
        _next_terminal = (_next_terminal + 1) % NUM_TERMINALS
        terminal_id = _next_terminal + 1

        result = send_to_worker(terminal_id, {
            "operation": "verify",
            "account": account_number,
            "server": req.server,
            "password": req.password,
        }, timeout=30)

        if result.get("success"):
            return VerifyResponse(**{k: v for k, v in result.items() if k != "request_id"})

        # Definitive auth failure — don't retry
        msg = result.get("message", "").lower()
        if "login failed" in msg and "authorization" not in msg:
            return VerifyResponse(success=False, message=result.get("message", ""))

        time.sleep(0.5)

    return VerifyResponse(success=False, message=result.get("message", "Verification failed"))


@app.post("/pull", response_model=PullResponse)
def pull_account(req: PullRequest):
    """Pull trade history on a DEDICATED terminal (no contention)."""
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    if req.terminal_id < 1 or req.terminal_id > NUM_TERMINALS:
        raise HTTPException(status_code=400, detail=f"terminal_id must be 1-{NUM_TERMINALS}")

    account_number = int(req.account.replace("#", "").replace(" ", ""))

    result = send_to_worker(req.terminal_id, {
        "operation": "pull",
        "account": account_number,
        "server": req.server,
        "password": req.password,
        "from_date": req.from_date,
    }, timeout=60)

    return PullResponse(
        success=result.get("success", False),
        message=result.get("message", ""),
        balance=result.get("balance"),
        equity=result.get("equity"),
        trades=result.get("trades"),
        deals=result.get("deals"),
    )


# ==================== STARTUP ====================

def start_workers():
    """Start all worker processes — each will initialize its MT5 terminal."""
    global request_queues, response_queues, workers

    print("\n  Starting worker processes (each will launch its MT5 terminal)...")
    print("  This may take 20-30 seconds for all terminals to connect...\n")

    for i in range(NUM_TERMINALS):
        req_q = Queue()
        resp_q = Queue()
        request_queues.append(req_q)
        response_queues.append(resp_q)

        p = Process(
            target=terminal_worker,
            args=(i + 1, TERMINALS[i], req_q, resp_q),
            daemon=True,
        )
        p.start()
        workers.append(p)
        # Stagger worker starts to avoid all terminals launching simultaneously
        time.sleep(3)

    # Give terminals time to fully connect to broker
    print("\n  Waiting for terminals to connect to broker...")
    time.sleep(10)

    alive = sum(1 for w in workers if w.is_alive())
    print(f"\n  ✅ {alive}/{NUM_TERMINALS} workers alive and ready\n")


if __name__ == "__main__":
    # Must use spawn on Windows for multiprocessing with MT5
    multiprocessing.set_start_method("spawn", force=True)

    print("=" * 50)
    print("  WinnerPip VPS API v4.0")
    print("  Multi-Process Architecture")
    print("=" * 50)
    print(f"\n  API Key: {API_KEY[:10]}..." if API_KEY else "\n  ⚠️  NO API KEY SET")
    print(f"  Terminals: {NUM_TERMINALS}")
    print(f"  Each terminal = separate process (true parallelism)")

    start_workers()

    print(f"  Starting API on http://0.0.0.0:8000")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=8000)
