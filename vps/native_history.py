"""Bounded read-only history synchronization request. Caller holds the MT5 lock.

The acknowledgement is diagnostic only; history_snapshot performs the complete
identity, manifest, position and signed-balance validation after this request.
"""
import csv
import io
import os
import time
import uuid
from pathlib import Path


def validate_ack(text, nonce, account, server):
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) != 1 or len(rows[0]) != 8:
        raise ValueError('Invalid history acknowledgement')
    row = rows[0]
    if row[:4] != ['1', nonce, str(account), server]:
        raise ValueError('History acknowledgement identity mismatch')
    if row[4] not in ('0', '1') or any(not s.isdigit() for s in row[5:]):
        raise ValueError('Invalid history acknowledgement values')
    return dict(status='requested' if row[4] == '1' else 'unavailable',
                native_error=int(row[5]), native_count=int(row[6]), server_time=int(row[7]))


def prime(mt5, account, server, *, enabled=False, timeout=3):
    if not enabled:
        return dict(status='disabled')
    request = temporary = None
    started = time.monotonic()
    try:
        def identity_ok():
            current = mt5.account_info()
            return current is not None and str(current.login) == str(account) and current.server == server
        info = mt5.terminal_info()
        if not info or not info.connected or not identity_ok():
            return dict(status='disconnected_or_changed')
        folder = Path(info.data_path) / 'MQL5' / 'Files' / 'MyFxPathLevels'
        beat = folder / 'heartbeat.txt'
        if not beat.exists() or not 0 <= time.time() - beat.stat().st_mtime <= 15:
            return dict(status='reader_unavailable')
        nonce = uuid.uuid4().hex
        request, temporary = folder / 'history_request.csv', folder / 'history_request.tmp'
        response = folder / 'history_response.csv'
        with temporary.open('w', newline='', encoding='utf-8') as f:
            csv.writer(f).writerow(['1', nonce, account, server, int(time.time()) + 5])
        os.replace(temporary, request)
        deadline = started + max(.05, min(3, timeout))
        while time.monotonic() < deadline:
            try:
                if response.stat().st_size <= 2048:
                    text = response.read_text(encoding='utf-8-sig')
                    header = next(csv.reader(io.StringIO(text)), [])
                    if len(header) > 1 and header[1] == nonce:
                        result = validate_ack(text, nonce, account, server)
                        if not identity_ok():
                            return dict(status='identity_changed')
                        result['elapsed_ms'] = round((time.monotonic() - started) * 1000)
                        return result
            except (OSError, UnicodeError):
                pass
            time.sleep(.025)
        return dict(status='timeout')
    except Exception:
        return dict(status='unavailable')
    finally:
        for path in (request, temporary):
            if path:
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
