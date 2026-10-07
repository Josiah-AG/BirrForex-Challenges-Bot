import os,sys,asyncio,unittest
from pathlib import Path
from unittest.mock import patch,AsyncMock
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps'))
os.environ['VPS_API_KEY']='synthetic-test-key'
os.environ['VPS_METRICS_FILE']='/tmp/candle-router-test-metrics.json'
import router,httpx
class CandleBudgetTests(unittest.IsolatedAsyncioTestCase):
    async def test_empty_market_does_not_change_health_and_attempts_are_bounded(self):
        req=router.CandlesRequest(symbol='AAPLm',from_time='2026-10-06',to_time='2026-10-07',api_key=router.API_KEY,max_terminals=2)
        healthy=[True]*router.NUM_WORKERS
        dispatch=AsyncMock(return_value=httpx.Response(200,json={'success':False,'candles':[],'message':'No candles'}))
        with patch.object(router,'worker_healthy',healthy),patch.object(router,'get_candidates_for_subtype',return_value=list(range(1,13))),patch.object(router,'_dispatch_post',dispatch):
            result=await router._get_candles_impl(req)
            self.assertFalse(result['success']);self.assertEqual(dispatch.await_count,2);self.assertTrue(all(healthy))
    async def test_success_stops_retrying(self):
        req=router.CandlesRequest(symbol='AAPLm',from_time='2026-10-06',to_time='2026-10-07',api_key=router.API_KEY,max_terminals=2)
        dispatch=AsyncMock(return_value=httpx.Response(200,json={'success':True,'candles':[{'time':'2026-10-06T15:00:00Z'}]}))
        with patch.object(router,'get_candidates_for_subtype',return_value=[1,2]),patch.object(router,'_dispatch_post',dispatch):
            self.assertTrue((await router._get_candles_impl(req))['success']);self.assertEqual(dispatch.await_count,1)
if __name__=='__main__':unittest.main()
