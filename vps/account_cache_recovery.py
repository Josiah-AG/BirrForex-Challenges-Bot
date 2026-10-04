"""Back up a terminal's local login cache after repeated IPC startup failures.
Never touches broker trades, server configuration, profiles, or EA files.
"""
import json
import os
import time
from pathlib import Path


def quarantine_account_cache(terminal_path, appdata=None, now=None):
    now = time.time() if now is None else now
    root = Path(appdata or os.environ['APPDATA']) / 'MetaQuotes' / 'Terminal'
    installation = os.path.normcase(os.path.abspath(os.path.dirname(terminal_path)))
    matches = []
    for origin in root.glob('*/origin.txt'):
        raw = origin.read_bytes()
        text = raw.decode('utf-16') if raw.startswith((b'\xff\xfe', b'\xfe\xff')) else raw.decode('utf-8-sig')
        if os.path.normcase(os.path.abspath(text.strip())) == installation:
            matches.append(origin.parent)
    if len(matches) != 1:
        raise RuntimeError('Unique terminal data directory not found; cache untouched')
    folder = matches[0] / 'config'
    cache = folder / 'accounts.dat'
    marker = folder / 'account-cache-recovery.json'
    if marker.exists():
        previous = json.loads(marker.read_text())
        if now - float(previous['time']) < 86400:
            return None
    if not cache.exists():
        return None
    backup = folder / ('accounts.dat.recovery-%d.bak' % int(now))
    if backup.exists():
        raise RuntimeError('Backup exists; cache untouched')
    cache.rename(backup)
    marker.write_text(json.dumps({'time': now, 'backup': backup.name}))
    return str(backup)
