import tempfile
import unittest
from pathlib import Path
from account_cache_recovery import quarantine_account_cache

class CacheRecoveryTests(unittest.TestCase):
    def test_backup_is_scoped_and_preserves_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'MetaQuotes' / 'Terminal'
            for name in ('one', 'two'):
                d = root / name
                (d / 'config').mkdir(parents=True)
                (d / 'origin.txt').write_text('/installs/' + name)
                (d / 'config/accounts.dat').write_bytes(b'original')
                (d / 'config/servers.dat').write_bytes(b'servers')
            backup = quarantine_account_cache('/installs/one/terminal64.exe', tmp, 100000)
            self.assertEqual(Path(backup).read_bytes(), b'original')
            self.assertFalse((root / 'one/config/accounts.dat').exists())
            self.assertEqual((root / 'two/config/accounts.dat').read_bytes(), b'original')
            self.assertEqual((root / 'one/config/servers.dat').read_bytes(), b'servers')
            (root / 'one/config/accounts.dat').write_bytes(b'fresh')
            self.assertIsNone(quarantine_account_cache('/installs/one/terminal64.exe', tmp, 100001))
            self.assertEqual((root / 'one/config/accounts.dat').read_bytes(), b'fresh')
    def test_unknown_path_never_touches_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(RuntimeError):
                quarantine_account_cache('/unknown/terminal64.exe', tmp)

if __name__ == '__main__': unittest.main()
