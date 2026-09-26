"""Work-conserving 2:1 terminal admission. Contains no broker/account secrets.
Reservations outlive caller cancellation until the downstream operation ends.
"""
import asyncio
import time
from collections import Counter
from contextlib import asynccontextmanager


class SharedDispatcher:
    def __init__(self, count):
        self.count = count
        self.healthy = set()  # fail closed until the first health probe
        self.external_busy = set()
        self.active = {}
        self.waiters = []
        self.cond = asyncio.Condition()
        self.started = time.time()
        self.observed_at = None
        self.stats = {lane: dict(completed=0, failed=0, queue_timeouts=0, cancelled=0,
                                wait_seconds=0., busy_seconds=0., peak=0) for lane in ('challenge', 'myfxpath')}
        self.single_turn = 0

    async def observe(self, healthy, busy):
        async with self.cond:
            self.healthy = set(healthy)
            self.external_busy = set(busy)
            self.observed_at = time.time()
            self._pump()

    def targets(self):
        n = len(self.healthy)
        myfx = max(1, n//3) if n else 0
        return {'challenge': max(1, n-myfx) if n else 0, 'myfxpath': myfx}

    def _choice(self):
        free = self.healthy - self.external_busy - self.active.keys()
        candidates = [(w, free & w['allowed']) for w in self.waiters]
        candidates = [(w, ids) for w, ids in candidates if ids]
        if not candidates:
            return None
        counts = Counter(a['lane'] for a in self.active.values())
        target = self.targets()
        pending = {w['lane'] for w in self.waiters}
        if len(pending) == 2:
            if len(self.healthy) == 1:
                # Very small pools still serve both apps (2:1 turns for one terminal).
                preferred = ('challenge', 'challenge', 'myfxpath')[self.single_turn % 3]
            else:
                preferred = max(pending, key=lambda lane: (target[lane] - counts[lane]) / max(1, target[lane]))
            preferred_candidates = [(w, ids) for w, ids in candidates if w['lane'] == preferred]
            if preferred_candidates:
                candidates = preferred_candidates
            # Otherwise borrow free capacity rather than idle behind a pinned terminal.
        return candidates[0]

    def _pump(self):
        while True:
            choice = self._choice()
            if not choice: return
            w, ids = choice
            self.waiters.remove(w)
            terminal = min(ids)
            w['terminal'] = terminal
            self.active[terminal] = dict(lane=w['lane'], operation=w['operation'], since=time.monotonic())
            self.single_turn += 1
            stats = self.stats[w['lane']]
            stats['wait_seconds'] += time.monotonic() - w['since']
            stats['peak'] = max(stats['peak'], sum(a['lane']==w['lane'] for a in self.active.values()))
            w['future'].set_result(terminal)

    @asynccontextmanager
    async def lease(self, lane, allowed, operation, timeout=60):
        w = dict(lane=lane, allowed=set(allowed), operation=operation, since=time.monotonic(),
                 future=asyncio.get_running_loop().create_future())
        self.waiters.append(w)
        try:
            # Batch arrivals in this loop turn so simultaneous demand shares fairly.
            await asyncio.sleep(0)
            self._pump()
            terminal = await asyncio.wait_for(asyncio.shield(w['future']), timeout)
        except BaseException as exc:
            if w in self.waiters: self.waiters.remove(w)
            if 'terminal' in w: self.active.pop(w['terminal'], None)
            self.stats[lane]['queue_timeouts' if isinstance(exc, asyncio.TimeoutError) else 'cancelled'] += 1
            self._pump()
            raise
        try:
            yield terminal
        finally:
            a = self.active.pop(terminal)
            self.stats[lane]['busy_seconds'] += time.monotonic() - a['since']
            self._pump()

    def snapshot(self):
        now = time.monotonic()
        targets = self.targets()
        lanes = {}
        both = all(any(w['lane']==lane for w in self.waiters) or any(a['lane']==lane for a in self.active.values()) for lane in self.stats)
        for lane, stats in self.stats.items():
            running = [a for a in self.active.values() if a['lane']==lane]
            waiting = [w for w in self.waiters if w['lane']==lane]
            lanes[lane] = dict(stats, running=len(running), queued=len(waiting),
                target=targets[lane] if both else len(self.healthy),
                borrowed=max(0,len(running)-targets[lane]) if both else 0,
                oldest_wait_seconds=max([now-w['since'] for w in waiting] or [0]),
                busy_seconds=stats['busy_seconds']+sum(now-a['since'] for a in running))
        return dict(enabled=True, scope='router operations; counters since router start', started_at=self.started,
            observed_at=self.observed_at, generated_at=time.time(), configured=self.count, healthy=len(self.healthy),
            available=len(self.healthy-self.external_busy-self.active.keys()), lanes=lanes,
            terminals=[dict(id=i, healthy=i in self.healthy, state=('running' if i in self.active else 'external_busy' if i in self.external_busy else 'available' if i in self.healthy else 'unavailable'),
                lane=self.active.get(i,{}).get('lane'), operation=self.active.get(i,{}).get('operation'),
                elapsed_seconds=now-self.active[i]['since'] if i in self.active else 0) for i in range(1,self.count+1)])
