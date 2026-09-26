"""Execute the actual endpoint AST with mocked MT5, without Windows startup side effects."""
import ast
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace as N
class HttpError(Exception):
    def __init__(self,**kw):pass
class EndpointTests(unittest.TestCase):
    def setup_endpoint(self):
        tree=ast.parse((Path(__file__).resolve().parents[2]/'vps/worker.py').read_text())
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='pull');fn.decorator_list=[]
        self.mt=N(login=lambda *a,**kw:True)
        self.env={'PullRequest':object,'API_KEY':'test','HTTPException':HttpError,'TERMINAL_ID':1,'_lock':threading.Lock(),'_dead_mode':False,'_recovery_in_progress':False,'ensure_ipc':lambda:True,'mt5':self.mt,'time':time,'_get_error_code':lambda:-6,'CREDENTIAL_ERROR_CODES':{-6},'_schedule_idle_restore':lambda:None,'collect_snapshot':lambda *a,**kw:{'success':True,'complete':True},'IncompleteHistory':RuntimeError}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'worker-endpoint','exec'),self.env)
        self.req=N(api_key='test',account='1',server='Broker',password='synthetic',protocol_version=2,request_id='r',anchor_cutoff=None,anchor_balance=None,prior_digest=None,repair_from=None,from_date=None)
        return self.env['pull']
    def test_busy_does_not_login(self):
        pull=self.setup_endpoint();self.env['_lock'].acquire();self.mt.login=lambda *a,**kw:self.fail('busy terminal must not log in')
        self.assertEqual(pull(self.req)['error_type'],'busy')
    def test_request_identity_and_actual_terminal(self):
        pull=self.setup_endpoint();r=pull(self.req);self.assertEqual(r['request_id'],'r');self.assertEqual(r['terminal_used'],1);self.assertFalse(self.env['_lock'].locked())
    def test_fresh_broker_rejection_only(self):
        pull=self.setup_endpoint();self.mt.login=lambda *a,**kw:False
        self.assertEqual(pull(self.req)['error_type'],'credential_failure')
        self.env['_get_error_code']=lambda:-10005
        self.assertEqual(pull(self.req)['error_type'],'ipc_failure')
    def test_login_is_bounded(self):
        pull=self.setup_endpoint();seen=[];self.mt.login=lambda *a,**kw:seen.append(kw) or True;pull(self.req)
        self.assertEqual(seen[0]['timeout'],15000)
    def test_requires_api_key(self):
        pull=self.setup_endpoint();self.req.api_key='wrong'
        with self.assertRaises(HttpError):pull(self.req)
