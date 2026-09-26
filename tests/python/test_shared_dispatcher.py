import asyncio
import sys
import time
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps'))
from shared_dispatcher import SharedDispatcher

class DispatchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.d=SharedDispatcher(12)
        await self.d.observe(range(1,13), [])
        self.tasks=[]
    async def asyncTearDown(self):
        for t in self.tasks:t.cancel()
        await asyncio.gather(*self.tasks,return_exceptions=True)
        self.assertFalse(self.d.active)
        self.assertFalse(self.d.waiters)
    def start(self,lane,ids=None,event=None):
        event=event or asyncio.Event()
        async def work():
            async with self.d.lease(lane, ids or range(1,13),'pull') as tid:
                await event.wait()
                return tid
        t=asyncio.create_task(work());self.tasks.append(t);return t,event
    async def settle(self):await asyncio.sleep(.02)
    async def test_solo_each_lane_uses_all(self):
        for lane in ['challenge','myfxpath']:
            jobs=[self.start(lane) for _ in range(12)];await self.settle()
            self.assertEqual(len(self.d.active),12)
            for t,e in jobs:e.set()
            await asyncio.gather(*(t for t,e in jobs))
    async def test_simultaneous_split(self):
        for _ in range(24): self.start('challenge');self.start('myfxpath')
        await self.settle();s=self.d.snapshot()
        self.assertEqual(s['lanes']['challenge']['running'],8)
        self.assertEqual(s['lanes']['myfxpath']['running'],4)
    async def test_nonpreemptive_transfer_both_directions(self):
        for first,second,quota in [('challenge','myfxpath',4),('myfxpath','challenge',8)]:
            jobs=[self.start(first,{i}) for i in range(1,13)];await self.settle()
            for _ in range(12):self.start(second)
            await self.settle();self.assertEqual(self.d.snapshot()['lanes'][second]['running'],0)
            for i in range(quota): jobs[i][1].set();self.start(first,{i+1});await self.settle()
            self.assertEqual(self.d.snapshot()['lanes'][second]['running'],quota)
            for t in self.tasks:t.cancel()
            await asyncio.gather(*self.tasks,return_exceptions=True);self.tasks=[]
    async def test_borrow_unused_share(self):
        self.start('myfxpath')
        for _ in range(15):self.start('challenge')
        await self.settle();s=self.d.snapshot()
        self.assertEqual(s['lanes']['challenge']['running'],11)
    async def test_unhealthy_and_external_busy_excluded(self):
        await self.d.observe([1,2,3],[2])
        for _ in range(5):self.start('myfxpath')
        await self.settle();self.assertEqual(set(self.d.active),{1,3})
        await self.d.observe([1,2,3],[]);await self.settle();self.assertEqual(set(self.d.active),{1,2,3})
    async def test_timeout_and_cancellation_cleanup(self):
        t,e=self.start('challenge',{1});await self.settle()
        with self.assertRaises(asyncio.TimeoutError):
            async with self.d.lease('myfxpath',{1},'pull',timeout=.01):pass
        self.assertFalse(self.d.waiters);self.assertEqual(self.d.stats['myfxpath']['queue_timeouts'],1)
        t2,e2=self.start('myfxpath',{1});await self.settle();t2.cancel();await asyncio.gather(t2,return_exceptions=True)
        self.assertFalse(self.d.waiters);self.assertEqual(self.d.stats['myfxpath']['cancelled'],1)
    async def test_small_pools_both_progress(self):
        for n in [1,2]:
            await self.d.observe(range(1,n+1),[]);seen=[]
            async def quick(lane):
                async with self.d.lease(lane,range(1,n+1),'pull'):
                    seen.append(lane);await asyncio.sleep(.001)
            await asyncio.gather(*(quick(lane) for _ in range(6) for lane in ['challenge','myfxpath']))
            self.assertEqual(seen.count('myfxpath'),6)
    async def test_fixed_terminal_identity_and_exclusions(self):
        t,e=self.start('challenge',{11});await self.settle();self.assertEqual(set(self.d.active),{11});e.set();self.assertEqual(await t,11)
        t,e=self.start('myfxpath',{3,4});await self.settle();self.assertNotIn(11,self.d.active)
    async def test_all_supported_pool_sizes(self):
        for n in range(3,16):
            d=SharedDispatcher(n);await d.observe(range(1,n+1),[])
            release=asyncio.Event()
            async def op(lane):
                async with d.lease(lane,range(1,n+1),'pull'):await release.wait()
            ts=[asyncio.create_task(op(lane)) for _ in range(n) for lane in ['challenge','myfxpath']]
            await asyncio.sleep(.01)
            self.assertEqual(d.snapshot()['lanes']['myfxpath']['running'],n//3)
            self.assertEqual(d.snapshot()['lanes']['challenge']['running'],n-n//3)
            release.set();await asyncio.gather(*ts)

    async def test_no_secrets_in_report(self):
        self.start('myfxpath');await self.settle();s=self.d.snapshot()
        self.assertEqual(s['available'],11);self.assertNotIn('password',str(s));self.assertNotIn('account',str(s))
    async def test_parallel_throughput_baseline(self):
        async def run(dispatched):
            sem=asyncio.Semaphore(12)
            async def op():
                if dispatched:
                    async with self.d.lease('challenge',range(1,13),'pull'):await asyncio.sleep(.015)
                else:
                    async with sem:await asyncio.sleep(.015)
            start=time.monotonic();await asyncio.gather(*(op() for _ in range(120)));return time.monotonic()-start
        baseline=await run(False);shared=await run(True)
        print(f'120 simulated pulls / 12 terminals: baseline={baseline:.3f}s dispatcher={shared:.3f}s')
        self.assertLess(shared,baseline*2) # broad CI bound; real broker timing not simulated

if __name__=='__main__':unittest.main()
