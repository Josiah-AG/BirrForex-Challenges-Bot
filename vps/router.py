"""
WinnerPip VPS Router v6.3 — Smart Retry + Auto-Failover
Runs on port 8000. Forwards requests to workers on ports 8001-8010.

Retry logic:
  - Credential errors (wrong password) → return immediately, no retry
  - Terminal/IPC errors → retry on same terminal (2s delay)
  - After failing on one terminal → try a different terminal
  - After failing on 3 DIFFERENT terminals → mark as failed, return error

Endpoints:
  GET  /health         — System health
  POST /verify         — Verify credentials (round-robin with smart retry)
  POST /pull           — Pull trade data (smart retry across 3 terminals)
"""

import os
import asyncio
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn

app = FastAPI(title="WinnerPip VPS Router", version="6.3.0")

NUM_WORKERS = 10
WORKER_BASE_PORT = 8001  # Workers on 8001-8010
WORKER_TIMEOUT = 90.0  # seconds per request
RETRY_DELAY = 2.0  # seconds between retries on same terminal
MAX_RETRIES_SAME_TERMINAL = 2  # retries on same terminal before switching
MAX_DIFFERENT_TERMINALS = 3  # fail after trying this many different terminals

API_KEY = os.environ.get("VPS_API_KEY", "")

# Round-robin counter for /verify
_next_worker = 0

# Track worker health
worker_healthy = [True] * NUM_WORKERS  # Index 0 = Worker 1 (port 8001)


def worker_url(worker_id: int) -> str:
    """Get URL for worker (1-indexed)."""
    return f"http://127.0.0.1:{WORKER_BASE_PORT + worker_id - 1}"


def is_credential_error(message: str) -> bool:
    """Check if error is a definitive credential failure (don't retry)."""
    msg = message.lower()
    return any(x in msg for x in [
        "login failed",
        "invalid account",
        "wrong password",
        "account not found",
    ])


def is_terminal_error(message: str) -> bool:
    """Check if error is a terminal/IPC issue (should retry)."""
    msg = message.lower()
    return any(x in msg for x in [
        "authorization failed",
        "init error",
        "init failed",
        "reconnect failed",
        "ipc",
        "timeout",
        "not connected",
    ])


def get_next_healthy_worker(exclude: set) -> int:
    """Get next healthy worker not in exclude set. Returns 0 if none available."""
    # Try healthy workers first
    for i in range(1, NUM_WORKERS + 1):
        if i not in exclude and worker_healthy[i - 1]:
            return i
    # Try any worker not in exclude
    for i in range(1, NUM_WORKERS + 1):
        if i not in exclude:
            return i
    return 0


# ==================== MODELS ====================

class VerifyRequest(BaseModel):
    account: str
    server: str
    password: str
    api_key: str
    terminal_id: Optional[int] = None


class PullRequest(BaseModel):
    account: str
    server: str
    password: str
    api_key: str
    terminal_id: Optional[int] = None
    from_date: Optional[str] = None


class CandlesRequest(BaseModel):
    symbol: str
    timeframe: str = "M1"
    from_time: str
    to_time: str
    api_key: str
    terminal_id: Optional[int] = None


# ==================== ENDPOINTS ====================

@app.get("/health")
async def health():
    """Check all workers and report status."""
    alive = 0
    healthy_list = []
    unhealthy_list = []

    async with httpx.AsyncClient(timeout=5.0) as client:
        for i in range(1, NUM_WORKERS + 1):
            try:
                resp = await client.get(f"{worker_url(i)}/health")
                if resp.status_code == 200:
                    alive += 1
                    healthy_list.append(i)
                    worker_healthy[i - 1] = True
                else:
                    unhealthy_list.append(i)
                    worker_healthy[i - 1] = False
            except:
                unhealthy_list.append(i)
                worker_healthy[i - 1] = False

    return {
        "status": "ok" if alive > 0 else "degraded",
        "version": "6.3.0",
        "terminals": NUM_WORKERS,
        "alive_workers": alive,
        "healthy_terminals": healthy_list,
        "unhealthy_terminals": unhealthy_list,
    }


@app.post("/verify")
async def verify(req: VerifyRequest):
    """
    Verify credentials with smart retry:
    - If terminal_id specified: target that specific terminal (for health checks)
    - Credential error → return immediately
    - Terminal error → retry same terminal, then try different ones
    - Fails on 3 different terminals → return failure
    """
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    global _next_worker
    tried_terminals = set()
    last_error = "All workers failed"

    # If terminal_id specified, target that specific terminal only (no failover)
    if req.terminal_id and 1 <= req.terminal_id <= NUM_WORKERS:
        wid = req.terminal_id
        for retry in range(MAX_RETRIES_SAME_TERMINAL + 1):
            try:
                async with httpx.AsyncClient(timeout=WORKER_TIMEOUT) as client:
                    resp = await client.post(
                        f"{worker_url(wid)}/verify",
                        json={
                            "account": req.account,
                            "server": req.server,
                            "password": req.password,
                            "api_key": req.api_key,
                        },
                    )
                    data = resp.json()
                    data["terminal_used"] = wid
                    data["retries"] = retry
                    data["terminals_tried"] = 1
                    return data
            except Exception as e:
                if retry < MAX_RETRIES_SAME_TERMINAL:
                    await asyncio.sleep(RETRY_DELAY)
                    continue
                return {"success": False, "message": f"Terminal {wid}: {str(e)[:200]}", "terminal_used": wid}
        return {"success": False, "message": f"Terminal {wid} failed after retries", "terminal_used": wid}

    # Normal round-robin with failover
    # Try up to MAX_DIFFERENT_TERMINALS different terminals
    while len(tried_terminals) < MAX_DIFFERENT_TERMINALS:
        # Pick next terminal
        _next_worker = (_next_worker % NUM_WORKERS) + 1
        wid = _next_worker

        # Skip already-tried terminals
        if wid in tried_terminals:
            wid = get_next_healthy_worker(tried_terminals)
            if wid == 0:
                break

        tried_terminals.add(wid)

        # Try this terminal with retries
        for retry in range(MAX_RETRIES_SAME_TERMINAL + 1):
            try:
                async with httpx.AsyncClient(timeout=WORKER_TIMEOUT) as client:
                    resp = await client.post(
                        f"{worker_url(wid)}/verify",
                        json={
                            "account": req.account,
                            "server": req.server,
                            "password": req.password,
                            "api_key": req.api_key,
                        },
                    )
                    data = resp.json()

                    if data.get("success"):
                        worker_healthy[wid - 1] = True
                        data["terminal_used"] = wid
                        data["retries"] = retry
                        data["terminals_tried"] = len(tried_terminals)
                        return data

                    # Credential error — definitive, don't retry anywhere
                    if is_credential_error(data.get("message", "")):
                        data["terminal_used"] = wid
                        data["error_type"] = "credential"
                        return data

                    # Terminal error — retry on same terminal
                    last_error = data.get("message", "Worker error")
                    if is_terminal_error(last_error) and retry < MAX_RETRIES_SAME_TERMINAL:
                        await asyncio.sleep(RETRY_DELAY)
                        continue

                    # Other error or max retries on this terminal — try next terminal
                    worker_healthy[wid - 1] = False
                    break

            except Exception as e:
                last_error = str(e)[:200]
                worker_healthy[wid - 1] = False
                if retry < MAX_RETRIES_SAME_TERMINAL:
                    await asyncio.sleep(RETRY_DELAY)
                    continue
                break

    return {
        "success": False,
        "message": last_error,
        "error_type": "terminal",
        "terminals_tried": len(tried_terminals),
    }


@app.post("/pull")
async def pull(req: PullRequest):
    """
    Pull trade history with smart retry:
    - Credential error → return immediately
    - Terminal error → retry same terminal (2s delay), then try different ones
    - Fails on 3 different terminals → return failure
    """
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    tried_terminals = set()
    last_error = "All workers failed"

    # Start with assigned terminal if provided, otherwise round-robin
    if req.terminal_id and 1 <= req.terminal_id <= NUM_WORKERS:
        first_terminal = req.terminal_id
    else:
        global _next_worker
        _next_worker = (_next_worker % NUM_WORKERS) + 1
        first_terminal = _next_worker

    current_terminal = first_terminal

    # Try up to MAX_DIFFERENT_TERMINALS different terminals
    while len(tried_terminals) < MAX_DIFFERENT_TERMINALS:
        tried_terminals.add(current_terminal)

        # Try this terminal with retries
        for retry in range(MAX_RETRIES_SAME_TERMINAL + 1):
            try:
                async with httpx.AsyncClient(timeout=WORKER_TIMEOUT) as client:
                    resp = await client.post(
                        f"{worker_url(current_terminal)}/pull",
                        json={
                            "account": req.account,
                            "server": req.server,
                            "password": req.password,
                            "api_key": req.api_key,
                            "from_date": req.from_date,
                        },
                    )
                    data = resp.json()

                    if data.get("success"):
                        worker_healthy[current_terminal - 1] = True
                        data["terminal_used"] = current_terminal
                        data["retries"] = retry
                        data["terminals_tried"] = len(tried_terminals)
                        return data

                    # Credential error — definitive, don't retry
                    if is_credential_error(data.get("message", "")):
                        data["terminal_used"] = current_terminal
                        data["error_type"] = "credential"
                        return data

                    # Terminal error — retry on same terminal
                    last_error = data.get("message", "Worker error")
                    if is_terminal_error(last_error) and retry < MAX_RETRIES_SAME_TERMINAL:
                        await asyncio.sleep(RETRY_DELAY)
                        continue

                    # Other error or max retries — try next terminal
                    worker_healthy[current_terminal - 1] = False
                    break

            except Exception as e:
                last_error = str(e)[:200]
                worker_healthy[current_terminal - 1] = False
                if retry < MAX_RETRIES_SAME_TERMINAL:
                    await asyncio.sleep(RETRY_DELAY)
                    continue
                break

        # Find next terminal to try
        next_t = get_next_healthy_worker(tried_terminals)
        if next_t == 0:
            break
        current_terminal = next_t

    return {
        "success": False,
        "message": last_error,
        "error_type": "terminal",
        "terminals_tried": len(tried_terminals),
        "terminal_used": current_terminal,
    }


# ==================== CANDLES ENDPOINT ====================

@app.post("/api/v1/candles")
async def get_candles(req: CandlesRequest):
    """Fetch M1 candle data — routes to any healthy worker."""
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Pick a healthy worker (any will do — candles use base account)
    wid = req.terminal_id if req.terminal_id and 1 <= req.terminal_id <= NUM_WORKERS else 1
    for i in range(NUM_WORKERS):
        candidate = ((wid - 1 + i) % NUM_WORKERS) + 1
        if worker_healthy[candidate - 1]:
            wid = candidate
            break

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{worker_url(wid)}/candles",
                json={
                    "symbol": req.symbol,
                    "timeframe": req.timeframe,
                    "from_time": req.from_time,
                    "to_time": req.to_time,
                    "api_key": req.api_key,
                },
            )
            return resp.json()
    except Exception as e:
        return {"success": False, "message": f"Candles fetch error: {str(e)[:200]}"}


# ==================== STARTUP ====================

if __name__ == "__main__":
    print("=" * 50)
    print("  WinnerPip VPS Router v6.3")
    print("  Smart Retry + Auto-Failover")
    print("=" * 50)
    print(f"  API Key: {'SET (' + API_KEY[:8] + '...)' if API_KEY else 'NOT SET — WARNING!'}")
    print(f"  Workers: {NUM_WORKERS} (ports {WORKER_BASE_PORT}-{WORKER_BASE_PORT + NUM_WORKERS - 1})")
    print(f"  Router port: 8000")
    print(f"  Timeout: {WORKER_TIMEOUT}s per request")
    print(f"  Retry: {MAX_RETRIES_SAME_TERMINAL}x same terminal, then try {MAX_DIFFERENT_TERMINALS} different terminals")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
