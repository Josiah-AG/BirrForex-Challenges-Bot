"""Opt-in MT5 reader startup. Caller exclusively owns the terminal operation lock.

Only the managed reader chart profile is reset. Repeated IPC startup timeouts
receive a longer bounded cold-start window. A connected IPC channel is not
a readiness signal.
"""
import os
import time
from pathlib import Path
from native_sltp import probe
from native_history import prime
from reader_startup_policy import startup_timeout, record_reader_startup

PROFILE = 'WinnerPipReader'
OWNER = '.winnerpip-reader-profile'


def data_directory(terminal_path, appdata=None):
    root = Path(appdata or os.environ['APPDATA']) / 'MetaQuotes' / 'Terminal'
    expected = os.path.normcase(os.path.abspath(os.path.dirname(terminal_path)))
    matches = []
    for origin in root.glob('*/origin.txt'):
        raw = origin.read_bytes()
        text = raw.decode('utf-16') if raw.startswith((b'\xff\xfe', b'\xfe\xff')) else raw.decode('utf-8-sig')
        if os.path.normcase(os.path.abspath(text.strip())) == expected:
            matches.append(origin.parent)
    if len(matches) != 1:
        raise RuntimeError('Unique terminal data directory required')
    return matches[0]


def prepare_profile(data):
    """Terminal must be stopped. Refuse pre-existing unowned profiles."""
    folder = Path(data) / 'MQL5' / 'Profiles' / 'Charts' / PROFILE
    if folder.is_symlink():
        raise RuntimeError('Reader profile must not be a symbolic link')
    if folder.exists() and not (folder / OWNER).is_file():
        raise RuntimeError('Reader profile is not owned by this recovery mechanism')
    folder.mkdir(parents=True, exist_ok=True)
    (folder / OWNER).write_text('WinnerPip managed reader charts v1\n')
    # MT5 adds a startup chart on each launch. Avoid accumulating GUI windows.
    for item in folder.iterdir():
        if item.is_file() and (item.suffix.lower() == '.chr' or item.name.lower() == 'order.wnd'):
            item.unlink()
    return folder


def heartbeat_fresh(data, since=None):
    try:
        stamp = (Path(data) / 'MQL5' / 'Files' / 'MyFxPathLevels' / 'heartbeat.txt').stat().st_mtime
        return 0 <= time.time() - stamp <= 15 and (since is None or stamp >= since)
    except OSError:
        return False


def verify(mt5, account, server, deadline):
    """Bounded nonce + native history acknowledgement retries; no order writes."""
    attempts = []
    for attempt in range(3):
        if time.monotonic() >= deadline:
            break
        info, current = mt5.terminal_info(), mt5.account_info()
        if not info or not info.connected or not current or current.login != account or current.server != server:
            return dict(ready=False, status='identity_or_connection', attempts=attempts)
        reader = probe(mt5, enabled=True)
        if reader.get('status') == 'verified':
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            ack = prime(mt5, account, server, enabled=True, timeout=min(3, remaining))
            attempts.append(ack.get('status', 'unavailable'))
            if ack.get('status') == 'requested':
                # Recheck identity after mailbox exchange; never certify another account.
                current = mt5.account_info()
                if current and current.login == account and current.server == server:
                    return dict(ready=True, status='verified', attempts=attempts)
                return dict(ready=False, status='identity_changed', attempts=attempts)
        else:
            attempts.append(reader.get('status', 'unavailable'))
        if attempt < 2:
            time.sleep(max(0, min(.5, deadline - time.monotonic())))
    return dict(ready=False, status='reader_or_history_pending', attempts=attempts)


def restart(mt5, terminal_path, account, password, server, config, kill, launch, timeout=None):
    """Single bounded startup with a delayed IPC fallback for blocked prior logins.

    Avoid initialize() auto-spawning a competing MT5 while startup is incomplete.
    Exceptions leave readiness false; callers retain their existing retry policy.
    """
    timeout = startup_timeout(terminal_path) if timeout is None else timeout
    started = time.monotonic()
    deadline = started + timeout
    result = dict(ready=False, status='starting')
    try:
        data = data_directory(terminal_path)
        kill()
        prepare_profile(data)
        time.sleep(3)
        launched = time.time()
        process = launch(config)
        # A rejected prior login can prevent EA startup until Python restores the
        # home login. Wait for normal startup first, then allow bounded IPC only
        # while our exact launched process remains alive (no immediate auto-spawn).
        # On repeated startup timeouts, let MT5 finish cold startup without
        # repeated IPC/login attempts. A fresh EA heartbeat ends this wait early.
        settle_seconds = 480 if timeout >= 600 else 20
        settle_deadline = min(deadline, time.monotonic()+settle_seconds)
        while time.monotonic() < settle_deadline and not heartbeat_fresh(data, launched):
            if process is not None and process.poll() is not None:
                result['status'] = 'terminal_exited'
                return result
            time.sleep(min(.5, max(0, settle_deadline-time.monotonic())))
        attached = False
        while time.monotonic() < deadline:
            if process is not None and process.poll() is not None:
                result['status'] = 'terminal_exited'
                return result
            if not attached:
                budget = int(min(10000, max(1, (deadline-time.monotonic())*1000)))
                attached = mt5.initialize(terminal_path, login=account, password=password,
                                         server=server, timeout=budget)
                if not attached:
                    error = mt5.last_error()
                    result['ipc_error'] = error[0] if isinstance(error, (tuple, list)) and error else None
                    mt5.shutdown()
            if attached:
                # Missing EA during startup is not success, and not a reason to
                # repeatedly restart the terminal or submit history requests.
                if probe(mt5, enabled=True).get('status') == 'verified':
                    result = verify(mt5, account, server, deadline)
                    return result
                current = mt5.account_info()
                if not current or current.login != account or current.server != server:
                    mt5.shutdown()
                    attached = False
            time.sleep(min(1, max(0, deadline-time.monotonic())))
        result['status'] = 'reader_start_timeout' if attached else 'connection_timeout'
        return result
    except Exception as exc:
        result = dict(ready=False, status='error', error=type(exc).__name__)
        return result
    finally:
        result['startup_budget_seconds'] = timeout
        result['elapsed_seconds'] = round(time.monotonic()-started, 3)
        try:
            record_reader_startup(terminal_path, result)
        except Exception as exc:
            print(f"Reader startup tracking unavailable: {type(exc).__name__}")
