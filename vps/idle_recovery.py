"""Idle-only recovery policy, independent of request traffic and MT5 bindings."""
import time


class IdleRecovery:
    def __init__(self, clock=time.monotonic):
        self.clock = clock
        self.failures = 0
        self.next_attempt = 0
        self.last_check = None
        self.last_result = 'starting'
        self.recovered = 0
        self.last_hard = -300

    def tick(self, operation_lock, recovery_lock, probe, reconnect, restart, disabled=False):
        if disabled or self.clock() < self.next_attempt:
            return
        if not recovery_lock.acquire(blocking=False):
            return
        try:
            if not operation_lock.acquire(blocking=False):
                return  # Never interrupt an account operation.
            try:
                self.last_check = time.time()
                if probe():
                    self.failures = 0
                    self.last_result = 'healthy'
                    return
                self.last_result = 'reconnecting'
                if reconnect():
                    self.failures = 0
                    self.recovered += 1
                    self.last_result = 'recovered'
                    return
                self.failures += 1
                self.last_result = 'retry_pending'
                if self.failures >= 3 and self.clock() - self.last_hard >= 300:
                    self.last_hard = self.clock()
                    self.last_result = 'restarting_terminal'
                    if restart():
                        self.failures = 0
                        self.recovered += 1
                        self.last_result = 'recovered'
                    else:
                        self.last_result = 'retry_pending'
                self.next_attempt = self.clock() + min(300, 15 * 2 ** min(self.failures, 4))
            except Exception as exc:
                self.last_result = 'error: ' + type(exc).__name__
                self.next_attempt = self.clock() + 30
            finally:
                operation_lock.release()
        finally:
            recovery_lock.release()
