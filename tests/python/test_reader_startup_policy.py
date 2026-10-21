import tempfile
import unittest
from pathlib import Path
from reader_startup_policy import record_reader_startup, startup_timeout, state_path


class StartupPolicyTests(unittest.TestCase):
    def test_persistent_timeouts_escalate_and_success_resets(self):
        with tempfile.TemporaryDirectory() as directory:
            exe = str(Path(directory) / 'terminal64.exe')
            self.assertEqual(startup_timeout(exe), 120)
            for code in (-10005, -10004):
                record_reader_startup(exe, {'status': 'connection_timeout', 'ipc_error': code})
            self.assertEqual(startup_timeout(exe), 600)
            record_reader_startup(exe, {'ready': True, 'status': 'verified'})
            self.assertEqual(startup_timeout(exe), 120)

    def test_credential_errors_do_not_escalate(self):
        with tempfile.TemporaryDirectory() as directory:
            exe = str(Path(directory) / 'terminal64.exe')
            for _ in range(5):
                record_reader_startup(exe, {'status': 'connection_timeout', 'ipc_error': -6})
            self.assertEqual(startup_timeout(exe), 120)

    def test_corrupt_tracking_does_not_block_startup(self):
        with tempfile.TemporaryDirectory() as directory:
            exe = str(Path(directory) / 'terminal64.exe')
            state_path(exe).write_text('{broken')
            self.assertEqual(startup_timeout(exe), 120)
            record_reader_startup(exe, {'status': 'verified'})
            self.assertEqual(startup_timeout(exe), 120)
