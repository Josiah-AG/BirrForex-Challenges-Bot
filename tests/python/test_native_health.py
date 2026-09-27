import sys,tempfile,threading,time,csv,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps'))
import native_sltp as n
class HealthTests(unittest.TestCase):
 def test_disabled(self):self.assertEqual(n.probe(None)['status'],'disabled')
 def test_stale(self):
  with tempfile.TemporaryDirectory() as d:
   mt=SimpleNamespace(terminal_info=lambda:SimpleNamespace(data_path=d,connected=True),account_info=lambda:SimpleNamespace(login=1,server='test'))
   self.assertEqual(n.probe(mt,enabled=True)['status'],'stale_heartbeat')
 def test_roundtrip_empty_account(self):
  with tempfile.TemporaryDirectory() as d:
   folder=Path(d)/'MQL5/Files/MyFxPathLevels';folder.mkdir(parents=True);(folder/'heartbeat.txt').write_text('1')
   mt=SimpleNamespace(terminal_info=lambda:SimpleNamespace(data_path=d,connected=True),account_info=lambda:SimpleNamespace(login=1,server='test'))
   def reader():
    for _ in range(200):
     if (folder/'request.csv').exists():
      with (folder/'request.csv').open() as f: row=next(csv.reader(f))
      row[4]=row[5];row[5]='ok'
      with (folder/'response.csv').open('w',newline='') as f:csv.writer(f).writerow(row)
      return
     time.sleep(.005)
   t=threading.Thread(target=reader);t.start();result=n.probe(mt,enabled=True);t.join()
   self.assertEqual(result['status'],'verified');self.assertFalse((folder/'request.csv').exists())
if __name__=='__main__':unittest.main()
