import threading
import unittest
from worker_resilience import NonBlockingConsole, TimedLock, start_stall_guard
from unittest.mock import patch

class Tests(unittest.TestCase):
    def test_paused_console_does_not_block_caller_and_queue_is_bounded(self):
        gate = threading.Event()
        class Paused:
            def write(self, text): gate.wait(2)
            def flush(self): pass
        output = NonBlockingConsole(Paused(), capacity=2)
        for _ in range(100): output.write('log')
        output.flush()
        self.assertLessEqual(output.queue.qsize(), 2)
        self.assertGreater(output.dropped, 0)
        gate.set()

    def test_lock_age_and_failed_acquire(self):
        now = [0]
        lock = TimedLock(lambda: now[0])
        with lock:
            now[0] = 601
            self.assertEqual(lock.age(), 601)
            self.assertFalse(lock.acquire(blocking=False))
            self.assertEqual(lock.age(), 601)
        self.assertEqual(lock.age(), 0)
        self.assertFalse(lock.locked())
        with lock: self.assertEqual(lock.age(), 0)

    def test_stalled_operation_exits_for_supervisor_recovery(self):
        now = [0]
        lock = TimedLock(lambda: now[0])
        lock.acquire()
        now[0] = 690
        exits = []
        with patch('worker_resilience.time.sleep'):
            thread = start_stall_guard(lock, exits.append)
            thread.join(1)
        self.assertEqual(exits, [75])
        lock.release()

    def test_exception_releases_lock(self):
        lock = TimedLock()
        with self.assertRaises(ValueError):
            with lock: raise ValueError()
        self.assertFalse(lock.locked())

if __name__ == '__main__': unittest.main()
