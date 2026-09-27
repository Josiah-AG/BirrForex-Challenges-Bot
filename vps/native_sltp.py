"""Optional, read-only terminal mailbox. Caller MUST retain its MT5 worker lock.

Returns closing-level evidence separately; never overwrites Python/order levels.
The terminal's own MQL5/Files sandbox keeps workers isolated. No credentials enter
this mailbox. A missing reader or any validation failure leaves the pull usable.
"""
import csv
import io
import math
import os
import time
import uuid
from pathlib import Path

LAST_RECOVERY_AT = None
MAX_DEALS = 5000
MAX_RESPONSE_BYTES = 2_000_000


def validate_response(text, nonce, account, server, candidates):
    rows = list(csv.reader(io.StringIO(text)))
    if not rows or rows[0] != ['1', nonce, str(account), server, str(len(candidates)), 'ok']:
        raise ValueError('Native response identity/count mismatch')
    if len(rows) != len(candidates) + 1:
        raise ValueError('Native response truncated')
    expected = {str(t['ticket']): t for t in candidates}
    evidence = {}
    for row in rows[1:]:
        if len(row) != 9 or row[0] not in expected or row[0] in evidence:
            raise ValueError('Unexpected/duplicate native deal')
        t = expected[row[0]]
        from datetime import datetime
        close_ms = round(datetime.fromisoformat(t['close_time'].replace('Z', '+00:00')).timestamp()*1000)
        # Python snapshot serializes second or millisecond precision; compare seconds.
        if (row[1] != str(t['position_id']) or row[2] != t['symbol']
                or int(row[3])//1000 != close_ms//1000 or row[4] not in ('1', '2', '3')):
            raise ValueError('Native deal does not match verified snapshot')
        sl, tp = float(row[5]), float(row[6])
        if row[7:] != ['1', '1'] or any(not math.isfinite(v) or v < 0 for v in (sl, tp)):
            raise ValueError('Native property read failed')
        evidence[row[0]] = dict(sl=sl, tp=tp, source='native_closing_deal',
                               ticket=int(row[0]), position_id=int(row[1]), time_msc=int(row[3]))
    return evidence


def recover(mt5, result, account, server, *, enabled=False, timeout=1.5):
    global LAST_RECOVERY_AT
    started = time.monotonic()
    status = dict(status='disabled', elapsed_ms=0, requested=0, recovered_sl=0, recovered_tp=0)
    if not enabled:
        return status
    candidates = [t for t in result.get('trades', []) if not t.get('stop_loss') or not t.get('take_profit')]
    if not candidates:
        status['status'] = 'not_needed'
        return status
    if len(candidates) > MAX_DEALS:
        status['status'] = 'limit_exceeded'
        return status
    status['requested'] = len(candidates)
    request = temporary = None
    try:
        def identity_ok():
            info = mt5.account_info()
            return info is not None and str(info.login) == str(account) and info.server == server
        if not identity_ok():
            raise ValueError('Account changed before native read')
        info = mt5.terminal_info()
        if info is None or not info.connected:
            raise ValueError('Terminal disconnected')
        folder = Path(info.data_path) / 'MQL5' / 'Files' / 'MyFxPathLevels'
        # Deployment creates this directory; don't silently create it on wrong data paths.
        if not folder.is_dir():
            status['status'] = 'reader_not_installed'
            return status
        nonce = uuid.uuid4().hex
        request, temporary, response = folder/'request.csv', folder/'request.tmp', folder/'response.csv'
        timeout = max(0.05, min(float(timeout), 2.0))
        deadline = started + timeout
        with temporary.open('w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['1', nonce, account, server, int(time.time()) + 3, len(candidates)])
            writer.writerows([t['ticket'], t['position_id']] for t in candidates)
        os.replace(temporary, request)
        while time.monotonic() < deadline:
            if response.exists() and response.stat().st_size <= MAX_RESPONSE_BYTES:
                try:
                    text = response.read_text(encoding='utf-8-sig')
                    header = next(csv.reader(io.StringIO(text)), [])
                    if len(header) > 1 and header[1] == nonce:
                        levels = validate_response(text, nonce, account, server, candidates)
                        if not identity_ok():
                            raise ValueError('Account changed during native read')
                        for t in candidates:
                            e = levels[str(t['ticket'])]
                            t['native_sl_tp'] = e
                            status['recovered_sl'] += int(not t.get('stop_loss') and e['sl'] > 0)
                            status['recovered_tp'] += int(not t.get('take_profit') and e['tp'] > 0)
                        LAST_RECOVERY_AT = time.time()
                        status['status'] = 'ok'
                        return status
                except (OSError, UnicodeError):
                    pass  # Windows can briefly deny access during atomic publication.
            time.sleep(min(0.025, max(0, deadline-time.monotonic())))
        status['status'] = 'timeout'
    except Exception:
        # No credentials, account IDs, file contents or paths in public telemetry.
        status['status'] = 'invalid_or_unavailable'
    finally:
        for path in (request, temporary):
            if path:
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    pass
        status['elapsed_ms'] = round((time.monotonic()-started)*1000, 1)
    return status


def probe(mt5, *, enabled=False):
    """Caller holds worker lock. A zero-deal nonce challenge also works on empty accounts."""
    if not enabled:
        return dict(status='disabled')
    request = temporary = None
    try:
        info, account = mt5.terminal_info(), mt5.account_info()
        if not info or not info.connected or not account:
            return dict(status='disconnected')
        folder = Path(info.data_path)/'MQL5'/'Files'/'MyFxPathLevels'
        beat = folder/'heartbeat.txt'
        if not beat.exists() or not 0 <= time.time()-beat.stat().st_mtime <= 15:
            return dict(status='stale_heartbeat')
        nonce = uuid.uuid4().hex
        request, temporary = folder/'request.csv', folder/'request.tmp'
        with temporary.open('w', newline='', encoding='utf-8') as f:
            csv.writer(f).writerow(['1', nonce, account.login, account.server, int(time.time())+3, 0])
        os.replace(temporary, request)
        deadline=time.monotonic()+1.5
        while time.monotonic()<deadline:
            try:
                rows=list(csv.reader(io.StringIO((folder/'response.csv').read_text(encoding='utf-8-sig'))))
                current=mt5.account_info()
                if rows==[['1',nonce,str(account.login),account.server,'0','ok']] and current and current.login==account.login and current.server==account.server:
                    return dict(status='verified', checked_at=time.time(), expires_at=time.time()+120, last_recovery_at=LAST_RECOVERY_AT)
            except (OSError, UnicodeError):
                pass
            time.sleep(.025)
        return dict(status='no_response')
    except Exception:
        return dict(status='unavailable')
    finally:
        for path in (request, temporary):
            if path:
                try: path.unlink(missing_ok=True)
                except OSError: pass
