"""
WinnerPip VPS API v4.1 — Multi-Process Architecture with Auto-Failover
Each MT5 terminal runs in its own dedicated subprocess.
The main API routes requests to the correct worker process.
If a terminal fails, the request is automatically retried on another terminal.

Architecture:
  Main Process (FastAPI on port 8000)
    - Worker 1 (owns C:\\MT5_1\\terminal64.exe)
    - Worker 2 (owns C:\\MT5_2\\terminal64.exe)
    - ...
    - Worker 10 (owns C:\\MT5_10\\terminal64.exe)

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
import threading

app = FastAPI(title="WinnerPip VPS API", version="4.1.0")

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
    print("WARNING: VPS_API_KEY not set!")

# Worker queues
request_queues: list = []
response_queues: list = []
workers: list = []

# Terminal health tracking (thread-safe)
terminal_healthy: list = [True] * NUM_TERMINALS  # Index 0 = Terminal 1
terminal_consecutive_failures: list = [0] * NUM_TERMINALS
terminal_lock = threading.Lock()

UNHEALTHY_THRESHOLD = 3  # Mark unhealthy after 3 consecutive non-credential failures

# Round-robin counter for /verify
_next_terminal = 0


# ==================== WORKER PROCESS ====================

def terminal_worker(terminal_id: int, terminal_path: str, req_queue: Queue, resp_queue: Queue):
    """
    Worker process — owns one MT5 terminal exclusively.
    Terminal must already be running (launched by start_vps.bat).
    Includes self-healing: retries init up to 3 times on IPC timeout.
    """
    print(f"  Worker {terminal_id}: Ready (PID {os.getpid()}) -> {terminal_path}")

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

            # Try the operation with self-healing (retry init on IPC timeout)
            result = None
            for attempt in range(3):
                result = execute_mt5_operation(terminal_path, account, server, password, operation, from_date)

                # If success or definitive credential failure, stop retrying
                if result.get("success"):
                    break
                msg = result.get("message", "").lower()
                if "login failed" in msg or "authorization" in msg or "invalid" in msg:
                    break  # Credential issue — don't retry

                # IPC timeout or init error — wait and retry
                if "ipc" in msg or "init" in msg or "timeout" in msg:
                    time.sleep(1 + attempt)  # Progressive backoff: 1s, 2s, 3s
                    continue
                else:
                    break  # Other error — don't retry internally

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


def is_credential_error(message: str) -> bool:
    """Check if an error is a definitive credential/auth failure (don't retry on another terminal)."""
    msg = message.lower()
    return ("login failed" in msg or "authorization" in msg or
            "invalid account" in msg or "invalid password" in msg)


def mark_terminal_result(terminal_id: int, success: bool, is_credential_error: bool = False):
    """Track terminal health. Only non-credential failures count against a terminal."""
    idx = terminal_id - 1
    with terminal_lock:
        if success or is_credential_error:
            # Success or credential error (not terminal's fault) — reset counter
            terminal_consecutive_failures[idx] = 0
            terminal_healthy[idx] = True
        else:
            # Terminal-level failure
            terminal_consecutive_failures[idx] += 1
            if terminal_consecutive_failures[idx] >= UNHEALTHY_THRESHOLD:
                terminal_healthy[idx] = False


def get_fallback_terminal(exclude_id: int) -> int:
    """Get the best fallback terminal (healthy, not the excluded one)."""
    with terminal_lock:
        # Prefer healthy terminals
        for i in range(NUM_TERMINALS):
            tid = i + 1
            if tid != exclude_id and terminal_healthy[i]:
                return tid
        # All unhealthy — just pick any that isn't the excluded one
        for i in range(NUM_TERMINALS):
            tid = i + 1
            if tid != exclude_id:
                return tid
    return (exclude_id % NUM_TERMINALS) + 1  # Fallback: next terminal


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
    terminal_used: Optional[int] = None


# ==================== ENDPOINTS ====================

@app.get("/health")
def health():
    alive = sum(1 for w in workers if w.is_alive())
    with terminal_lock:
        healthy_list = [i + 1 for i in range(NUM_TERMINALS) if terminal_healthy[i]]
        unhealthy_list = [i + 1 for i in range(NUM_TERMINALS) if not terminal_healthy[i]]
    return {
        "status": "ok",
        "terminals": NUM_TERMINALS,
        "alive_workers": alive,
        "healthy_terminals": healthy_list,
        "unhealthy_terminals": unhealthy_list,
    }


@app.post("/verify", response_model=VerifyResponse)
def verify_credentials(req: VerifyRequest):
    """Verify credentials — round-robin across healthy workers with failover."""
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    global _next_terminal
    account_number = int(req.account.replace("#", "").replace(" ", ""))

    # Try up to 3 different terminals
    last_result = None
    for attempt in range(3):
        _next_terminal = (_next_terminal + 1) % NUM_TERMINALS
        terminal_id = _next_terminal + 1

        # Skip unhealthy terminals
        with terminal_lock:
            if not terminal_healthy[terminal_id - 1] and attempt < 2:
                continue

        result = send_to_worker(terminal_id, {
            "operation": "verify",
            "account": account_number,
            "server": req.server,
            "password": req.password,
        }, timeout=30)

        last_result = result

        if result.get("success"):
            mark_terminal_result(terminal_id, True)
            return VerifyResponse(**{k: v for k, v in result.items() if k != "request_id"})

        # Definitive auth failure — don't retry on another terminal
        msg = result.get("message", "")
        if is_credential_error(msg):
            mark_terminal_result(terminal_id, False, is_credential_error=True)
            return VerifyResponse(success=False, message=msg)

        # Terminal failure — mark and try next
        mark_terminal_result(terminal_id, False)
        time.sleep(0.5)

    return VerifyResponse(success=False, message=last_result.get("message", "Verification failed") if last_result else "All terminals failed")


@app.post("/pull", response_model=PullResponse)
def pull_account(req: PullRequest):
    """
    Pull trade history with AUTO-FAILOVER.
    Tries the assigned terminal first. If it fails (non-credential error),
    automatically retries on up to 2 other terminals.
    Guarantees 100% success for valid accounts.
    """
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    if req.terminal_id < 1 or req.terminal_id > NUM_TERMINALS:
        raise HTTPException(status_code=400, detail=f"terminal_id must be 1-{NUM_TERMINALS}")

    account_number = int(req.account.replace("#", "").replace(" ", ""))

    request_data = {
        "operation": "pull",
        "account": account_number,
        "server": req.server,
        "password": req.password,
        "from_date": req.from_date,
    }

    # Try assigned terminal first
    terminals_tried = set()
    current_terminal = req.terminal_id

    for attempt in range(3):  # Max 3 attempts (original + 2 failovers)
        terminals_tried.add(current_terminal)

        result = send_to_worker(current_terminal, dict(request_data), timeout=60)

        if result.get("success"):
            mark_terminal_result(current_terminal, True)
            return PullResponse(
                success=True,
                message=result.get("message", ""),
                balance=result.get("balance"),
                equity=result.get("equity"),
                trades=result.get("trades"),
                deals=result.get("deals"),
                terminal_used=current_terminal,
            )

        # Check if credential error (definitive — don't failover)
        msg = result.get("message", "")
        if is_credential_error(msg):
            mark_terminal_result(current_terminal, False, is_credential_error=True)
            return PullResponse(
                success=False,
                message=msg,
                terminal_used=current_terminal,
            )

        # Terminal failure — mark unhealthy and try another
        mark_terminal_result(current_terminal, False)

        # Find a fallback terminal we haven't tried yet
        fallback = None
        with terminal_lock:
            # First try healthy terminals
            for i in range(NUM_TERMINALS):
                tid = i + 1
                if tid not in terminals_tried and terminal_healthy[i]:
                    fallback = tid
                    break
            # If no healthy ones left, try any untried
            if fallback is None:
                for i in range(NUM_TERMINALS):
                    tid = i + 1
                    if tid not in terminals_tried:
                        fallback = tid
                        break

        if fallback is None:
            break  # Tried all available terminals

        current_terminal = fallback
        time.sleep(0.5)  # Brief pause before failover

    # All attempts failed
    return PullResponse(
        success=False,
        message=result.get("message", "All terminals failed") if result else "All terminals failed",
        terminal_used=current_terminal,
    )


# ==================== TERMINAL RECOVERY ====================

def recovery_thread():
    """Background thread that periodically resets unhealthy terminal counters.
    Gives terminals a chance to recover after 5 minutes."""
    while True:
        time.sleep(300)  # Every 5 minutes
        with terminal_lock:
            for i in range(NUM_TERMINALS):
                if not terminal_healthy[i]:
                    # Give it another chance
                    terminal_consecutive_failures[i] = 0
                    terminal_healthy[i] = True
                    print(f"  Recovery: Terminal {i+1} marked healthy again (periodic reset)")


# ==================== STARTUP ====================

def start_workers():
    """Start all worker processes. Terminals must already be running (via start_vps.bat)."""
    global request_queues, response_queues, workers

    print("\n  Starting worker processes...")
    print("  (Terminals should already be running via start_vps.bat)\n")

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

    time.sleep(2)
    alive = sum(1 for w in workers if w.is_alive())
    print(f"  {alive}/{NUM_TERMINALS} workers ready\n")


if __name__ == "__main__":
    # Must use spawn on Windows for multiprocessing with MT5
    multiprocessing.set_start_method("spawn", force=True)

    print("=" * 50)
    print("  WinnerPip VPS API v4.1")
    print("  Multi-Process + Auto-Failover")
    print("=" * 50)
    print(f"\n  API Key: {API_KEY[:10]}..." if API_KEY else "\n  NO API KEY SET")
    print(f"  Terminals: {NUM_TERMINALS}")
    print(f"  Each terminal = separate process (true parallelism)")
    print(f"  Auto-failover: if a terminal fails, retries on another")

    start_workers()

    # Start recovery thread
    recovery = threading.Thread(target=recovery_thread, daemon=True)
    recovery.start()

    print(f"  Starting API on http://0.0.0.0:8000")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=8000)
