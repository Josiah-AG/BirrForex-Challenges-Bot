"""
WinnerPip VPS Worker v9.0 — Credential-Safe Recovery + History Sync Fix
Each instance owns ONE MT5 terminal exclusively.
Run with: py -3.12 worker.py <terminal_id> <port>
Example:  py -3.12 worker.py 1 8001

New in v9.0:
- -6 (Terminal: Authorization failed) detected as definitive credential error code
- After -6: immediate direct base account login (no shutdown/restart) — zero downtime
- Only falls back to shutdown → initialize → restart if direct base login fails
- _recovery_in_progress flag prevents multiple simultaneous terminal kill cascades
- History sync: terminal_info().connected pre-check, broker cache priming,
  ping-based dynamic wait, stabilization loop rejects count=0 as "stable"
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
import builtins
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Optional
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

# ── Timestamped logging ──────────────────────────────────────────────────────
# Override built-in print so every log line automatically gets a UTC timestamp.
# Format: [YYYY-MM-DD HH:MM:SS UTC] <message>
_original_print = builtins.print

def _ts_print(*args, **kwargs):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    _original_print(f"[{ts}]", *args, **kwargs)

builtins.print = _ts_print

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

# Credential error codes — -6 is "Terminal: Authorization failed" from Exness/MT5.
# This is a BROKER rejection (wrong account/password), never an IPC/terminal failure.
# IPC errors are always -100xx (e.g. -10004 No IPC, -10005 IPC timeout).
CREDENTIAL_ERROR_CODES = {-6}

# Prevents multiple simultaneous _async_stage2_recovery threads from
# killing the same terminal repeatedly (the cascade that caused 3-min restarts).
_recovery_in_progress = False

# Per-worker credential failure cache — maps account number → failure timestamp.
# When the same account fails with -6, subsequent requests within CREDENTIAL_CACHE_TTL
# are rejected instantly: no mt5.login() call, no terminal contact whatsoever.
# TTL is 10 minutes — long enough to block all retry passes in one cycle,
# short enough that a password update takes effect on the next cycle.
_credential_cache: dict = {}
CREDENTIAL_CACHE_TTL = 600  # seconds


def _is_credential_cached(account: int) -> bool:
    """True if this account had a confirmed -6 failure within the last TTL seconds."""
    ts = _credential_cache.get(account)
    if ts is None:
        return False
    if time.time() - ts > CREDENTIAL_CACHE_TTL:
        del _credential_cache[account]
        return False
    return True


def _cache_credential_failure(account: int):
    """Record a confirmed -6 credential failure for this account."""
    _credential_cache[account] = time.time()
    print(f"  [W{TERMINAL_ID}] Credential cached for account {account} — will skip for {CREDENTIAL_CACHE_TTL}s")

# Idle restore
_idle_timer = None
IDLE_TIMEOUT = 30  # seconds — fast restore, home account is always correct subtype

# Current logged-in account (updated on every successful login)
_current_account_str = str(BASE_ACCOUNT)

app = FastAPI(title=f"VPS Worker {TERMINAL_ID}", version="7.0.0")


# ==================== BASE ACCOUNT RESTORE ====================

def _write_base_config() -> str | None:
    """
    Write base account credentials to an INI config file that MT5 reads at launch.
    Returns the config file path, or None on failure.
    MT5 /config flag: terminal64.exe /config:"path.ini" auto-logs in on startup.
    """
    config_path = f"C:\\MetaTrader\\Terminal {TERMINAL_ID}\\base_login.ini"
    tag = f"  [W{TERMINAL_ID}]"
    try:
        os.makedirs(os.path.dirname(config_path), exist_ok=True)
        content = (
            f"[Common]\n"
            f"Login={BASE_ACCOUNT}\n"
            f"Password={BASE_PASSWORD}\n"
            f"Server={BASE_SERVER}\n"
            f"KeepPrivate=1\n"
        )
        with open(config_path, "w") as f:
            f.write(content)
        print(f"{tag}    config written: {config_path}")
        return config_path
    except Exception as e:
        print(f"{tag}    config write failed: {e}")
        return None


def _kill_and_restart_terminal() -> bool:
    """
    Kill the terminal process and relaunch it with the base account config file.
    The /config flag tells MT5 to auto-login on startup — no dialog, no manual input.
    Waits 25s for the broker connection before returning.
    """
    tag = f"  [W{TERMINAL_ID}]"
    print(f"{tag} ── terminal restart with base config ──")

    config_path = _write_base_config()
    if not config_path:
        return False

    # Kill the terminal (also calls mt5.shutdown internally)
    kill_terminal()
    time.sleep(3)

    # Relaunch with /config flag — MT5 reads credentials and auto-logs in
    try:
        subprocess.Popen(
            [TERMINAL_PATH, f"/config:{config_path}"],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        )
        print(f"{tag}    terminal relaunched with /config — waiting 35s for broker...")
        time.sleep(35)
        return True
    except Exception as e:
        print(f"{tag}    relaunch error: {e}")
        return False


def _try_initialize_and_login() -> bool:
    """
    Single attempt: mt5.shutdown → mt5.initialize → mt5.login to base account.
    Returns True on success.
    """
    global _ipc_connected, _current_account_str
    tag = f"  [W{TERMINAL_ID}]"
    try:
        mt5.shutdown()
    except:
        pass
    _ipc_connected = False
    time.sleep(1)

    print(f"{tag}    mt5.initialize ...")
    init_ok = mt5.initialize(TERMINAL_PATH, timeout=15000)
    print(f"{tag}    mt5.initialize → {'OK' if init_ok else f'FAILED {mt5.last_error()}'}")
    if not init_ok:
        return False

    _ipc_connected = True
    print(f"{tag}    mt5.login({BASE_ACCOUNT}) ...")
    login_ok = mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER)
    print(f"{tag}    mt5.login → {'OK' if login_ok else f'FAILED {mt5.last_error()}'}")
    if not login_ok:
        mt5.shutdown()
        _ipc_connected = False
        return False

    _current_account_str = str(BASE_ACCOUNT)
    info = mt5.account_info()
    if info:
        print(f"{tag}    account: {info.login} | balance: {info.balance} | server: {info.server}")
    print(f"{tag} ✓ Base account login SUCCESS")
    return True


def force_login_base_account(reason: str = "", skip_stage1: bool = False) -> bool:
    """
    Two-stage recovery:

    Stage 1 — patient wait (12 × 5s = 60s):
        Used at startup — terminal may still be connecting to broker.
        Skipped for credential failures: the Login dialog blocks IPC so
        Stage 1 retries are wasted. Go straight to Stage 2.

    Stage 2 — hard recovery (kill + /config restart):
        Kill the process, relaunch with base_login.ini so MT5 auto-logs
        in on startup. No dialog, no manual input.
    """
    tag = f"  [W{TERMINAL_ID}]"
    print(f"{tag} ── force_login_base_account ── reason: {reason}")

    # ── Stage 1: patient wait (startup only) ─────────────────────────
    if not skip_stage1:
        for attempt in range(12):
            print(f"{tag}    stage 1 attempt {attempt+1}/12")
            if _try_initialize_and_login():
                return True
            err = mt5.last_error()
            print(f"{tag}    stage 1 failed — last_error: {err}")
            time.sleep(5)
        print(f"{tag}    stage 1 exhausted — triggering hard recovery")
    else:
        print(f"{tag}    stage 1 skipped (credential failure) — going straight to hard recovery")

    # ── Stage 2: hard recovery (kill + restart with config) ──────────
    if _kill_and_restart_terminal():
        print(f"{tag}    retrying after restart ...")
        for attempt in range(5):
            print(f"{tag}    post-restart attempt {attempt+1}/5")
            if _try_initialize_and_login():
                return True
            time.sleep(3 + attempt)

    print(f"{tag} ✗ force_login_base_account FAILED — all recovery paths exhausted")
    return False


# ==================== SELF-HEALING ====================

def kill_terminal():
    try:
        mt5.shutdown()
    except:
        pass
    # Use EXACT path match — NOT a LIKE pattern.
    # Pattern like '%Terminal 1%' would also match Terminal 10, 11, etc.
    wmic_path = TERMINAL_PATH.replace("\\", "\\\\")
    try:
        subprocess.run(
            ["wmic", "process", "where",
             f"ExecutablePath='{wmic_path}'",
             "call", "terminate"],
            capture_output=True, text=True, timeout=10
        )
        print(f"  [W{TERMINAL_ID}] Killed terminal process ({TERMINAL_PATH})")
    except Exception as e:
        try:
            subprocess.run(
                ["taskkill", "/F", "/IM", "terminal64.exe", "/FI",
                 f"WINDOWTITLE eq Terminal {TERMINAL_ID}"],
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

    print(f"  [W{TERMINAL_ID}] Waiting 35s for terminal to connect...")
    time.sleep(35)

    for attempt in range(5):
        if mt5.initialize(TERMINAL_PATH, timeout=15000):
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
    if not mt5.initialize(TERMINAL_PATH, timeout=15000):
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
    if not mt5.initialize(TERMINAL_PATH, timeout=15000):
        return False
    _ipc_connected = True
    return True


# Set by login_user() — True if failure was a credential error (not a terminal problem).
_last_login_was_credential_error: bool = False


def _get_error_code() -> int:
    """Return the numeric code from mt5.last_error(), or 0 if unavailable."""
    err = mt5.last_error()
    if err and isinstance(err, (tuple, list)) and len(err) > 0:
        return err[0]
    return 0


def _restore_base_after_credential_error():
    """
    After a -6 credential error, restore the terminal to the base account.

    Three-stage escalation (stops at first success):
      Stage 1 — Direct login: IPC is still alive after -6 (we got a response),
                so try mt5.login(BASE) immediately. Usually works, zero downtime.
      Stage 2 — Shutdown + initialize + login: clears any dialog state blocking IPC.
      Stage 3 — Async terminal restart: last resort only.
    """
    global _ipc_connected, _current_account_str, _consecutive_failures
    tag = f"  [W{TERMINAL_ID}]"

    # Stage 1 — direct base login (no shutdown, no restart)
    ok = mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER)
    if ok:
        _consecutive_failures = 0
        _current_account_str = str(BASE_ACCOUNT)
        _ipc_connected = True
        print(f"{tag} ✓ Base restored via direct login after credential error")
        return

    print(f"{tag} Direct base login failed ({mt5.last_error()}) — trying shutdown+initialize")

    # Stage 2 — shutdown + initialize + login
    try:
        mt5.shutdown()
    except:
        pass
    _ipc_connected = False
    time.sleep(1)

    if mt5.initialize(TERMINAL_PATH, timeout=15000):
        _ipc_connected = True
        ok = mt5.login(BASE_ACCOUNT, password=BASE_PASSWORD, server=BASE_SERVER)
        if ok:
            _consecutive_failures = 0
            _current_account_str = str(BASE_ACCOUNT)
            print(f"{tag} ✓ Base restored via shutdown+initialize after credential error")
            return

    print(f"{tag} Shutdown+initialize failed — triggering async terminal restart")

    # Stage 3 — full async restart (last resort)
    threading.Thread(
        target=_async_stage2_recovery,
        args=("base login failed after credential error",),
        daemon=True
    ).start()


def login_user(account: int, password: str, server: str) -> bool:
    global _consecutive_failures, _current_account_str, _last_login_was_credential_error
    _last_login_was_credential_error = False
    tag = f"  [W{TERMINAL_ID}]"
    print(f"{tag} login_user: account={account} server={server} _ipc_connected={_ipc_connected}")

    # ── Direct login attempt (IPC already connected) ──────────────────────────
    if _ipc_connected:
        ok = mt5.login(account, password=password, server=server)
        print(f"{tag} login_user: direct login → {'OK' if ok else f'FAILED: {mt5.last_error()}'}")
        if ok:
            _consecutive_failures = 0
            _current_account_str = str(account)
            return True

        if _get_error_code() in CREDENTIAL_ERROR_CODES:
            # -6: broker rejected credentials — terminal is healthy, don't touch it
            _last_login_was_credential_error = True
            print(f"{tag} login_user: -6 credential error — restoring base account")
            _restore_base_after_credential_error()
            return False

    # ── IPC reconnect then retry ──────────────────────────────────────────────
    print(f"{tag} login_user: trying full_reconnect()")
    if full_reconnect():
        print(f"{tag} login_user: full_reconnect OK — retrying login")
        ok = mt5.login(account, password=password, server=server)
        print(f"{tag} login_user: post-reconnect login → {'OK' if ok else f'FAILED: {mt5.last_error()}'}")
        if ok:
            _consecutive_failures = 0
            _current_account_str = str(account)
            return True

        # IPC is provably alive (reconnect succeeded) — login failure = credentials
        _last_login_was_credential_error = True
        if _get_error_code() in CREDENTIAL_ERROR_CODES:
            print(f"{tag} login_user: -6 after reconnect — restoring base account")
            _restore_base_after_credential_error()
        else:
            print(f"{tag} login_user: IPC alive but login failed — treating as credential error")
        return False
    else:
        err_code = _get_error_code()
        print(f"{tag} login_user: full_reconnect FAILED: {mt5.last_error()}")

        if err_code in CREDENTIAL_ERROR_CODES:
            # -6 blocked even mt5.initialize() — credential dialog is blocking IPC.
            # Still a credential error — don't count as terminal failure.
            _last_login_was_credential_error = True
            print(f"{tag} login_user: -6 blocked initialize — credential error, not terminal failure")
            return False

    # ── Real IPC failure — count and possibly heal ────────────────────────────
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


def _async_stage2_recovery(reason: str):
    """
    Run Stage 2 recovery (kill + /config restart) in a background thread.
    The 35s broker wait happens WITHOUT holding the main lock so pull
    requests during recovery fail fast (IPC dead = instant error) rather
    than blocking for 45s and timing out the pull cycle.

    _recovery_in_progress flag prevents multiple simultaneous recovery threads
    from killing the terminal repeatedly (the cascade that caused 3-min restarts).
    """
    global _recovery_in_progress, _ipc_connected
    tag = f"  [W{TERMINAL_ID}]"

    if _recovery_in_progress:
        print(f"{tag} [async recovery] Already in progress — skipping ({reason})")
        return

    _recovery_in_progress = True
    print(f"{tag} [async recovery] Starting — {reason}")

    try:
        _async_stage2_recovery_impl()
    finally:
        _recovery_in_progress = False


def _async_stage2_recovery_impl():
    """Actual recovery logic — called only when _recovery_in_progress is False."""
    tag = f"  [W{TERMINAL_ID}]"

    # Write config and kill terminal (no lock needed — subprocess only)
    config_path = _write_base_config()
    if not config_path:
        return

    # Shutdown IPC briefly under the lock, then release immediately
    acquired = _lock.acquire(timeout=5)
    if acquired:
        try:
            global _ipc_connected
            try:
                mt5.shutdown()
            except:
                pass
            _ipc_connected = False
        finally:
            _lock.release()

    kill_terminal()

    # Relaunch and wait — NO lock held during the 35s broker connection wait
    try:
        subprocess.Popen(
            [TERMINAL_PATH, f"/config:{config_path}"],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        )
        print(f"{tag} [async recovery] Terminal relaunched — waiting 35s for broker...")
        time.sleep(35)
    except Exception as e:
        print(f"{tag} [async recovery] Relaunch error: {e}")
        return

    # Reconnect under the lock
    acquired = _lock.acquire(timeout=30)
    if acquired:
        try:
            for attempt in range(5):
                print(f"{tag} [async recovery] connect attempt {attempt+1}/5")
                if _try_initialize_and_login():
                    print(f"{tag} [async recovery] ✓ recovered")
                    return
                time.sleep(3 + attempt)
            print(f"{tag} [async recovery] ✗ all attempts failed")
        finally:
            _lock.release()


def do_verify(account: int, server: str, password: str) -> dict:
    # Cache hit — known bad credentials, skip login entirely
    if _is_credential_cached(account):
        print(f"  [W{TERMINAL_ID}] do_verify: account {account} in credential cache — skipping login")
        return {"success": False, "error_type": "credential_failure", "message": f"Credential failure cached for account {account}"}

    if not login_user(account, password, server):
        err = mt5.last_error()
        if _last_login_was_credential_error:
            _cache_credential_failure(account)
        else:
            # Terminal/IPC issue — restart in background
            threading.Thread(
                target=_async_stage2_recovery,
                args=("ipc failure in verify",),
                daemon=True
            ).start()
        return {"success": False, "error_type": "credential_failure" if _last_login_was_credential_error else "ipc_failure", "message": f"Login failed: {err}"}

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


def do_pull(account: int, server: str, password: str, from_date: str = None, orders_from_date: str = None, extended_sync: bool = False) -> dict:
    # Cache hit — known bad credentials, skip login entirely, no terminal contact
    if _is_credential_cached(account):
        print(f"  [W{TERMINAL_ID}] do_pull: account {account} in credential cache — skipping login")
        return {"success": False, "error_type": "credential_failure", "message": f"Credential failure cached for account {account}"}

    if not login_user(account, password, server):
        err = mt5.last_error()
        if _last_login_was_credential_error:
            _cache_credential_failure(account)
        else:
            # Terminal/IPC issue — restart in background
            threading.Thread(
                target=_async_stage2_recovery,
                args=("ipc failure in pull",),
                daemon=True
            ).start()
        return {"success": False, "error_type": "credential_failure" if _last_login_was_credential_error else "ipc_failure", "message": f"Login failed: {err}"}

    # ── Pre-flight: verify terminal is connected to broker ───────────────────
    term_info = mt5.terminal_info()
    if not term_info or not term_info.connected:
        return {"success": False, "error_type": "ipc_failure", "message": "Terminal not connected to broker"}

    date_to = datetime.now(timezone.utc)

    # ── Prime broker history cache ────────────────────────────────────────────
    # Calling history_deals_total() with a wide range immediately after login
    # sends the full history request to the broker, starting the stream earlier.
    mt5.history_deals_total(datetime(2020, 1, 1, tzinfo=timezone.utc), date_to)

    # ── Dynamic wait based on broker ping ────────────────────────────────────
    # High ping = slow broker connection = need more time for history to stream.
    # ping_last is in microseconds — convert to ms for readable calculation.
    ping_ms = (term_info.ping_last / 1000.0) if (term_info.ping_last and term_info.ping_last > 0) else 500.0
    wait_sec = max(6.0, min(20.0, ping_ms / 50.0))
    if extended_sync:
        # Midnight 25h safety pull — give the broker double the time to stream
        # a full day+ of history before we start reading it.
        wait_sec *= 2.0
        print(f"  [W{TERMINAL_ID}] Broker ping: {ping_ms:.0f}ms — extended_sync ON — waiting {wait_sec:.1f}s for history sync")
    else:
        print(f"  [W{TERMINAL_ID}] Broker ping: {ping_ms:.0f}ms — waiting {wait_sec:.1f}s for history sync")
    time.sleep(wait_sec)

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

    open_positions_sl = {}
    try:
        open_pos = mt5.positions_get()
        if open_pos:
            for pos in open_pos:
                if pos.sl or pos.tp:
                    open_positions_sl[pos.ticket] = {"sl": pos.sl, "tp": pos.tp}
    except:
        pass

    # ── Stabilization loop — wait until deal history is fully streamed ────────
    # Rules:
    #   1. Never accept count=0 as "stable" — broker just hasn't started streaming
    #   2. Require count>0 AND same value 3 consecutive reads before accepting
    #   3. Max 20 iterations × 1s = 20s maximum wait
    prev_count = -1
    stable_streak = 0
    trades_raw = None
    for _ in range(20):
        trades_raw = mt5.history_deals_get(date_from, date_to)
        current_count = len(trades_raw) if trades_raw is not None else 0

        if current_count == 0:
            # Broker hasn't started streaming yet — reset and keep waiting
            stable_streak = 0
            prev_count = 0
            time.sleep(1)
            continue

        if current_count == prev_count:
            stable_streak += 1
            if stable_streak >= 2:  # same count 3 times in a row AND > 0 — done
                break
        else:
            stable_streak = 0  # count still growing — keep waiting

        prev_count = current_count
        time.sleep(1)

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

    # ── Balance operations (deposits / withdrawals / swap / dividend) ─────────
    # MT5 deal types that affect balance but are not trades:
    #   2  = DEAL_TYPE_BALANCE    (deposits, withdrawals, corrections)
    #   12 = DEAL_TYPE_INTEREST   (swap/interest charges)
    #   15 = DEAL_TYPE_DIVIDEND
    #   16 = DEAL_TYPE_DIVIDEND_FRANKED
    BALANCE_OP_TYPES = {
        2:  lambda p: "withdrawal" if p < 0 else "deposit",
        12: lambda p: "swap",
        15: lambda p: "dividend",
        16: lambda p: "dividend",
    }
    balance_ops = []
    if trades_raw is not None:
        for deal in trades_raw:
            if deal.type in BALANCE_OP_TYPES:
                balance_ops.append({
                    "ticket":  deal.ticket,
                    "time":    datetime.fromtimestamp(deal.time, tz=timezone.utc).isoformat(),
                    "amount":  deal.profit,
                    "op_type": BALANCE_OP_TYPES[deal.type](deal.profit),
                    "comment": deal.comment or "",
                })

    return {
        "success":     True,
        "message":     f"Pulled {len(trades_list)} trades, {len(deals_list)} deals, {len(balance_ops)} balance ops",
        "balance":     balance,
        "equity":      equity,
        "trades":      trades_list,
        "deals":       deals_list,
        "balance_ops": balance_ops,
        "terminal_id": TERMINAL_ID,
    }


def _wait_history_cache(term_info) -> None:
    """
    Primes the broker history stream and blocks until a full date-range
    deals_get() reports a stable count (or 20 one-second attempts are
    exhausted) — the same stabilization logic used by do_list_positions().
    Position-scoped history_orders_get/history_deals_get(position=...) calls
    read from this same local cache, so they're just as vulnerable to a cold
    cache returning empty/partial results right after login.
    """
    date_to = datetime.now(timezone.utc)
    mt5.history_deals_total(datetime(2020, 1, 1, tzinfo=timezone.utc), date_to)
    ping_ms = (term_info.ping_last / 1000.0) if (term_info.ping_last and term_info.ping_last > 0) else 500.0
    time.sleep(max(6.0, min(20.0, ping_ms / 50.0)))

    prev_count = -1
    stable_streak = 0
    for _ in range(20):
        deals = mt5.history_deals_get(datetime(2020, 1, 1, tzinfo=timezone.utc), date_to)
        current_count = len(deals) if deals is not None else 0

        if current_count == 0:
            stable_streak = 0
            prev_count = 0
            time.sleep(1)
            continue

        if current_count == prev_count:
            stable_streak += 1
            if stable_streak >= 2:
                break
        else:
            stable_streak = 0

        prev_count = current_count
        time.sleep(1)


def do_resolve_opens(account: int, server: str, password: str, position_ids: list) -> dict:
    """
    Targeted fix for trades whose open_time/open_price came back null from a bulk
    windowed /pull (the position's opening order/deal fell outside that pull's
    date range). Looks up each position directly by position_id — no date range
    needed, since MT5 indexes deal/order history by position regardless of when
    it occurred — so this can find an opening that happened long before the
    window any /pull call queried.
    One login session handles the whole batch of position_ids passed in.
    """
    if _is_credential_cached(account):
        return {"success": False, "error_type": "credential_failure", "message": f"Credential failure cached for account {account}"}

    if not login_user(account, password, server):
        err = mt5.last_error()
        if _last_login_was_credential_error:
            _cache_credential_failure(account)
        else:
            threading.Thread(target=_async_stage2_recovery, args=("ipc failure in resolve_opens",), daemon=True).start()
        return {"success": False, "error_type": "credential_failure" if _last_login_was_credential_error else "ipc_failure", "message": f"Login failed: {err}"}

    term_info = mt5.terminal_info()
    if not term_info or not term_info.connected:
        return {"success": False, "error_type": "ipc_failure", "message": "Terminal not connected to broker"}

    # Prime + stabilize the broker history stream before querying — a flat sleep
    # isn't reliable on a cold cache, so wait for a full date-range deals_get to
    # report a stable count first (same approach as do_list_positions/do_pull).
    # Without this, position-scoped history_orders_get/history_deals_get calls
    # silently return empty/partial right after login.
    _wait_history_cache(term_info)

    resolved = {}
    for pos_id in position_ids:
        open_time = None
        open_price = None

        try:
            pos_orders = mt5.history_orders_get(position=pos_id)
        except Exception:
            pos_orders = None
        if pos_orders:
            opening_orders = [o for o in pos_orders if o.position_id == pos_id]
            if opening_orders:
                opening_orders.sort(key=lambda o: o.time_setup)
                first = opening_orders[0]
                if first.time_setup:
                    open_time = datetime.fromtimestamp(first.time_setup, tz=timezone.utc).isoformat()
                    open_price = first.price_open

        if open_time is None:
            try:
                pos_deals = mt5.history_deals_get(position=pos_id)
            except Exception:
                pos_deals = None
            if pos_deals:
                opening_deals = [d for d in pos_deals if d.position_id == pos_id and d.entry == 0]
                if opening_deals:
                    opening_deals.sort(key=lambda d: d.time)
                    first = opening_deals[0]
                    open_time = datetime.fromtimestamp(first.time, tz=timezone.utc).isoformat()
                    open_price = first.price

        if open_time:
            resolved[str(pos_id)] = {"open_time": open_time, "open_price": open_price}

    return {
        "success":     True,
        "resolved":    resolved,
        "terminal_id": TERMINAL_ID,
    }


def do_list_positions(account: int, server: str, password: str, from_date: str, to_date: str) -> dict:
    """
    Ground-truth check: returns the distinct closed position_ids MT5 actually has
    for this account in [from_date, to_date], independent of whatever ended up
    saved in the DB. Used to detect trades that were dropped somewhere between
    a windowed /pull and the database (not just null open_time — entirely missing
    rows), so they can be targeted for recovery via /resolve-trades.
    """
    if _is_credential_cached(account):
        return {"success": False, "error_type": "credential_failure", "message": f"Credential failure cached for account {account}"}

    if not login_user(account, password, server):
        err = mt5.last_error()
        if _last_login_was_credential_error:
            _cache_credential_failure(account)
        else:
            threading.Thread(target=_async_stage2_recovery, args=("ipc failure in list_positions",), daemon=True).start()
        return {"success": False, "error_type": "credential_failure" if _last_login_was_credential_error else "ipc_failure", "message": f"Login failed: {err}"}

    term_info = mt5.terminal_info()
    if not term_info or not term_info.connected:
        return {"success": False, "error_type": "ipc_failure", "message": "Terminal not connected to broker"}

    try:
        date_from = datetime.fromisoformat(from_date.replace("Z", "+00:00"))
    except Exception:
        date_from = datetime(2020, 1, 1, tzinfo=timezone.utc)
    try:
        date_to = datetime.fromisoformat(to_date.replace("Z", "+00:00"))
    except Exception:
        date_to = datetime.now(timezone.utc)

    # Prime broker history cache, same as do_pull() — starts the stream early.
    mt5.history_deals_total(datetime(2020, 1, 1, tzinfo=timezone.utc), date_to)
    ping_ms = (term_info.ping_last / 1000.0) if (term_info.ping_last and term_info.ping_last > 0) else 500.0
    time.sleep(max(6.0, min(20.0, ping_ms / 50.0)))

    # Same stabilization loop as do_pull() — a single unstabilized read can come
    # back incomplete (e.g. right after a terminal restart, before the broker has
    # finished streaming this account's history), which would make this endpoint's
    # "ground truth" itself miss positions, defeating the whole point of the check.
    prev_count = -1
    stable_streak = 0
    deals = None
    for _ in range(20):
        deals = mt5.history_deals_get(date_from, date_to)
        current_count = len(deals) if deals is not None else 0

        if current_count == 0:
            stable_streak = 0
            prev_count = 0
            time.sleep(1)
            continue

        if current_count == prev_count:
            stable_streak += 1
            if stable_streak >= 2:
                break
        else:
            stable_streak = 0

        prev_count = current_count
        time.sleep(1)

    position_ids = set()
    if deals is not None:
        for deal in deals:
            if deal.entry == 1 and deal.position_id:
                position_ids.add(deal.position_id)

    return {
        "success":      True,
        "position_ids": list(position_ids),
        "terminal_id":  TERMINAL_ID,
    }


def do_resolve_trades(account: int, server: str, password: str, position_ids: list) -> dict:
    """
    Like do_resolve_opens() but returns the full trade record (not just open_time),
    so positions found missing from the DB entirely by /list-positions can be
    inserted directly without a separate /pull round-trip.
    """
    if _is_credential_cached(account):
        return {"success": False, "error_type": "credential_failure", "message": f"Credential failure cached for account {account}"}

    if not login_user(account, password, server):
        err = mt5.last_error()
        if _last_login_was_credential_error:
            _cache_credential_failure(account)
        else:
            threading.Thread(target=_async_stage2_recovery, args=("ipc failure in resolve_trades",), daemon=True).start()
        return {"success": False, "error_type": "credential_failure" if _last_login_was_credential_error else "ipc_failure", "message": f"Login failed: {err}"}

    term_info = mt5.terminal_info()
    if not term_info or not term_info.connected:
        return {"success": False, "error_type": "ipc_failure", "message": "Terminal not connected to broker"}

    # Prime + stabilize the broker history stream before querying — a flat sleep
    # isn't reliable on a cold cache, so wait for a full date-range deals_get to
    # report a stable count first (same approach as do_list_positions/do_pull).
    # Without this, position-scoped history_orders_get/history_deals_get calls
    # silently return empty/partial (e.g. close deal but no open deal) right
    # after login because the terminal's local cache hasn't synced yet.
    _wait_history_cache(term_info)

    trades = []
    for pos_id in position_ids:
        try:
            deals = mt5.history_deals_get(position=pos_id)
        except Exception:
            deals = None
        if not deals:
            continue

        open_deal = None
        close_deals = []
        for d in deals:
            if d.entry == 0 and open_deal is None:
                open_deal = d
            elif d.entry == 1:
                close_deals.append(d)  # collect ALL closing deals (partial closes)

        if not close_deals:
            continue

        try:
            pos_orders = mt5.history_orders_get(position=pos_id)
        except Exception:
            pos_orders = None

        open_time = None
        open_price = None
        sl = 0
        tp = 0
        if pos_orders:
            opening_orders = sorted([o for o in pos_orders if o.position_id == pos_id], key=lambda o: o.time_setup)
            if opening_orders:
                first = opening_orders[0]
                if first.time_setup:
                    open_time = datetime.fromtimestamp(first.time_setup, tz=timezone.utc).isoformat()
                    open_price = first.price_open
            for o in opening_orders:
                if o.sl:
                    sl = o.sl
                if o.tp:
                    tp = o.tp

        if open_time is None and open_deal is not None:
            open_time = datetime.fromtimestamp(open_deal.time, tz=timezone.utc).isoformat()
            open_price = open_deal.price

        if open_deal is not None:
            trade_type = "Buy" if open_deal.type == 0 else "Sell" if open_deal.type == 1 else "Other"
        else:
            first_close = close_deals[0]
            trade_type = "Sell" if first_close.type == 0 else "Buy" if first_close.type == 1 else "Other"

        for close_deal in close_deals:
            trades.append({
                "ticket":      close_deal.ticket,
                "position_id": pos_id,
                "symbol":      close_deal.symbol,
                "type":        trade_type,
                "volume":      close_deal.volume,
                "open_time":   open_time,
                "close_time":  datetime.fromtimestamp(close_deal.time, tz=timezone.utc).isoformat(),
                "open_price":  open_price,
                "close_price": close_deal.price,
                "stop_loss":   sl,
                "take_profit": tp,
                "profit":      close_deal.profit,
                "commission":  close_deal.commission,
                "swap":        close_deal.swap,
                "comment":     close_deal.comment or "",
            })

    return {
        "success":     True,
        "trades":      trades,
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

    if not _ipc_connected:
        if not mt5.initialize(TERMINAL_PATH, timeout=15000):
            return {"success": False, "message": "MT5 not initialized"}

    # Ensure symbol is subscribed so MT5 loads its history
    if not mt5.symbol_select(symbol, True):
        return {"success": False, "message": f"Cannot select symbol {symbol}", "candles": []}

    rates = mt5.copy_rates_range(symbol, tf, date_from, date_to)

    # MT5 may need a moment to load history for newly selected symbols — retry once
    if rates is None or len(rates) == 0:
        import time as _time
        _time.sleep(2)
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


def do_ohlc_bulk(symbol_ranges: list, timeframe: str = "M1") -> dict:
    """Fetch 1-min candles for multiple symbols, each with its own from/to range.
    symbol_ranges: [{"symbol": "EURUSD", "from_time": "...", "to_time": "..."}, ...]
    Returns: {"results": {"EURUSD": {"candles": [...], "count": N}, ...}}
    """
    if not _ipc_connected:
        if not mt5.initialize(TERMINAL_PATH, timeout=15000):
            return {"success": False, "message": "MT5 not initialized", "results": {}}

    tf_map = {
        "M1": mt5.TIMEFRAME_M1, "M5": mt5.TIMEFRAME_M5,
        "M15": mt5.TIMEFRAME_M15, "H1": mt5.TIMEFRAME_H1,
        "H4": mt5.TIMEFRAME_H4, "D1": mt5.TIMEFRAME_D1,
    }
    tf = tf_map.get(timeframe, mt5.TIMEFRAME_M1)

    import time as _time
    results = {}

    for entry in symbol_ranges:
        symbol = entry.get("symbol", "")
        from_time = entry.get("from_time", "")
        to_time = entry.get("to_time", "")

        try:
            date_from = datetime.fromisoformat(from_time.replace("Z", "+00:00").replace(" ", "T"))
            date_to   = datetime.fromisoformat(to_time.replace("Z",   "+00:00").replace(" ", "T"))
        except:
            results[symbol] = {"success": False, "message": "Invalid date format", "candles": [], "count": 0}
            continue

        # Subscribe symbol to ensure history is available
        if not mt5.symbol_select(symbol, True):
            results[symbol] = {"success": False, "message": f"Cannot select {symbol}", "candles": [], "count": 0}
            continue

        rates = mt5.copy_rates_range(symbol, tf, date_from, date_to)
        if rates is None or len(rates) == 0:
            _time.sleep(2)
            rates = mt5.copy_rates_range(symbol, tf, date_from, date_to)

        if rates is None or len(rates) == 0:
            results[symbol] = {"success": False, "message": f"No data for {symbol}", "candles": [], "count": 0}
            continue

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
        results[symbol] = {"success": True, "candles": candles, "count": len(candles)}

    return {"success": True, "results": results}


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
    extended_sync:    Optional[bool] = False


class CandlesRequest(BaseModel):
    symbol:            str
    timeframe:         str = "M1"
    from_time:         str
    to_time:           str
    api_key:           str
    terminal_id:       Optional[int] = None
    required_subtype:  Optional[str] = None


class OhlcSymbolRange(BaseModel):
    symbol:    str
    from_time: str
    to_time:   str


class OhlcBulkRequest(BaseModel):
    symbols:   list[OhlcSymbolRange]
    timeframe: str = "M1"
    api_key:   str


class ResolveOpensRequest(BaseModel):
    account:      str
    server:       str
    password:     str
    api_key:      str
    position_ids: list


class ListPositionsRequest(BaseModel):
    account:   str
    server:    str
    password:  str
    api_key:   str
    from_date: str
    to_date:   str


class ResolveTradesRequest(BaseModel):
    account:      str
    server:       str
    password:     str
    api_key:      str
    position_ids: list


# ==================== ENDPOINTS ====================

@app.get("/health")
def health():
    return {
        "status":               "ok",
        "git_commit":           GIT_COMMIT,
        "git_commit_time":      GIT_COMMIT_TIME,
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
    # Credential cache check BEFORE acquiring the lock — returns instantly
    # without waiting for any ongoing operation (history sync can hold lock 20s+).
    # Prevents scheduler from timing out and retrying.
    if _is_credential_cached(account_number):
        print(f"  [W{TERMINAL_ID}] /verify: account {account_number} in credential cache — instant reject")
        return {"success": False, "error_type": "credential_failure", "message": f"Credential failure cached for account {account_number}"}
    with _lock:
        result = do_verify(account_number, req.server, req.password)
    _schedule_idle_restore()
    return result


@app.post("/pull")
def pull(req: PullRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    account_number = int(req.account.replace("#", "").replace(" ", ""))
    # Credential cache check BEFORE acquiring the lock — returns instantly
    # without waiting for any ongoing operation (history sync can hold lock 20s+).
    # Prevents scheduler from timing out and retrying.
    if _is_credential_cached(account_number):
        print(f"  [W{TERMINAL_ID}] /pull: account {account_number} in credential cache — instant reject")
        return {"success": False, "error_type": "credential_failure", "message": f"Credential failure cached for account {account_number}"}
    print(f"  [W{TERMINAL_ID}] ── PULL ── account={account_number}")
    with _lock:
        result = do_pull(account_number, req.server, req.password, req.from_date, req.orders_from_date, extended_sync=req.extended_sync)
    _schedule_idle_restore()
    return result


@app.post("/resolve-opens")
def resolve_opens(req: ResolveOpensRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    account_number = int(req.account.replace("#", "").replace(" ", ""))
    if _is_credential_cached(account_number):
        print(f"  [W{TERMINAL_ID}] /resolve-opens: account {account_number} in credential cache — instant reject")
        return {"success": False, "error_type": "credential_failure", "message": f"Credential failure cached for account {account_number}"}
    print(f"  [W{TERMINAL_ID}] ── RESOLVE-OPENS ── account={account_number} positions={req.position_ids}")
    with _lock:
        result = do_resolve_opens(account_number, req.server, req.password, req.position_ids)
    _schedule_idle_restore()
    return result


@app.post("/list-positions")
def list_positions(req: ListPositionsRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    account_number = int(req.account.replace("#", "").replace(" ", ""))
    if _is_credential_cached(account_number):
        print(f"  [W{TERMINAL_ID}] /list-positions: account {account_number} in credential cache — instant reject")
        return {"success": False, "error_type": "credential_failure", "message": f"Credential failure cached for account {account_number}"}
    print(f"  [W{TERMINAL_ID}] ── RECONCILE (list-positions) ── account={account_number}")
    with _lock:
        result = do_list_positions(account_number, req.server, req.password, req.from_date, req.to_date)
    _schedule_idle_restore()
    return result


@app.post("/resolve-trades")
def resolve_trades(req: ResolveTradesRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    account_number = int(req.account.replace("#", "").replace(" ", ""))
    if _is_credential_cached(account_number):
        print(f"  [W{TERMINAL_ID}] /resolve-trades: account {account_number} in credential cache — instant reject")
        return {"success": False, "error_type": "credential_failure", "message": f"Credential failure cached for account {account_number}"}
    print(f"  [W{TERMINAL_ID}] ── RESOLVE-TRADES ── account={account_number} positions={req.position_ids}")
    with _lock:
        result = do_resolve_trades(account_number, req.server, req.password, req.position_ids)
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


@app.post("/ohlc-bulk")
def ohlc_bulk(req: OhlcBulkRequest):
    if req.api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")
    symbol_ranges = [{"symbol": s.symbol, "from_time": s.from_time, "to_time": s.to_time} for s in req.symbols]
    print(f"  [W{TERMINAL_ID}] ── OHLC-BULK ── {len(symbol_ranges)} symbol(s)")
    with _lock:
        result = do_ohlc_bulk(symbol_ranges, req.timeframe)
    _schedule_idle_restore()
    return result


# ==================== STARTUP ====================

if __name__ == "__main__":
    print(f"=" * 50)
    print(f"  VPS Worker {TERMINAL_ID} (v9.0 — Credential-Safe Recovery + History Sync Fix)")
    print(f"  Git commit: {GIT_COMMIT}  ({GIT_COMMIT_TIME})")
    print(f"  Terminal: {TERMINAL_PATH}")
    print(f"  Port:     {PORT}")
    print(f"  Home:     {BASE_ACCOUNT} @ {BASE_SERVER} (standard)")
    print(f"  Idle:     {IDLE_TIMEOUT}s — always restores to home account")
    print(f"  Heal after: {MAX_FAILURES_BEFORE_HEAL} consecutive failures")
    print(f"=" * 50)

    # Startup loop: try to connect, if IPC keeps failing kill and relaunch the terminal
    for attempt in range(5):
        if init_terminal():
            print(f"  [W{TERMINAL_ID}] Ready!")
            break
        print(f"  [W{TERMINAL_ID}] Init failed (attempt {attempt+1}/5) — terminal not responding")
        print(f"  [W{TERMINAL_ID}] Killing and relaunching terminal {TERMINAL_ID}...")
        kill_terminal()
        time.sleep(3)
        try:
            subprocess.Popen(
                [TERMINAL_PATH],
                creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
            )
            print(f"  [W{TERMINAL_ID}] Terminal relaunched — waiting 35s for broker connection...")
            time.sleep(25)
        except Exception as e:
            print(f"  [W{TERMINAL_ID}] Relaunch error: {e}")
            time.sleep(10)
    else:
        print(f"  [W{TERMINAL_ID}] WARNING: Could not init after 5 attempts. Starting anyway — self-heal on first request.")

    print(f"  [W{TERMINAL_ID}] Starting on port {PORT}...")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
