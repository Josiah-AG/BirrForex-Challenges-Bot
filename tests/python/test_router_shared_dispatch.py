"""Actual ASGI routes and HTTP forwarding; fake MT5 worker transport only."""
import os,sys,asyncio,unittest,json,time
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps'))
os.environ['VPS_API_KEY']='synthetic-test-key'
os.environ['VPS_METRICS_FILE']='/private/tmp/shared-router-test-metrics.json'
import httpx
import router
from shared_dispatcher import SharedDispatcher
OriginalClient=httpx.AsyncClient

class RouterTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        router.SHARED_DISPATCH_ENABLED=True
        router.dispatcher=SharedDispatcher(12)
        await router.dispatcher.observe(range(1,13),[])
        self.release=asyncio.Event();self.seen=[];self.fail=False
        async def worker(req):
            body=json.loads(req.content);self.seen.append((req.url.port,body))
            if self.fail:raise httpx.ReadTimeout('synthetic timeout')
            await self.release.wait()
            return httpx.Response(200,json={'success':True,'terminal_used':req.url.port-8000,'request_id':body.get('request_id')})
        self.patch=patch.object(router.httpx,'AsyncClient',lambda **kw:OriginalClient(transport=httpx.MockTransport(worker),**kw));self.patch.start()
        self.client=OriginalClient(transport=httpx.ASGITransport(app=router.app),base_url='http://router')
        self.tasks=[]
    async def asyncTearDown(self):
        self.release.set()
        await asyncio.gather(*self.tasks,return_exceptions=True)
        await asyncio.gather(*list(router._dispatch_tasks),return_exceptions=True)
        await self.client.aclose();self.patch.stop()
        self.assertFalse(router.dispatcher.active);self.assertFalse(router.dispatcher.waiters)
    def request(self,priority,terminal=1,flexible=False):
        task=asyncio.create_task(self.client.post('/pull',json={'api_key':'synthetic-test-key','account':'123','password':'synthetic','server':'mock','protocol_version':2,'priority':priority,'terminal_id':terminal,'dispatch_any':flexible,'request_id':'id'}))
        self.tasks.append(task);return task
    async def test_shared_http_path_split_and_identity(self):
        for i in range(1,13):self.request(False,i)
        for i in range(12):self.request(True,1,True)
        await asyncio.sleep(.05)
        s=router.dispatcher.snapshot();self.assertEqual(s['lanes']['challenge']['running'],8);self.assertEqual(s['lanes']['myfxpath']['running'],4)
        self.assertEqual(len({port for port,b in self.seen}),12)
        self.release.set();rs=await asyncio.gather(*self.tasks)
        self.assertTrue(all(r.json()['success'] for r in rs))
    async def test_active_cancellation_retains_lease(self):
        t=self.request(True,1);await asyncio.sleep(.02);t.cancel();await asyncio.gather(t,return_exceptions=True)
        self.assertIn(1,router.dispatcher.active)
        t2=self.request(False,1);await asyncio.sleep(.02);self.assertEqual(len(self.seen),1)
        self.release.set();await t2;self.assertEqual(len(self.seen),2)
    async def test_queued_cancellation_does_not_login(self):
        t=self.request(False,1);await asyncio.sleep(.02)
        t2=self.request(True,1);await asyncio.sleep(.02);t2.cancel();await asyncio.gather(t2,return_exceptions=True);await asyncio.sleep(.02)
        self.release.set();await t;self.assertEqual(len(self.seen),1)
    async def test_timeout_quarantines_terminal_until_probe(self):
        self.fail=True;r=await self.request(True,1);self.assertFalse(r.json()['success']);self.assertIn(1,router.dispatcher.external_busy)
        await router.dispatcher.observe(range(1,13),[]);self.assertNotIn(1,router.dispatcher.external_busy)
    async def test_rollback_legacy_path(self):
        router.SHARED_DISPATCH_ENABLED=False;self.release.set();r=await self.request(False,3)
        self.assertEqual(r.json()['terminal_used'],3);self.assertEqual(router.dispatcher.stats['challenge']['completed'],0)
    async def test_report_and_auth(self):
        r=await self.client.get('/vps-report',params={'api_key':'wrong'});self.assertEqual(r.status_code,401)
        r=await self.client.get('/vps-report',params={'api_key':'synthetic-test-key'});a=r.json()['report']['allocation']
        self.assertEqual(a['healthy'],12);self.assertEqual(len(a['terminals']),12);self.assertNotIn('password',str(a))

if __name__=='__main__':unittest.main()
