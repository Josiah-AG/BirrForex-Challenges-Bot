"""Keep console output off request threads and detect abandoned operation locks."""
import os
import queue
import threading
import time


class NonBlockingConsole:
    def __init__(self, stream, capacity=2048):
        self.stream = stream
        self.queue = queue.Queue(maxsize=capacity)
        self.dropped = 0
        threading.Thread(target=self._write_loop, daemon=True).start()

    def write(self, text):
        try:
            self.queue.put_nowait(text)
        except queue.Full:
            self.dropped += 1
        return len(text)

    def flush(self):
        # A selected Windows console can block flush just as it blocks write.
        pass

    def _write_loop(self):
        while True:
            text = self.queue.get()
            try:
                self.stream.write(text)
                self.stream.flush()
            except Exception:
                self.dropped += 1
            finally:
                self.queue.task_done()

    def __getattr__(self, name):
        return getattr(self.stream, name)


class TimedLock:
    def __init__(self, clock=time.monotonic):
        self._lock = threading.Lock()
        self.clock = clock
        self.since = None

    def acquire(self, blocking=True, timeout=-1):
        acquired = self._lock.acquire(blocking, timeout)
        if acquired:
            self.since = self.clock()
        return acquired

    def release(self):
        self.since = None
        self._lock.release()

    def locked(self):
        return self._lock.locked()

    def age(self):
        since = self.since
        return max(0, self.clock() - since) if since is not None else 0

    def __enter__(self):
        self.acquire()
        return self

    def __exit__(self, *args):
        self.release()


def disable_quick_edit():
    if os.name != 'nt':
        return
    import ctypes
    from ctypes import wintypes
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.GetStdHandle.restype = wintypes.HANDLE
    kernel.GetConsoleMode.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel.SetConsoleMode.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    handle = kernel.GetStdHandle(-10)
    mode = wintypes.DWORD()
    if kernel.GetConsoleMode(handle, ctypes.byref(mode)):
        kernel.SetConsoleMode(handle, (mode.value | 0x80) & ~0x40)


def start_stall_guard(lock, exit_process=os._exit):
    def guard():
        while True:
            time.sleep(5)
            # Health reports stalled at 10 minutes, allowing two alert snapshots
            # before the visible BAT supervisor restarts only this Python worker.
            if lock.age() >= 690:
                exit_process(75)
                return
    thread = threading.Thread(target=guard, daemon=True)
    thread.start()
    return thread
