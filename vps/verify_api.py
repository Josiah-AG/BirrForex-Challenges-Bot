"""
WinnerPip VPS API — Credential Verification & Trade Pull Service
Runs on the Windows VPS with MT5 terminals installed.

Endpoints:
  POST /verify  — Verify MT5 credentials (account + server + investor password)
  GET  /health  — Health check

Run: python vps/verify_api.py

IMPORTANT: MT5 Python library is NOT thread-safe. We use a lock per terminal
and rotate across multiple terminals to handle concurrent requests.
"""

import MetaTrader5 as mt5
import time
import os
import threading
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

app = FastAPI(title="WinnerPip VPS API", version="2.0.0")

# Terminal paths — rotate across these for verification
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

# One lock per terminal to prevent concurrent access
terminal_locks = [threading.Lock() for _ in TERMINALS]

# Round-robin counter
_next_terminal = 0
_counter_lock = threading.Lock()

# API key for security — MUST be set via environment variable
API_KEY = os.environ.get("VPS_API_KEY", "")

if not API_KEY:
    print("=" * 50)
    print("  ⚠️  WARNING: VPS_API_KEY not set!")
    print("  The API will reject all requests.")
    print("  Set it: set VPS_API_KEY=your-key (Windows)")
    print("=" * 50)

# Max retries across different terminals
MAX_RETRIES = 3
RETRY_DELAY = 1.0  # seconds between retries


class VerifyRequest(BaseModel):
    account: str
    server: str
    password: str
    api_key: str


class VerifyResponse(BaseModel):
    success: bool
    message: str
    account_name: str | None = None
    balance: float | None = None
    equity: float | None = None
    server: str | None = None


def get_next_terminal_index() -> int:
    """Round-robin terminal selection"""
    global _next_terminal
    with _counter_lock:
        idx = _next_terminal
        _next_terminal = (_next_terminal + 1) % len(TERMINALS)
    return idx


def try_verify_on_terminal(terminal_path: str, lock: threading.Lock,
                           account: int, server: str, password: str) -> VerifyResponse:
    """
    Attempt verification on a specific terminal.
    Uses a lock to ensure only one request uses a terminal at a time.
    """
    acquired = lock.acquire(timeout=10)  # Wait max 10s for this terminal
    if not acquired:
        return VerifyResponse(
            success=False,
            message="Terminal busy (lock timeout)",
        )

    try:
        # Shutdown any previous connection first
        try:
            mt5.shutdown()
        except:
            pass

        # Small delay to let terminal settle
        time.sleep(0.2)

        # Initialize terminal
        if not mt5.initialize(terminal_path):
            error = mt5.last_error()
            return VerifyResponse(
                success=False,
                message=f"MT5 terminal error: {error}",
            )

        # Small delay after init
        time.sleep(0.3)

        # Attempt login
        if not mt5.login(account, password=password, server=server):
            error = mt5.last_error()
            mt5.shutdown()
            return VerifyResponse(
                success=False,
                message=f"MT5 terminal error: {error}",
            )

        # Get account info
        account_info = mt5.account_info()
        if not account_info:
            mt5.shutdown()
            return VerifyResponse(
                success=False,
                message="Could not retrieve account info",
            )

        result = VerifyResponse(
            success=True,
            message="Credentials verified successfully",
            account_name=account_info.name,
            balance=account_info.balance,
            equity=account_info.equity,
            server=account_info.server,
        )

        mt5.shutdown()
        return result

    except Exception as e:
        try:
            mt5.shutdown()
        except:
            pass
        return VerifyResponse(
            success=False,
            message=f"Exception: {str(e)}",
        )
    finally:
        lock.release()


@app.get("/health")
def health():
    """Health check — reports number of available terminals"""
    available = sum(1 for lock in terminal_locks if not lock.locked())
    return {"status": "ok", "terminals": len(TERMINALS), "available": available}


@app.post("/verify", response_model=VerifyResponse)
def verify_credentials(req: VerifyRequest):
    """
    Verify MT5 credentials by attempting to login.
    Rotates across terminals and retries on failure.
    """

    # Check API key
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    account_number = int(req.account.replace("#", "").replace(" ", ""))

    # Try up to MAX_RETRIES times on different terminals
    last_error = None
    for attempt in range(MAX_RETRIES):
        idx = get_next_terminal_index()
        terminal_path = TERMINALS[idx]
        lock = terminal_locks[idx]

        result = try_verify_on_terminal(
            terminal_path, lock, account_number, req.server, req.password
        )

        if result.success:
            return result

        last_error = result.message

        # If it's a definitive "wrong password" error (not terminal issue), don't retry
        error_lower = result.message.lower()
        if "invalid account" in error_lower or "no connection" in error_lower:
            # These are definitive — no point retrying
            return result

        # Terminal error — retry on a different terminal
        if attempt < MAX_RETRIES - 1:
            time.sleep(RETRY_DELAY)

    # All retries exhausted
    return VerifyResponse(
        success=False,
        message=last_error or "Verification failed after retries",
    )


if __name__ == "__main__":
    print("=" * 50)
    print("  WinnerPip VPS API v2.0")
    print("  Credential Verification Service")
    print("=" * 50)
    print(f"\n  API Key: {API_KEY[:10]}...")
    print(f"  Terminals: {len(TERMINALS)}")
    print(f"  Max retries: {MAX_RETRIES}")
    print(f"\n  Starting on http://0.0.0.0:8000")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=8000)
