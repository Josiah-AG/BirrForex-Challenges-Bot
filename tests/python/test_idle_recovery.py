import sys, pathlib, threading, unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / 'vps'))
from idle_recovery import IdleRecovery

class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.now = 0
        self.r = IdleRecovery(lambda: self.now)
        self.op, self.rec = threading.Lock(), threading.Lock()
        self.calls = []
    def tick(self, healthy=False, soft=True, hard=True, disabled=False):
        def call(name, result):
            self.calls.append(name)
            return result
        self.r.tick(self.op,self.rec,lambda:call('probe',healthy),lambda:call('soft',soft),lambda:call('hard',hard),disabled)
    def test_disconnected_recovers_without_requests(self):
        self.tick();self.assertEqual(self.calls,['probe','soft']);self.assertEqual(self.r.recovered,1)
    def test_busy_and_other_recovery_untouched(self):
        for lock in [self.op,self.rec]:
            lock.acquire();self.tick();lock.release()
        self.assertEqual(self.calls,[])
    def test_healthy_and_disabled_untouched(self):
        self.tick(healthy=True);self.tick(disabled=True);self.assertEqual(self.calls,['probe'])
    def test_backoff_then_exact_terminal_escalation(self):
        for t in [0,30,90]:
            self.now=t;self.tick(soft=False)
        self.assertEqual(self.calls.count('hard'),1);self.assertEqual(self.r.recovered,1)
    def test_exceptions_release_locks(self):
        self.r.tick(self.op,self.rec,lambda:1/0,lambda:False,lambda:False)
        self.assertFalse(self.op.locked());self.assertFalse(self.rec.locked());self.assertIn('error',self.r.last_result)
    def test_failure_is_rate_limited(self):
        self.tick(soft=False);self.tick(soft=False);self.assertEqual(self.calls,['probe','soft'])
    def test_failed_restart_remains_pending_and_retries(self):
        for t in [0,30,90]:
            self.now=t;self.tick(soft=False,hard=False)
        self.assertEqual(self.r.last_result,'retry_pending')
        self.assertFalse(self.op.locked());self.assertFalse(self.rec.locked())
        self.now=self.r.next_attempt;self.tick()
        self.assertEqual(self.r.recovered,1)
if __name__=='__main__':unittest.main()
