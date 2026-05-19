"""
WinnerPip VPS Router v5.0 — Request Router with Auto-Failover
Runs on port 8000. Forwards requests to workers on ports 8001-8010.
If a worker fails, automatically retries on another worker.

Endpoints (same as before — drop-in replacement):
  GET  /health         — System health
  POST /verify         — Verify credentials (round-robin)
  POST /pull           — Pull trade data (assigned terminal with failover)
"""

import os
import time
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
import uvicorn

app = FastAPI(title="WinnerPip VPS Router", version="5.0.0")

NUM_WORKERS = 10
WORKER_BASE_PORT = 8001  # Workers on 8001-8010
WORKER_TIMEOUT = 45.0  # seconds

API_KEY = os.environ.get("VPS_API_KEY", "")

# Round-robin counter for /verify
_next_worker = 0

# Track worker health
worker_healthy = [True] * NUM_WORKERS  # Index 0 = Worker 1 (port 8001)


def worker_url(worker_id: int) -> str:
    """Get URL for worker (1-indexed)."""
    return f"http://127.0.0.1:{WORKER_BASE_PORT + worker_id - 1}"


def is_credential_error(message: str) -> bool:
    """Check if error is a definitive credential failure."""
    msg = message.lower()
    return "login failed" in msg or "authorization" in msg or "invalid" in msg


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
    terminal_id: int
    from_date: Optional[str] = None


# ==================== ENDPOINTS ====================

@app.get("/health")
async def health():
    """Check all workers and report status."""
    alive = 0
    healthy_list = []
    unhealthy_list = []

    async with httpx.AsyncClient(timeout=3.0) as client:
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
        "terminals": NUM_WORKERS,
        "alive_workers": alive,
        "healthy_terminals": healthy_list,
        "unhealthy_terminals": unhealthy_list,
    }


@app.post("/verify")
async def verify(req: VerifyRequest):
    """Verify credentials — round-robin across healthy workers with failover."""
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    global _next_worker
    last_error = "All workers failed"

    # Try up to 3 workers
    for attempt in range(3):
        _next_worker = (_next_worker % NUM_WORKERS) + 1
        wid = _next_worker

        # Skip known-unhealthy workers (but still try if all are unhealthy)
        if not worker_healthy[wid - 1] and attempt < 2:
            continue

        try:
            async with httpx.AsyncClient(timeout=WORKER_TIMEOUT) as client:
                resp = await client.post(
                    f"{worker_url(wid)}/verify",
                    json={"account": req.account, "server": req.server, "password": req.password, "api_key": req.api_key},
                )
                data = resp.json()

                if data.get("success"):
                    worker_healthy[wid - 1] = True
                    return data

                # Credential error — definitive, don't retry
                if is_credential_error(data.get("message", "")):
                    return data

                # Worker error — try next
                last_error = data.get("message", "Worker error")
                worker_healthy[wid - 1] = False

        except Exception as e:
            last_error = str(e)[:100]
            worker_healthy[wid - 1] = False

    return {"success": False, "message": last_error}


@app.post("/pull")
async def pull(req: PullRequest):
    """
    Pull trade history with auto-failover.
    Tries assigned terminal first, then fails over to others.
    """
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    if req.terminal_id < 1 or req.terminal_id > NUM_WORKERS:
        raise HTTPException(status_code=400, detail=f"terminal_id must be 1-{NUM_WORKERS}")

    last_error = "All workers failed"
    tried = set()

    # Try assigned worker first, then failover to 2 others
    current = req.terminal_id

    for attempt in range(3):
        tried.add(current)

        try:
            async with httpx.AsyncClient(timeout=WORKER_TIMEOUT) as client:
                resp = await client.post(
                    f"{worker_url(current)}/pull",
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
                    worker_healthy[current - 1] = True
                    data["terminal_used"] = current
                    return data

                # Credential error — don't failover
                if is_credential_error(data.get("message", "")):
                    data["terminal_used"] = current
                    return data

                # Worker error — failover
                last_error = data.get("message", "Worker error")
                worker_healthy[current - 1] = False

        except Exception as e:
            last_error = str(e)[:100]
            worker_healthy[current - 1] = False

        # Find next worker to try
        found = False
        for i in range(1, NUM_WORKERS + 1):
            if i not in tried and worker_healthy[i - 1]:
                current = i
                found = True
                break
        if not found:
            # Try any untried worker
            for i in range(1, NUM_WORKERS + 1):
                if i not in tried:
                    current = i
                    found = True
                    break
        if not found:
            break

    return {"success": False, "message": last_error, "terminal_used": current}


# ==================== STARTUP ====================

if __name__ == "__main__":
    print("=" * 50)
    print("  WinnerPip VPS Router v5.0")
    print("  Auto-Failover Architecture")
    print("=" * 50)
    print(f"  API Key: {API_KEY[:10]}..." if API_KEY else "  WARNING: No API key!")
    print(f"  Workers: {NUM_WORKERS} (ports {WORKER_BASE_PORT}-{WORKER_BASE_PORT + NUM_WORKERS - 1})")
    print(f"  Router port: 8000")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
