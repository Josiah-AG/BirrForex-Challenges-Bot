"""
WinnerPip VPS Router v7.0 — Subtype-Aware Candle Routing + Smart Retry
Runs on port 8000. Forwards requests to workers on ports 8001-8015.

New in v7.0:
- POST /configure: TG Bot assigns proportional home accounts to terminals
  Router updates its terminal_subtype_map and forwards to each worker
- Candle requests route to terminals whose home subtype matches required_subtype
  Automatically retries next same-subtype terminal on failure
- Pull/verify routing unchanged (round-robin, all terminals)
"""

import os
import subprocess
import asyncio
import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any
import uvicorn


def _get_git_commit() -> str:
    """Returns the short git commit hash of the checkout this file is running
    from, so we can always tell — from logs or /health — exactly which code
    is live, instead of guessing from a hand-maintained version string."""
    try:
        repo_dir = os.path.dirname(os.path.abspath(__file__))
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=repo_dir, capture_output=True, text=True, timeout=5,
        )
        commit = out.stdout.strip()
        return commit if commit else "unknown"
    except Exception:
        return "unknown"


def _get_git_commit_time() -> str:
    try:
        repo_dir = os.path.dirname(os.path.abspath(__file__))
        out = subprocess.run(
            ["git", "log", "-1", "--format=%cI"],
            cwd=repo_dir, capture_output=True, text=True, timeout=5,
        )
        ts = out.stdout.strip()
        return ts if ts else "unknown"
    except Exception:
        return "unknown"


GIT_COMMIT = _get_git_commit()
GIT_COMMIT_TIME = _get_git_commit_time()

app = FastAPI(title="WinnerPip VPS Router", version="7.0.0")

NUM_WORKERS      = int(os.environ.get("VPS_TERMINAL_COUNT", "12"))
WORKER_BASE_PORT = 8001
WORKER_TIMEOUT   = 120.0
RETRY_DELAY      = 2.0
MAX_RETRIES_SAME_TERMINAL  = 2
MAX_DIFFERENT_TERMINALS    = 3

API_KEY = os.environ.get("VPS_API_KEY", "")

_next_worker   = 0
worker_healthy = [True] * NUM_WORKERS

# ── myFXpath in-flight tracker (priority lane — SAFE / non-blocking design) ──
# CRITICAL DESIGN RULE: the Challenge system's request path must be COMPLETELY
# UNCHANGED. Challenge /pull requests do NOT touch this tracker, never acquire a
# lock, never wait — their code path is byte-for-byte the same as before.
#
# This tracker ONLY affects myFXpath (priority=True) requests. It is a plain
# counter of how many myFXpath pulls are currently in flight, guarded by a lock
# that ONLY myFXpath requests ever take. Therefore:
#   • It is IMPOSSIBLE for this to block, slow, deadlock, or starve Challenge
#     traffic — Challenge requests never enter this code at all.
#   • Worst case if this code had a bug: only myFXpath requests are affected;
#     the Challenge system keeps running exactly as it does today.
#
# DYNAMIC concurrency, based on whether the Challenge system is actively pulling:
#
#   • While WinnerPip is PULLING (challenge cycle in progress): myFXpath is capped
#     to ACTIVE_CAP = floor(NUM_WORKERS / 3) (min 1) parallel pulls, so WinnerPip
#     always keeps the other ~2/3 of terminals to itself and never has to stand
#     off waiting for a big myFXpath batch to drain. myFXpath requests beyond the
#     cap queue and drain N-at-a-time.
#   • While WinnerPip is AT REST (no challenge cycle running): myFXpath may use
#     ALL terminals in parallel (IDLE_CAP = NUM_WORKERS) for full speed.
#
# WinnerPip tells the router which state it's in via POST /challenge-pull-state
# (called at cycle start/end by vpsPullScheduler.ts). If that signal is never
# received, _challenge_pulling stays False (idle) — a safe default that only ever
# gives myFXpath MORE room, never less, and still can't harm Challenge because
# the Challenge path never touches this limiter.
#
# Env overrides:
#   MYFXPATH_ACTIVE_CAP  — override the while-pulling cap (default floor(N/3), min 1)
#   MYFXPATH_IDLE_CAP    — override the at-rest cap (default NUM_WORKERS)

def _default_active_cap() -> int:
    env = os.environ.get("MYFXPATH_ACTIVE_CAP")
    if env:
        try:
            return max(1, int(env))
        except ValueError:
            pass
    return max(1, NUM_WORKERS // 3)


def _default_idle_cap() -> int:
    env = os.environ.get("MYFXPATH_IDLE_CAP")
    if env:
        try:
            return max(1, int(env))
        except ValueError:
            pass
    return max(1, NUM_WORKERS)


_MYFXPATH_ACTIVE_CAP = _default_active_cap()
_MYFXPATH_IDLE_CAP = _default_idle_cap()

# True while a WinnerPip (Challenge) pull cycle is in progress. Set via
# POST /challenge-pull-state. Default False = WinnerPip at rest.
_challenge_pulling = False


class _MyfxpathLimiter:
    """Non-blocking-for-Challenge limiter. ONLY myFXpath (priority=True) requests
    use it — Challenge requests never enter this code, so it can never block,
    slow, or starve Challenge traffic.

    The allowed concurrency is DYNAMIC: it's decided at acquire time from the
    current challenge-pull state (active cap while WinnerPip pulls, idle cap when
    it rests). We implement this with a condition variable + a plain counter
    rather than a fixed-size Semaphore, because the cap changes at runtime.
    """
    def __init__(self):
        self._cond = asyncio.Condition()
        self._in_flight = 0

    def _current_cap(self) -> int:
        return _MYFXPATH_ACTIVE_CAP if _challenge_pulling else _MYFXPATH_IDLE_CAP

    async def __aenter__(self):
        async with self._cond:
            # Wait until the number in flight is below the CURRENT cap. Re-checked
            # on every notify, so if the state flips (pull ends -> cap rises) a
            # waiter can proceed immediately.
            await self._cond.wait_for(lambda: self._in_flight < self._current_cap())
            self._in_flight += 1
        return self

    async def __aexit__(self, *exc):
        async with self._cond:
            self._in_flight = max(0, self._in_flight - 1)
            self._cond.notify_all()

    async def notify_state_change(self):
        # Called when the challenge-pull state flips so waiters re-evaluate the cap.
        async with self._cond:
            self._cond.notify_all()

    def stats(self) -> dict:
        return {
            "myfxpath_in_flight": self._in_flight,
            "myfxpath_cap_now": self._current_cap(),
            "myfxpath_active_cap": _MYFXPATH_ACTIVE_CAP,
            "myfxpath_idle_cap": _MYFXPATH_IDLE_CAP,
            "challenge_pulling": _challenge_pulling,
        }


_myfxpath_limiter = _MyfxpathLimiter()

# ── VPS telemetry / report metrics ──────────────────────────────────────────
# A single in-memory tracker of everything worth knowing about how the shared
# VPS is being used, so myFXpath can pull a 4x/day report and email an end-of-
# day summary, and the WinnerPip health page can render the same data.
#
# SAFETY: this is purely ADDITIVE observability. It never changes routing, never
# blocks, and the Challenge request path is byte-for-byte unchanged — endpoints
# only call metrics.record_* at their entry/return points. A bug here can at
# worst produce wrong numbers in a report; it cannot affect any pull/verify.
#
# PERSISTENCE: counters are written to VPS_METRICS_FILE (atomic temp-rename) so
# a router restart does NOT reset the day's totals. On boot we reload the file.
# We also keep a ring buffer of the last N interval snapshots (each captured +
# reset by myFXpath's 4x/day POST /vps-report/snapshot) so the report shows the
# last 4 windows even across restarts.
import json as _json
import threading as _threading
import time as _time
import re as _re
from collections import defaultdict as _defaultdict

VPS_METRICS_FILE = os.environ.get(
    "VPS_METRICS_FILE",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "vps_metrics.json"),
)
SNAPSHOT_RING_SIZE = int(os.environ.get("VPS_SNAPSHOT_RING_SIZE", "4"))


def _new_lane_counts() -> dict:
    return {"myfxpath": 0, "challenge": 0}


class Metrics:
    """Thread-safe-ish (single lock) cumulative + per-terminal + per-lane counters.

    'lane' is 'myfxpath' for priority=True pull requests, else 'challenge'
    (WinnerPip). All request endpoints classify themselves; only /pull carries a
    priority flag, so verify/candles/list-positions/resolve default to the lane
    the caller declares (myFXpath passes priority on pull only, so its non-pull
    calls are attributed via the same request's api usage — we classify each
    endpoint call explicitly at the call site)."""

    def __init__(self):
        self._lock = _threading.Lock()
        self.started_at = _time.time()
        self.restart_count = 0
        # Totals since the metrics file was first created (lifetime / day-cumulative).
        self.reset_counters()
        # Ring buffer of finished interval snapshots (list of dicts).
        self.snapshots: list = []
        # Snapshot the current health so we can detect down/up transitions.
        self._last_health = list(worker_healthy)

    def reset_counters(self):
        """Reset the CURRENT interval counters (called after a snapshot capture).
        Does NOT touch started_at / restart_count / snapshots ring."""
        self.interval_started_at = _time.time()
        self.requests_total = 0
        self.requests_by_lane = _new_lane_counts()
        self.requests_by_type = _defaultdict(int)                 # pull/verify/candles/...
        self.requests_by_lane_type = _defaultdict(int)            # "myfxpath:pull" -> n
        self.success_total = 0
        self.failure_total = 0
        self.failures_by_type = _defaultdict(int)                 # credential/terminal/timeout/other
        self.failures_by_lane = _new_lane_counts()
        # Per-terminal usage split by lane: terminal -> {myfxpath, challenge}
        self.terminal_usage = _defaultdict(_new_lane_counts)
        self.terminal_success = _defaultdict(int)
        self.terminal_failure = _defaultdict(int)
        # Terminal down/up transition events this interval.
        self.terminal_down_events = _defaultdict(int)             # terminal -> count of ->down flips
        self.terminal_up_events = _defaultdict(int)               # terminal -> count of ->up flips
        # Reroutes: a request that had to try more than one terminal.
        self.reroute_requests = 0
        self.reroute_hops = 0                                     # sum of (terminals_tried - 1)
        self.credential_bans = 0
        # Contention (myFXpath vs WinnerPip sharing).
        self.myfxpath_peak_in_flight = 0
        self.myfxpath_capped_hits = 0                             # times a pull started while at/above cap
        self.challenge_pulling_seconds = 0.0                      # time WinnerPip was 'pulling'
        self._challenge_pull_since = _time.time() if _challenge_pulling else None

    # ── lifecycle of the challenge-pulling clock ──
    def mark_challenge_pull_state(self, active: bool):
        with self._lock:
            now = _time.time()
            if active and self._challenge_pull_since is None:
                self._challenge_pull_since = now
            elif not active and self._challenge_pull_since is not None:
                self.challenge_pulling_seconds += now - self._challenge_pull_since
                self._challenge_pull_since = None

    def _accrued_challenge_seconds(self) -> float:
        extra = 0.0
        if self._challenge_pull_since is not None:
            extra = _time.time() - self._challenge_pull_since
        return round(self.challenge_pulling_seconds + extra, 1)

    # ── health transition detection (reads existing worker_healthy) ──
    def observe_health(self):
        """Compare the live worker_healthy array to our last snapshot and record
        any down/up transitions. Called after each request completes — cheap."""
        for i in range(NUM_WORKERS):
            prev = self._last_health[i] if i < len(self._last_health) else True
            cur = worker_healthy[i]
            if prev and not cur:
                self.terminal_down_events[i + 1] += 1
            elif (not prev) and cur:
                self.terminal_up_events[i + 1] += 1
        self._last_health = list(worker_healthy)

    # ── the main recorder, called at each endpoint return ──
    def record_request(self, *, lane: str, req_type: str, success: bool,
                       terminal_used: Optional[int], error_type: Optional[str],
                       terminals_tried: int = 1):
        lane = "myfxpath" if lane == "myfxpath" else "challenge"
        with self._lock:
            self.requests_total += 1
            self.requests_by_lane[lane] += 1
            self.requests_by_type[req_type] += 1
            self.requests_by_lane_type[f"{lane}:{req_type}"] += 1
            if success:
                self.success_total += 1
            else:
                self.failure_total += 1
                self.failures_by_lane[lane] += 1
                self.failures_by_type[error_type or "other"] += 1
            if terminal_used and 1 <= terminal_used <= NUM_WORKERS:
                self.terminal_usage[terminal_used][lane] += 1
                if success:
                    self.terminal_success[terminal_used] += 1
                else:
                    self.terminal_failure[terminal_used] += 1
            if terminals_tried and terminals_tried > 1:
                self.reroute_requests += 1
                self.reroute_hops += (terminals_tried - 1)
            # Contention snapshot.
            infl = _myfxpath_limiter._in_flight
            if infl > self.myfxpath_peak_in_flight:
                self.myfxpath_peak_in_flight = infl
            if lane == "myfxpath" and infl >= _myfxpath_limiter._current_cap():
                self.myfxpath_capped_hits += 1
        # Health detection outside the counter lock (reads a separate array).
        self.observe_health()

    def record_credential_ban(self):
        with self._lock:
            self.credential_bans += 1

    # ── serialization ──
    def _interval_payload(self) -> dict:
        healthy = [i + 1 for i in range(NUM_WORKERS) if worker_healthy[i]]
        unhealthy = [i + 1 for i in range(NUM_WORKERS) if not worker_healthy[i]]
        return {
            "interval_started_at": round(self.interval_started_at, 1),
            "captured_at": round(_time.time(), 1),
            "requests_total": self.requests_total,
            "requests_by_lane": dict(self.requests_by_lane),
            "requests_by_type": dict(self.requests_by_type),
            "requests_by_lane_type": dict(self.requests_by_lane_type),
            "success_total": self.success_total,
            "failure_total": self.failure_total,
            "failures_by_type": dict(self.failures_by_type),
            "failures_by_lane": dict(self.failures_by_lane),
            "terminal_usage": {str(k): dict(v) for k, v in self.terminal_usage.items()},
            "terminal_success": {str(k): v for k, v in self.terminal_success.items()},
            "terminal_failure": {str(k): v for k, v in self.terminal_failure.items()},
            "terminal_down_events": {str(k): v for k, v in self.terminal_down_events.items()},
            "terminal_up_events": {str(k): v for k, v in self.terminal_up_events.items()},
            "reroute_requests": self.reroute_requests,
            "reroute_hops": self.reroute_hops,
            "credential_bans": self.credential_bans,
            "myfxpath_peak_in_flight": self.myfxpath_peak_in_flight,
            "myfxpath_capped_hits": self.myfxpath_capped_hits,
            "challenge_pulling_seconds": self._accrued_challenge_seconds(),
            "terminals_configured": NUM_WORKERS,
            "healthy_terminals": healthy,
            "unhealthy_terminals": unhealthy,
            "terminal_subtype_map": {str(i + 1): terminal_subtype_map[i] for i in range(NUM_WORKERS)},
        }

    def live_report(self) -> dict:
        """Live cumulative snapshot + diagnostics summary (does not reset)."""
        with self._lock:
            payload = self._interval_payload()
        payload["diagnostics"] = _build_diagnostics(payload)
        payload["router"] = {
            "git_commit": GIT_COMMIT,
            "git_commit_time": GIT_COMMIT_TIME,
            "started_at": round(self.started_at, 1),
            "uptime_seconds": round(_time.time() - self.started_at, 1),
            "restart_count": self.restart_count,
            "challenge_pulling": _challenge_pulling,
        }
        return payload

    def capture_snapshot(self) -> dict:
        """Capture the current interval as a finished snapshot, append it to the
        ring buffer, RESET the interval counters, and persist. Returns the snapshot."""
        with self._lock:
            snap = self._interval_payload()
            snap["diagnostics"] = _build_diagnostics(snap)
            snap["router"] = {
                "git_commit": GIT_COMMIT,
                "started_at": round(self.started_at, 1),
                "restart_count": self.restart_count,
                "challenge_pulling": _challenge_pulling,
            }
            self.snapshots.append(snap)
            if len(self.snapshots) > SNAPSHOT_RING_SIZE:
                self.snapshots = self.snapshots[-SNAPSHOT_RING_SIZE:]
            # carry the challenge-pull clock across the reset
            carry = self._challenge_pull_since
            self.reset_counters()
            self._challenge_pull_since = carry if _challenge_pulling else None
        self.persist()
        return snap

    def to_dict(self) -> dict:
        with self._lock:
            return {
                "started_at": self.started_at,
                "restart_count": self.restart_count,
                "interval": self._interval_payload(),
                "snapshots": self.snapshots,
                "challenge_pulling_seconds_acc": self.challenge_pulling_seconds,
            }

    def load_dict(self, d: dict):
        with self._lock:
            self.started_at = d.get("started_at", self.started_at)
            self.restart_count = int(d.get("restart_count", 0)) + 1
            self.snapshots = d.get("snapshots", []) or []
            iv = d.get("interval") or {}
            # Restore the current interval counters so a restart mid-window keeps totals.
            self.interval_started_at = iv.get("interval_started_at", _time.time())
            self.requests_total = iv.get("requests_total", 0)
            self.requests_by_lane = _defaultdict(int, iv.get("requests_by_lane", {}) or {})
            self.requests_by_lane.setdefault("myfxpath", 0); self.requests_by_lane.setdefault("challenge", 0)
            self.requests_by_type = _defaultdict(int, iv.get("requests_by_type", {}) or {})
            self.requests_by_lane_type = _defaultdict(int, iv.get("requests_by_lane_type", {}) or {})
            self.success_total = iv.get("success_total", 0)
            self.failure_total = iv.get("failure_total", 0)
            self.failures_by_type = _defaultdict(int, iv.get("failures_by_type", {}) or {})
            self.failures_by_lane = _defaultdict(int, iv.get("failures_by_lane", {}) or {})
            self.failures_by_lane.setdefault("myfxpath", 0); self.failures_by_lane.setdefault("challenge", 0)
            self.terminal_usage = _defaultdict(_new_lane_counts,
                {int(k): _new_lane_counts() | v for k, v in (iv.get("terminal_usage", {}) or {}).items()})
            self.terminal_success = _defaultdict(int, {int(k): v for k, v in (iv.get("terminal_success", {}) or {}).items()})
            self.terminal_failure = _defaultdict(int, {int(k): v for k, v in (iv.get("terminal_failure", {}) or {}).items()})
            self.terminal_down_events = _defaultdict(int, {int(k): v for k, v in (iv.get("terminal_down_events", {}) or {}).items()})
            self.terminal_up_events = _defaultdict(int, {int(k): v for k, v in (iv.get("terminal_up_events", {}) or {}).items()})
            self.reroute_requests = iv.get("reroute_requests", 0)
            self.reroute_hops = iv.get("reroute_hops", 0)
            self.credential_bans = iv.get("credential_bans", 0)
            self.myfxpath_peak_in_flight = iv.get("myfxpath_peak_in_flight", 0)
            self.myfxpath_capped_hits = iv.get("myfxpath_capped_hits", 0)
            self.challenge_pulling_seconds = d.get("challenge_pulling_seconds_acc", 0.0)

    def persist(self):
        """Atomically write the metrics file (temp + rename). Best-effort."""
        try:
            data = self.to_dict()
            tmp = VPS_METRICS_FILE + ".tmp"
            with open(tmp, "w") as f:
                _json.dump(data, f)
            os.replace(tmp, VPS_METRICS_FILE)
        except Exception as e:
            print(f"[Router] metrics persist failed (non-fatal): {str(e)[:150]}")


def _build_diagnostics(p: dict) -> list:
    """Human-readable 'anything you should know' lines from a payload."""
    notes = []
    total = p.get("requests_total", 0)
    if total == 0:
        notes.append("No requests recorded in this window.")
    fail = p.get("failure_total", 0)
    if total:
        rate = round(100 * p.get("success_total", 0) / total, 1)
        notes.append(f"Success rate {rate}% ({p.get('success_total',0)}/{total}).")
    if fail:
        ft = p.get("failures_by_type", {})
        breakdown = ", ".join(f"{k}:{v}" for k, v in sorted(ft.items(), key=lambda x: -x[1]))
        notes.append(f"{fail} failure(s) — {breakdown}.")
    downs = p.get("terminal_down_events", {})
    if downs:
        dl = ", ".join(f"T{k} x{v}" for k, v in sorted(downs.items(), key=lambda x: -x[1]))
        notes.append(f"Terminal down events: {dl}.")
    unhealthy = p.get("unhealthy_terminals", [])
    if unhealthy:
        notes.append(f"Currently unhealthy: {', '.join('T'+str(t) for t in unhealthy)}.")
    rr = p.get("reroute_requests", 0)
    if rr:
        notes.append(f"{rr} request(s) had to reroute ({p.get('reroute_hops',0)} extra hop(s)).")
    lane = p.get("requests_by_lane", {})
    mf, ch = lane.get("myfxpath", 0), lane.get("challenge", 0)
    if mf or ch:
        notes.append(f"Lane split — myFXpath {mf}, WinnerPip {ch}.")
    capped = p.get("myfxpath_capped_hits", 0)
    if capped:
        notes.append(f"myFXpath hit its concurrency cap {capped} time(s) while WinnerPip was pulling.")
    bans = p.get("credential_bans", 0)
    if bans:
        notes.append(f"{bans} account(s) credential-banned this window.")
    return notes


metrics = Metrics()
# Reload persisted metrics so a restart doesn't reset the day.
try:
    if os.path.exists(VPS_METRICS_FILE):
        with open(VPS_METRICS_FILE) as _mf:
            metrics.load_dict(_json.load(_mf))
        print(f"[Router] metrics reloaded from {VPS_METRICS_FILE} (restart #{metrics.restart_count})")
except Exception as _e:
    print(f"[Router] metrics reload failed (starting fresh): {str(_e)[:150]}")


def _classify_error(data: dict) -> Optional[str]:
    """Map a worker/router result dict to an error_type for the report.
    Returns None on success."""
    if data.get("success"):
        return None
    et = data.get("error_type")
    if et in ("credential_failure", "credential"):
        return "credential"
    if et == "terminal":
        # Distinguish timeouts from other terminal errors for diagnostics.
        msg = str(data.get("message", "")).lower()
        if "timeout" in msg or "timed out" in msg:
            return "timeout"
        return "terminal"
    msg = str(data.get("message", "")).lower()
    if "timeout" in msg or "timed out" in msg:
        return "timeout"
    if any(x in msg for x in ["login failed", "authorization failed", "credential"]):
        return "credential"
    return "other"


def _record_pull_metrics(data: dict, lane: str):
    """Record a /pull result. Best-effort; never raises into the request path."""
    try:
        err = _classify_error(data)
        if data.get("credential_banned"):
            metrics.record_credential_ban()
        metrics.record_request(
            lane=lane,
            req_type="pull",
            success=bool(data.get("success")),
            terminal_used=data.get("terminal_used"),
            error_type=err,
            terminals_tried=int(data.get("terminals_tried") or 1),
        )
    except Exception as e:
        print(f"[Router] metrics record (pull) failed (non-fatal): {str(e)[:120]}")


def _record_metrics(data: dict, lane: str, req_type: str):
    """Record a non-pull endpoint result (verify/candles/list-positions/resolve).
    Best-effort; never raises into the request path."""
    try:
        err = _classify_error(data)
        metrics.record_request(
            lane=lane,
            req_type=req_type,
            success=bool(data.get("success")),
            terminal_used=data.get("terminal_used"),
            error_type=err,
            terminals_tried=int(data.get("terminals_tried") or 1),
        )
    except Exception as e:
        print(f"[Router] metrics record ({req_type}) failed (non-fatal): {str(e)[:120]}")

# ────────────────────────────────────────────────────────────────────────────

# Tracks the home subtype of each worker (index 0 = worker 1)
# Updated by /configure when TG Bot assigns home accounts
terminal_subtype_map = ["standard"] * NUM_WORKERS

# ── Global credential attempt tracker ──────────────────────────────────────
# Tracks per-account credential failure attempts across ALL terminals.
#
# Rules (v2 — matches the scheduler's two-terminal confirmation model):
#   First unique terminal fails with -6 → recorded as UNCONFIRMED, NOT banned yet.
#   The scheduler (vpsPullScheduler.ts) will explicitly dispatch a SECOND, real
#   pull attempt to a DIFFERENT terminal (it passes terminal_id explicitly) to
#   confirm. Only once a SECOND unique terminal also fails with -6 is the account
#   considered confirmed and banned for the rest of this cycle.
#   This guarantees the "confirmation" is a genuine second real MT5 login on a
#   different terminal, not a cache short-circuit.
#
# Each entry: { "terminals": [t1, t2, ...], "banned": bool, "ts": float }
# TTL: 10 minutes (safely expires before the next scheduled pull cycle)
# ───────────────────────────────────────────────────────────────────────────
import time as _time
import re as _re
_global_credential_cache: dict = {}   # normalized_account_str → entry dict
GLOBAL_CREDENTIAL_CACHE_TTL = 600     # 10 minutes


def _normalize_account(account: str) -> str:
    """Normalize MT5 account number to digits only.
    Handles '#161600472', '161600472.0', '161 600 472' → '161600472'.
    This ensures the same physical MT5 account is treated as a single key
    regardless of how it was formatted in the database or request.
    """
    cleaned = _re.sub(r'[^0-9.]', '', str(account or ''))
    if not cleaned:
        return str(account or '')
    try:
        return str(int(float(cleaned)))
    except (ValueError, OverflowError):
        return _re.sub(r'\D', '', str(account or '')) or str(account or '')


def _get_credential_entry(account: str) -> Optional[dict]:
    key = _normalize_account(account)
    entry = _global_credential_cache.get(key)
    if entry is None:
        return None
    if _time.time() - entry["ts"] > GLOBAL_CREDENTIAL_CACHE_TTL:
        del _global_credential_cache[key]
        return None
    return entry


def _record_credential_failure(account: str, terminal: int) -> dict:
    """Record a credential failure on the given terminal.
    Only bans the account once a SECOND unique terminal has also failed with -6 —
    this is the genuine real-login confirmation step the scheduler relies on.
    A single terminal's -6 is recorded but left unbanned so the scheduler's
    explicit confirmation dispatch to a different terminal can go through for real."""
    key = _normalize_account(account)
    entry = _global_credential_cache.get(key)
    now = _time.time()
    if entry is None or _time.time() - entry["ts"] > GLOBAL_CREDENTIAL_CACHE_TTL:
        entry = {"terminals": [], "banned": False, "ts": now}

    if terminal not in entry["terminals"]:
        entry["terminals"].append(terminal)

    unique_count = len(entry["terminals"])
    # Ban only after a SECOND different terminal confirms -6 with a real login.
    if unique_count >= 2:
        entry["banned"] = True

    entry["ts"] = now  # refresh TTL on every update
    _global_credential_cache[key] = entry

    if entry["banned"]:
        print(f"[Router] 🚫 Account {account} (key={key}) CONFIRMED + BANNED — credential failure on {unique_count} different terminals (terminals: {entry['terminals']})")
    else:
        print(f"[Router] ⚠️ Account {account} (key={key}) credential failure on T{terminal} — unconfirmed, awaiting a different terminal's real attempt (terminals: {entry['terminals']})")
    return entry


def _clear_credential_entry(account: str):
    """Remove an account's credential tracking (e.g. pull succeeded — credentials were fine)."""
    key = _normalize_account(account)
    if key in _global_credential_cache:
        del _global_credential_cache[key]
        print(f"[Router] ✅ Account {account} (key={key}) credential tracking cleared — pull succeeded")
# ───────────────────────────────────────────────────────────────────────────


def worker_url(worker_id: int) -> str:
    return f"http://127.0.0.1:{WORKER_BASE_PORT + worker_id - 1}"


def is_credential_error(message: str) -> bool:
    """Detect any credential-rejection response from a VPS worker.

    Matches:
    - Real MT5 login failures:  "Login failed: (-6, 'Terminal: Authorization failed')"
    - VPS worker instant-rejects from its per-process cache: "Credential failure cached for account X"
    - Other broker rejection strings
    """
    msg = message.lower()
    return any(x in msg for x in [
        "login failed",
        "invalid account",
        "wrong password",
        "account not found",
        "credential failure",   # catches VPS instant-reject "Credential failure cached for account X"
        "authorization failed", # catches MT5 error -6 "Terminal: Authorization failed"
    ])


def is_terminal_error(message: str) -> bool:
    msg = message.lower()
    return any(x in msg for x in ["init error", "init failed",
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
    # Report lane only (additive; does not affect routing). myFXpath sets True.
    priority:    Optional[bool] = False


class PullRequest(BaseModel):
    account:          str
    server:           str
    password:         str
    api_key:          str
    terminal_id:      Optional[int] = None
    from_date:        Optional[str] = None
    orders_from_date: Optional[str] = None
    extended_sync:    Optional[bool] = False
    # myFXpath priority lane: when True, this request is granted the next freed
    # terminal slot ahead of waiting normal-priority (Challenge) requests.
    priority:         Optional[bool] = False


class ListPositionsRequest(BaseModel):
    account:     str
    server:      str
    password:    str
    api_key:     str
    terminal_id: Optional[int] = None
    from_date:   str
    to_date:     str
    priority:    Optional[bool] = False   # report lane only (additive)


class ResolveTradesRequest(BaseModel):
    account:      str
    server:       str
    password:     str
    api_key:      str
    terminal_id:  Optional[int] = None
    position_ids: list
    priority:     Optional[bool] = False  # report lane only (additive)


class ResolveOpensRequest(BaseModel):
    account:      str
    server:       str
    password:     str
    api_key:      str
    terminal_id:  Optional[int] = None
    position_ids: list
    priority:     Optional[bool] = False  # report lane only (additive)


class CandlesRequest(BaseModel):
    symbol:           str
    timeframe:        str = "M1"
    from_time:        str
    to_time:          str
    api_key:          str
    terminal_id:      Optional[int] = None
    required_subtype: Optional[str] = None
    priority:         Optional[bool] = False  # report lane only (additive)


class OhlcSymbolRange(BaseModel):
    symbol:    str
    from_time: str
    to_time:   str


class OhlcBulkRequest(BaseModel):
    symbols:   list
    timeframe: str = "M1"
    api_key:   str


class ConfigureRequest(BaseModel):
    api_key:        str
    terminals:      Dict[str, Any]   # {terminal_id_str: {subtype, account, server, password}}
    tg_bot_url:     Optional[str] = None
    tg_bot_api_key: Optional[str] = None
    challenge_id:   Optional[str] = None


# ==================== ENDPOINTS ====================

@app.post("/clear-credential-cache")
async def clear_credential_cache(req: dict):
    """Called by the scheduler at the start of each new pull cycle to reset
    the router-level global credential cache, allowing re-attempts for accounts
    whose credentials may have been fixed since the last cycle."""
    if req.get("api_key") != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    count = len(_global_credential_cache)
    _global_credential_cache.clear()
    print(f"[Router] 🗑️ Global credential tracker cleared ({count} accounts) — new pull cycle starting")
    return {"cleared": count}


@app.post("/challenge-pull-state")
async def challenge_pull_state(req: dict):
    """WinnerPip (Challenge) tells the router whether a pull cycle is in progress.
    Body: { api_key, active: bool }.

    active=True  → WinnerPip is pulling → myFXpath is capped to the ACTIVE cap
                   (floor(NUM_WORKERS/3)) so WinnerPip keeps the majority of
                   terminals to itself.
    active=False → WinnerPip is at rest → myFXpath may use up to the IDLE cap
                   (all terminals).

    This only ever changes myFXpath's concurrency. The Challenge pull path never
    touches the limiter, so this can't affect Challenge traffic. Best-effort:
    if WinnerPip never calls this, the flag stays False (idle) — safe."""
    if req.get("api_key") != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    global _challenge_pulling
    prev = _challenge_pulling
    _challenge_pulling = bool(req.get("active", False))
    # Report clock: accrue how long WinnerPip spends actively pulling (additive).
    try:
        metrics.mark_challenge_pull_state(_challenge_pulling)
    except Exception:
        pass
    if prev != _challenge_pulling:
        # Wake any waiting myFXpath requests so they re-evaluate the (changed) cap.
        await _myfxpath_limiter.notify_state_change()
        print(f"[Router] challenge-pull-state → {'PULLING' if _challenge_pulling else 'REST'} "
              f"(myFXpath cap now {_myfxpath_limiter._current_cap()})")
    return {"challenge_pulling": _challenge_pulling, "myfxpath_cap": _myfxpath_limiter._current_cap()}


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
        "git_commit":           GIT_COMMIT,
        "git_commit_time":      GIT_COMMIT_TIME,
        "terminals":            NUM_WORKERS,
        "alive_workers":        alive,
        "healthy_terminals":    healthy_list,
        "unhealthy_terminals":  unhealthy_list,
        "terminal_subtype_map": {str(i + 1): terminal_subtype_map[i] for i in range(NUM_WORKERS)},
    }


@app.get("/pool-stats")
async def pool_stats():
    """Observability for the myFXpath priority lane only. Challenge traffic is not
    tracked here because it does not pass through the limiter (unchanged path)."""
    return {"success": True, "myfxpath": _myfxpath_limiter.stats()}


# ==================== VPS REPORT / TELEMETRY ====================

class ReportRequest(BaseModel):
    api_key: str


@app.post("/vps-report")
async def vps_report_live(req: ReportRequest):
    """Live cumulative report for the CURRENT interval (does not reset).
    Read by the WinnerPip health page and by myFXpath for an on-demand view."""
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return {"success": True, "report": metrics.live_report()}


@app.get("/vps-report")
async def vps_report_live_get(api_key: str = ""):
    """GET variant (api_key as query param) so a health page can fetch it easily."""
    if api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return {"success": True, "report": metrics.live_report()}


@app.post("/vps-report/snapshot")
async def vps_report_snapshot(req: ReportRequest):
    """Capture the current interval as a finished snapshot, append it to the ring
    buffer, RESET the interval counters, and persist. Called by myFXpath 4x/day.
    Returns the snapshot just captured."""
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    snap = metrics.capture_snapshot()
    return {"success": True, "snapshot": snap}


@app.get("/vps-report/snapshots")
async def vps_report_snapshots(api_key: str = ""):
    """The ring buffer of the last N captured snapshots (default 4), plus the live
    current interval. Read by the WinnerPip health page + myFXpath admin."""
    if api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    return {
        "success": True,
        "snapshots": metrics.snapshots,
        "current": metrics.live_report(),
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
    # Thin metrics wrapper — runs the original logic unchanged, records the result once.
    data = await _verify_impl(req)
    _record_metrics(data, lane=("myfxpath" if req.priority else "challenge"), req_type="verify")
    return data


async def _verify_impl(req: VerifyRequest):
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
                    is_cred = (
                        is_credential_error(data.get("message", ""))
                        or data.get("error_type") == "credential_failure"
                    )
                    if is_cred:
                        data["terminal_used"] = wid
                        data["error_type"] = "credential_failure"
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

    # ── Challenge path: COMPLETELY UNCHANGED ──────────────────────────────
    # If this is NOT a myFXpath priority request, run the original pull logic
    # directly — no lock, no limiter, no waiting. Byte-for-byte the old behavior.
    # (The only addition is a post-hoc metrics.record_request on the RESULT, which
    #  reads the returned dict and cannot alter the pull or its timing.)
    if not req.priority:
        data = await _pull_impl(req)
        _record_pull_metrics(data, lane="challenge")
        return data

    # ── myFXpath path only: cap concurrency so a big sync can't hog terminals
    # and stall the Challenge cycle. Only myFXpath requests ever reach here, so
    # this can never block or affect Challenge traffic.
    async with _myfxpath_limiter:
        data = await _pull_impl(req)
        _record_pull_metrics(data, lane="myfxpath")
        return data


async def _pull_impl(req: PullRequest):
    # ── Global credential ban check ───────────────────────────────────────
    # An account is only banned after a SECOND different terminal has confirmed
    # the -6 with a genuine real login (see _record_credential_failure). A single
    # unconfirmed failure does NOT block this request — this lets the scheduler's
    # explicit confirmation dispatch (it always passes terminal_id for a DIFFERENT
    # terminal than the one that just failed) go through to a real worker login.
    entry = _get_credential_entry(req.account)
    if entry and entry["banned"]:
        terminals_tried = entry["terminals"]
        print(f"[Router] 🚫 Account {req.account} globally banned — confirmed failure on terminals {terminals_tried}, skipping")
        return {
            "success":          False,
            "message":          f"Credential failure confirmed on terminal(s) {terminals_tried} — account globally banned this cycle",
            "error_type":       "credential_failure",
            "terminals_tried":  len(terminals_tried),
        }
    # ─────────────────────────────────────────────────────────────────────

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
                            "extended_sync":    req.extended_sync,
                        },
                    )
                    data = resp.json()

                    if data.get("success"):
                        worker_healthy[current_terminal - 1] = True
                        data["terminal_used"] = current_terminal
                        # Clear any partial credential failure record — credentials are fine
                        _clear_credential_entry(req.account)
                        return data

                    # ── Credential failure — record attempt and decide ─────────
                    is_cred = (
                        is_credential_error(data.get("message", ""))
                        or data.get("error_type") == "credential_failure"
                    )
                    if is_cred:
                        updated = _record_credential_failure(req.account, current_terminal)
                        data["terminal_used"] = current_terminal
                        data["error_type"] = "credential_failure"
                        data["credential_attempts"] = len(updated["terminals"])
                        data["credential_terminals"] = updated["terminals"]
                        data["credential_banned"] = updated["banned"]
                        return data
                    # ─────────────────────────────────────────────────────────

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


@app.post("/list-positions")
async def list_positions(req: ListPositionsRequest):
    data = await _list_positions_impl(req)
    _record_metrics(data, lane=("myfxpath" if req.priority else "challenge"), req_type="list-positions")
    return data


async def _list_positions_impl(req: ListPositionsRequest):
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
                        f"{worker_url(current_terminal)}/list-positions",
                        json={
                            "account":   req.account,
                            "server":    req.server,
                            "password":  req.password,
                            "api_key":   req.api_key,
                            "from_date": req.from_date,
                            "to_date":   req.to_date,
                        },
                    )
                    data = resp.json()
                    if data.get("success"):
                        worker_healthy[current_terminal - 1] = True
                        data["terminal_used"] = current_terminal
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


@app.post("/resolve-opens")
async def resolve_opens(req: ResolveOpensRequest):
    data = await _resolve_opens_impl(req)
    _record_metrics(data, lane=("myfxpath" if req.priority else "challenge"), req_type="resolve-opens")
    return data


async def _resolve_opens_impl(req: ResolveOpensRequest):
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
                        f"{worker_url(current_terminal)}/resolve-opens",
                        json={
                            "account":      req.account,
                            "server":       req.server,
                            "password":     req.password,
                            "api_key":      req.api_key,
                            "position_ids": req.position_ids,
                        },
                    )
                    data = resp.json()
                    if data.get("success"):
                        worker_healthy[current_terminal - 1] = True
                        data["terminal_used"] = current_terminal
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


@app.post("/resolve-trades")
async def resolve_trades(req: ResolveTradesRequest):
    data = await _resolve_trades_impl(req)
    _record_metrics(data, lane=("myfxpath" if req.priority else "challenge"), req_type="resolve-trades")
    return data


async def _resolve_trades_impl(req: ResolveTradesRequest):
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
                        f"{worker_url(current_terminal)}/resolve-trades",
                        json={
                            "account":      req.account,
                            "server":       req.server,
                            "password":     req.password,
                            "api_key":      req.api_key,
                            "position_ids": req.position_ids,
                        },
                    )
                    data = resp.json()
                    if data.get("success"):
                        worker_healthy[current_terminal - 1] = True
                        data["terminal_used"] = current_terminal
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
    data = await _get_candles_impl(req)
    _record_metrics(data, lane=("myfxpath" if req.priority else "challenge"), req_type="candles")
    return data


async def _get_candles_impl(req: CandlesRequest):
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


@app.post("/candles")
async def candles_alias(req: CandlesRequest):
    """Alias for /api/v1/candles — routes to a standard terminal worker."""
    return await get_candles(req)


@app.post("/ohlc-bulk")
async def ohlc_bulk(req: OhlcBulkRequest):
    """Fetch 1-min candles for multiple symbols, routing each through a standard worker."""
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

    # Pick one healthy standard terminal to run all candle fetches
    candidates = get_candidates_for_subtype("standard")
    wid = candidates[0] if candidates else 1

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(
                f"{worker_url(wid)}/ohlc-bulk",
                json={
                    "symbols":   req.symbols,
                    "timeframe": req.timeframe,
                    "api_key":   req.api_key,
                },
            )
            data = resp.json()
            data["terminal_used"] = wid
            return data
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Worker {wid} error: {str(e)[:200]}")


# ==================== STARTUP ====================

@app.on_event("startup")
async def _start_metrics_persist_loop():
    """Persist metrics to disk every 60s so an unexpected crash between the 4x/day
    snapshots loses at most ~1 minute of counts. Snapshots also persist on capture."""
    async def _loop():
        while True:
            await asyncio.sleep(60)
            metrics.persist()
    asyncio.create_task(_loop())


if __name__ == "__main__":
    print("=" * 50)
    print("  WinnerPip VPS Router v7.0")
    print("  Subtype-Aware Candle Routing + Smart Retry")
    print(f"  Git commit: {GIT_COMMIT}  ({GIT_COMMIT_TIME})")
    print("=" * 50)
    print(f"  API Key:  {'SET (' + API_KEY[:8] + '...)' if API_KEY else 'NOT SET — WARNING!'}")
    print(f"  Workers:  {NUM_WORKERS} (ports {WORKER_BASE_PORT}-{WORKER_BASE_PORT + NUM_WORKERS - 1})")
    print(f"  Port:     8000")
    print(f"  Timeout:  {WORKER_TIMEOUT}s per request")
    print("=" * 50)

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
