import csv
import io
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'vps'))
from native_sltp import recover, validate_response

T = dict(ticket=100, position_id=50, symbol='EURUSD', close_time='2026-09-27T00:00:00+00:00', stop_loss=0, take_profit=1.5)
MS = 1790467200000

def response(nonce='nonce', account='42', server='Broker', ticket='100', sl='1.1', position='50'):
    stream=io.StringIO();w=csv.writer(stream)
    w.writerow(['1',nonce,account,server,'1','ok'])
    w.writerow([ticket,position,'EURUSD',MS,'1',sl,'1.6','1','1'])
    return stream.getvalue()

class NativeTests(unittest.TestCase):
    def test_identity_ticket_position_nonfinite_and_truncation(self):
        self.assertEqual(validate_response(response(),'nonce',42,'Broker',[T])['100']['sl'],1.1)
        for bad in [response(account='43'),response(server='Other'),response(ticket='101'),response(position='51'),response(sl='nan'),response(sl='-1'),response().splitlines()[0],response()+response().splitlines()[1]]:
            with self.assertRaises((ValueError, IndexError)):
                validate_response(bad,'nonce',42,'Broker',[T])

    def test_disabled_never_touches_mt5(self):
        self.assertEqual(recover(None,{},42,'Broker')['status'],'disabled')

    def test_mailbox_and_timeout_preserve_original_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp)/'MQL5'/'Files'/'MyFxPathLevels';folder.mkdir(parents=True)
            mt5=SimpleNamespace(account_info=lambda:SimpleNamespace(login=42,server='Broker'),terminal_info=lambda:SimpleNamespace(connected=True,data_path=tmp))
            def reader():
                for _ in range(100):
                    if (folder/'request.csv').exists():
                        header=next(csv.reader((folder/'request.csv').read_text().splitlines()))
                        (folder/'response.tmp').write_text(response(nonce=header[1]))
                        (folder/'response.tmp').replace(folder/'response.csv');return
                    time.sleep(.005)
            thread=threading.Thread(target=reader);thread.start()
            result={'trades':[dict(T)]};status=recover(mt5,result,42,'Broker',enabled=True,timeout=.5);thread.join()
            self.assertEqual(status['status'],'ok');self.assertEqual(status['recovered_sl'],1);self.assertEqual(status['recovered_tp'],0)
            self.assertEqual(result['trades'][0]['stop_loss'],0);self.assertEqual(result['trades'][0]['take_profit'],1.5)
            self.assertEqual(result['trades'][0]['native_sl_tp']['tp'],1.6)
            # Existing stale response from prior request cannot be accepted.
            result={'trades':[dict(T)]};start=time.monotonic();status=recover(mt5,result,42,'Broker',enabled=True,timeout=.05)
            self.assertEqual(status['status'],'timeout');self.assertLess(time.monotonic()-start,.2)
            self.assertNotIn('native_sl_tp',result['trades'][0]);self.assertFalse((folder/'request.csv').exists())

    def test_account_switch_rejects_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            f=Path(tmp)/'MQL5'/'Files'/'MyFxPathLevels';f.mkdir(parents=True)
            calls=[0]
            def identity():
                calls[0]+=1
                return SimpleNamespace(login=42 if calls[0]==1 else 43,server='Broker')
            mt5=SimpleNamespace(account_info=identity,terminal_info=lambda:SimpleNamespace(connected=True,data_path=tmp))
            def reader():
                while not (f/'request.csv').exists():time.sleep(.001)
                h=next(csv.reader((f/'request.csv').read_text().splitlines()))
                (f/'response.csv').write_text(response(nonce=h[1]))
            thread=threading.Thread(target=reader);thread.start();r={'trades':[dict(T)]}
            status=recover(mt5,r,42,'Broker',enabled=True,timeout=.5);thread.join()
            self.assertEqual(status['status'],'invalid_or_unavailable');self.assertNotIn('native_sl_tp',r['trades'][0])

if __name__=='__main__':unittest.main()
