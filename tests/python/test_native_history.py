import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'vps'))
from native_history import validate_ack, prime
class NativeHistoryTests(unittest.TestCase):
    def test_empty_ack_is_not_complete_history(self):
        result=validate_ack('1,nonce,1,Broker,1,0,0,1770000000\n','nonce',1,'Broker')
        self.assertEqual(result['status'],'requested')
        self.assertNotIn('complete',result)
    def test_wrong_nonce_account_server_truncation_rejected(self):
        for row in ['1,old,1,Broker,1,0,0,1770000000','1,nonce,2,Broker,1,0,0,1770000000',
                    '1,nonce,1,Other,1,0,0,1770000000','1,nonce,1,Broker,1,0',
                    '1,nonce,1,Broker,1,0,-1,1770000000']:
            with self.assertRaises(ValueError):validate_ack(row,'nonce',1,'Broker')
    def test_disabled_never_contacts_terminal(self):
        self.assertEqual(prime(None,1,'Broker'),{'status':'disabled'})
