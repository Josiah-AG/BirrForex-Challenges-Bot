"""Persist a bounded cold-start allowance across worker restarts.

No cache deletion, credential changes, or changes to account evaluation.
"""
import json
import time
from pathlib import Path


def state_path(terminal_path):
    return Path(terminal_path).parent / 'winnerpip-reader-startup.json'


def read_state(terminal_path):
    try:
        state = json.loads(state_path(terminal_path).read_text())
        return max(0, int(state.get('ipc_failures', 0)))
    except (OSError, ValueError, TypeError, AttributeError):
        return 0


def startup_timeout(terminal_path):
    # MT5 has been observed taking almost seven minutes to finish cold startup.
    # Repeated two-minute attempts must not keep killing it before it is ready.
    return 600 if read_state(terminal_path) >= 2 else 120


def record_reader_startup(terminal_path, result):
    ipc_failure = (result.get('status') == 'connection_timeout'
                   and result.get('ipc_error') in (-10003, -10004, -10005))
    count = min(100, read_state(terminal_path) + 1) if ipc_failure else 0
    path = state_path(terminal_path)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps({'ipc_failures': count, 'updated': time.time()}))
    temporary.replace(path)
