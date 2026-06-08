"""
WinnerPip VPS Router v7.0 — Subtype-Aware Candle Routing + Smart Retry
Runs on port 8000. Forwards requests to workers on ports 8001-8010.

New in v7.0:
- POST /configure: TG Bot assigns proportional home accounts to terminals
  Router updates its terminal_subtype_map and forwards to each worker
- Candle requests route to terminals whose home subtype matches required_subtype
  Automatically retries next same-subtype terminal on failure
- Pull/verify routing unchanged (round-robin, all terminals)
"""

import os
import asyncio
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uvicorn

app = FastAPI(title="WinnerPip VPS Router", version="7.0.0")

NUM_WORKERS      = 10
WORKER_BASE_PORT = 8001
WORKER_TIMEOUT   = 120.0
RETRY_DELAY      = 2.0
MAX_RETRIES_SAME_TERMINAL  = 2
MAX_DIFFERENT_TERMINALS    = 3

API_KEY = os.environ.get("VPS_API_KEY", "")

_next_worker   = 0
worker_healthy = [True] * NUM_WORKERS

# Tracks the home subtype of each worker (index 0 = worker 1)
# Updated by /configure when TG Bot assigns home accounts
terminal_subtype_map = ["standard"] * NUM_WORKERS


def worker_url(worker_id: int) -> str:
    return f"http://127.0.0.1:{WORKER_BASE_PORT + worker_id - 1}"


def is_credential_error(message: str) -> bool:
    msg = message.lower()
    return any(x in msg for x in ["login failed", "invalid account", "wrong password", "account not found"])


def is_terminal_error(message: str) -> bool:
    msg = message.lower()
    return any(x in msg for x in ["authorization failed", "init error", "init failed",
                                   "reconnect failed", "ipc", "timeout", "not connected"])


def get_next_healthy_worker(exclude: set) -> int:
    for i in range(1, NUM_WORKERS + 1):
        if i not in exclude and worker_healthy[i - 1]:
            return i
    for i in range(1, NUM_WORKERS + 1):
        if i not in exclude:
            return i
    return 0


def get_candidates_for_subtype(required_subtype: str) -> list:
    """Return ordered list of terminal IDs to try for a given subtype."""
    if not required_subtype or required_subtype in ("standard", "unknown", ""):
        # Any healthy terminal works for standard
        candidates = [i for i in range(1, NUM_WORKERS + 1) if worker_healthy[i - 1]]
        if not candidates:
            candidates = list(range(1, NUM_WORKERS + 1))
        return candidates

    # Prefer terminals assigned to this specific subtype (healthy first)
    assigned_healthy   = [i for i in range(1, NUM_WORKERS + 1)
                          if terminal_subtype_map[i - 1] == required_subtype and worker_healthy[i - 1]]
    assigned_unhealthy = [i for i in range(1, NUM_WORKERS + 1)
                          if terminal_subtype_map[i - 1] == required_subtype and not worker_healthy[i - 1]]
    # Fallback: any healthy terminal (worker will self-correct login before fetching)
    other_healthy      = [i for i in range(1, NUM_WORKERS + 1)
                          if terminal_subtype_map[i - 1] != required_subtype and worker_healthy[i - 1]]

    return assigned_healthy + assigned_unhealthy + other_healthy


# ==================== MODELS ====================

class VerifyRequest(BaseModel):
    account:     str
    server:      str
    password:    str
    api_key:     str
    terminal_id: Optional[int] = None


class PullRequest(BaseModel):
    account:          str
    server:           str
    password:         str
    api_key:          str
    terminal_id:      Optional[int] = None
    from_date:        Optional[str] = None
    orders_from_date: Optional[str] = None


class CandlesRequest(BaseModel):
    symbol:           str
    timeframe:        str = "M1"
    from_time:        str
    to_time:          str
    api_key:          str
    terminal_id:      Optional[int] = None
    required_subtype: Optional[str] = None


class ConfigureRequest(BaseModel):
    api_key:        str
    terminals:      Dict[str, Any]   # {terminal_id_str: {subtype, account, server, password}}
    tg_bot_url:     Optional[str] = None
    tg_bot_api_key: Optional[str] = None
    challenge_id:   Optional[str] = None


# ==================== ENDPOINTS ====================

@app.get("/health")
async def health():
    alive         = 0
    healthy_list  = []
    unhealthy_list= []
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
        "status":               "ok" if alive > 0 else "degraded",
        "version":              "7.0.0",
        "terminals":            NUM_WORKERS,
        "alive_workers":        alive,
        "healthy_terminals":    healthy_list,
        "unhealthy_terminals":  unhealthy_list,
        "terminal_subtype_map": {str(i + 1): terminal_subtype_map[i] for i in range(NUM_WORKERS)},
    }


@app.post("/configure")
async def configure(req: ConfigureRequest):
    """
    Called by TG Bot at start of each pull cycle.
    Updates terminal_subtype_map and forwards /set-home-account to each worker.
    """
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Update local subtype map
    for tid_str, info in req.terminals.items():
        tid = int(tid_str)
        if 1 <= tid <= NUM_WORKERS:
            terminal_subtype_map[tid - 1] = info.get("subtype", "standard")

    # Forward set-home-account to each worker
    results = {}
    async with httpx.AsyncClient(timeout=35.0) as client:
        for tid_str, info in req.terminals.items():
            tid = int(tid_str)
            if not (1 <= tid <= NUM_WORKERS):
                continue
            try:
                resp = await client.post(
                    f"{worker_url(tid)}/set-home-account",
                    json={
                        "account":        str(info["account"]),
                        "server":         info["server"],
                        "password":       info["password"],
                        "subtype":        info.get("subtype", "standard"),
                        "api_key":        req.api_key,
                        "tg_bot_url":     req.tg_bot_url     or "",
                        "tg_bot_api_key": req.tg_bot_api_key or "",
                        "challenge_id":   req.challenge_id   or "",
                    },
                )
                results[tid_str] = resp.json()
            except Exception as e:
                results[tid_str] = {"success": False, "error": str(e)[:100]}

    summary = " ".join(f"T{tid}:{info.get('subtype','?')}" for tid, info in
                       sorted(((int(k), v) for k, v in req.terminals.items()), key=lambda x: x[0]))
    print(f"[Router] Terminal assignment: {summary}")

    return {
        "success":              True,
        "results":              results,
        "terminal_subtype_map": {str(i + 1): terminal_subtype_map[i] for i in range(NUM_WORKERS)},
    }


@app.post("/verify")
async def verify(req: VerifyRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    global _next_worker
    tried_terminals = set()
    last_error = "All workers failed"

    if req.terminal_id and 1 <= req.terminal_id <= NUM_WORKERS:
        wid = req.terminal_id
        for retry in range(MAX_RETRIES_SAME_TERMINAL + 1):
            try:
                async with httpx.AsyncClient(timeout=WORKER_TIMEOUT) as client:
                    resp = await client.post(f"{worker_url(wid)}/verify",
                                             json={"account": req.account, "server": req.server,
                                                   "password": req.password, "api_key": req.api_key})
                    data = resp.json()
                    data["terminal_used"] = wid
                    return data
            except Exception as e:
                if retry < MAX_RETRIES_SAME_TERMINAL:
                    await asyncio.sleep(RETRY_DELAY)
                    continue
                return {"success": False, "message": f"Terminal {wid}: {str(e)[:200]}", "terminal_used": wid}
        return {"success": False, "message": f"Terminal {wid} failed", "terminal_used": wid}

    while len(tried_terminals) < MAX_DIFFERENT_TERMINALS:
        _next_worker = (_next_worker % NUM_WORKERS) + 1
        wid = _next_worker
        if wid in tried_terminals:
            wid = get_next_healthy_worker(tried_terminals)
            if wid == 0:
                break
        tried_terminals.add(wid)

        for retry in range(MAX_RETRIES_SAME_TERMINAL + 1):
            try:
                async with httpx.AsyncClient(timeout=WORKER_TIMEOUT) as client:
                    resp = await client.post(f"{worker_url(wid)}/verify",
                                             json={"account": req.account, "server": req.server,
                                                   "password": req.password, "api_key": req.api_key})
                    data = resp.json()
                    if data.get("success"):
                        worker_healthy[wid - 1] = True
                        data["terminal_used"] = wid
                        return data
                    if is_credential_error(data.get("message", "")):
                        data["terminal_used"] = wid
                        data["error_type"] = "credential"
                        return data
                    last_error = data.get("message", "Worker error")
                    if is_terminal_error(last_error) and retry < MAX_RETRIES_SAME_TERMINAL:
                        await asyncio.sleep(RETRY_DELAY)
                        continue
                    worker_healthy[wid - 1] = False
                    break
            except Exception as e:
                last_error = str(e)[:200]
                worker_healthy[wid - 1] = False
                if retry < MAX_RETRIES_SAME_TERMINAL:
                    await asyncio.sleep(RETRY_DELAY)
                    continue
                break

    return {"success": False, "message": last_error, "error_type": "terminal", "terminals_tried": len(tried_terminals)}


@app.post("/pull")
async def pull(req: PullRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    tried_terminals = set()
    last_error = "All workers failed"

    global _next_worker
    if req.terminal_id and 1 <= req.terminal_id <= NUM_WORKERS:
        first_terminal = req.terminal_id
    else:
        _next_worker   = (_next_worker % NUM_WORKERS) + 1
        first_terminal = _next_worker

    current_terminal = first_terminal

    while len(tried_terminals) < MAX_DIFFERENT_TERMINALS:
        tried_terminals.add(current_terminal)

        for retry in range(MAX_RETRIES_SAME_TERMINAL + 1):
            try:
                async with httpx.AsyncClient(timeout=WORKER_TIMEOUT) as client:
                    resp = await client.post(
                        f"{worker_url(current_terminal)}/pull",
                        json={
                            "account":          req.account,
                            "server":           req.server,
                            "password":         req.password,
                            "api_key":          req.api_key,
                            "from_date":        req.from_date,
                            "orders_from_date": req.orders_from_date,
                        },
                    )
                    data = resp.json()
                    if data.get("success"):
                        worker_healthy[current_terminal - 1] = True
                        data["terminal_used"] = current_terminal
                        return data
                    if is_credential_error(data.get("message", "")):
                        data["terminal_used"] = current_terminal
                        data["error_type"] = "credential"
                        return data
                    last_error = data.get("message", "Worker error")
                    if is_terminal_error(last_error) and retry < MAX_RETRIES_SAME_TERMINAL:
                        await asyncio.sleep(RETRY_DELAY)
                        continue
                    worker_healthy[current_terminal - 1] = False
                    break
            except Exception as e:
                last_error = str(e)[:200]
                worker_healthy[current_terminal - 1] = False
                if retry < MAX_RETRIES_SAME_TERMINAL:
                    await asyncio.sleep(RETRY_DELAY)
                    continue
                break

        next_t = get_next_healthy_worker(tried_terminals)
        if next_t == 0:
            break
        current_terminal = next_t

    return {"success": False, "message": last_error, "error_type": "terminal",
            "terminals_tried": len(tried_terminals), "terminal_used": current_terminal}


@app.post("/api/v1/candles")
async def get_candles(req: CandlesRequest):
    """
    Fetch candle data with subtype-aware routing and full retry.
    - required_subtype: routes to terminals whose home is that subtype first
    - Falls back to other terminals if needed (worker self-corrects login)
    - Retries all same-subtype terminals before giving up
    """
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    required_subtype = req.required_subtype or "standard"
    candidates = get_candidates_for_subtype(required_subtype)

    # If terminal_id explicitly given, prioritise it
    if req.terminal_id and 1 <= req.terminal_id <= NUM_WORKERS:
        candidates = [req.terminal_id] + [c for c in candidates if c != req.terminal_id]

    tried = set()
    for wid in candidates:
        if wid in tried:
            continue
        tried.add(wid)

        for retry in range(MAX_RETRIES_SAME_TERMINAL + 1):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(
                        f"{worker_url(wid)}/candles",
                        json={
                            "symbol":           req.symbol,
                            "timeframe":        req.timeframe,
                            "from_time":        req.from_time,
                            "to_time":          req.to_time,
                            "api_key":          req.api_key,
                            "required_subtype": required_subtype,
                        },
                    )
                    data = resp.json()
                    if data.get("success") and data.get("candles"):
                        worker_healthy[wid - 1] = True
                        data["terminal_used"] = wid
                        return data
                    # Empty candles — worker may have fetched from wrong account, try next
                    worker_healthy[wid - 1] = False
                    break
            except Exception:
                worker_healthy[wid - 1] = False
                if retry < MAX_RETRIES_SAME_TERMINAL:
                    await asyncio.sleep(1.0)
                    continue
                break

    return {"success": False, "message": f"All terminals failed for {required_subtype} candles",
            "candles": [], "terminals_tried": len(tried)}


# ==================== STARTUP ====================

if __name__ == "__main__":
    print("=" * 50)
    print("  WinnerPip VPS Router v7.0")
    print("  Subtype-Aware Candle Routing + Smart Retry")
    print("=" * 50)
    print(f"  API Key:  {'SET (' + API_KEY[:8] + '...)' if API_KEY else 'NOT SET — WARNING!'}")
    print(f"  Workers:  {NUM_WORKERS} (ports {WORKER_BASE_PORT}-{WORKER_BASE_PORT + NUM_WORKERS - 1})")
    print(f"  Port:     8000")
    print(f"  Timeout:  {WORKER_TIMEOUT}s per request")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
