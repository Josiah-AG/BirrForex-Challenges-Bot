import ast
import pathlib
import tempfile
import sys
import threading
import unittest
from types import SimpleNamespace as N
from unittest.mock import Mock, patch
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]/'vps'))
import terminal_recovery as r

class RecoveryTests(unittest.TestCase):
    def mt5(self):
        return N(terminal_info=lambda:N(connected=True),account_info=lambda:N(login=1,server='S'))
    def test_history_timeout_retries_without_restart_and_succeeds(self):
        with patch.object(r,'probe',return_value={'status':'verified'}), patch.object(r,'prime',side_effect=[{'status':'timeout'},{'status':'requested'}]) as prime, patch.object(r.time,'sleep'):
            result=r.verify(self.mt5(),1,'S',r.time.monotonic()+12)
        self.assertTrue(result['ready']);self.assertEqual(prime.call_count,2)
    def test_history_failure_is_bounded_and_not_ready(self):
        with patch.object(r,'probe',return_value={'status':'verified'}),patch.object(r,'prime',return_value={'status':'timeout'}) as prime,patch.object(r.time,'sleep'):
            self.assertFalse(r.verify(self.mt5(),1,'S',r.time.monotonic()+12)['ready'])
        self.assertEqual(prime.call_count,3)
    def test_identity_change_never_certified(self):
        mt=self.mt5();mt.account_info=Mock(side_effect=[N(login=1,server='S'),N(login=2,server='S')])
        with patch.object(r,'probe',return_value={'status':'verified'}),patch.object(r,'prime',return_value={'status':'requested'}):
            self.assertFalse(r.verify(mt,1,'S',r.time.monotonic()+12)['ready'])
    def test_stale_reader_does_not_request_history(self):
        with patch.object(r,'probe',return_value={'status':'stale_heartbeat'}),patch.object(r,'prime') as prime,patch.object(r.time,'sleep'):
            self.assertFalse(r.verify(self.mt5(),1,'S',r.time.monotonic()+12)['ready'])
        prime.assert_not_called()
    def test_expired_budget_does_not_touch_mt5(self):
        mt=Mock();self.assertFalse(r.verify(mt,1,'S',r.time.monotonic()-1)['ready']);mt.account_info.assert_not_called()
    def test_only_owned_profile_is_reset(self):
        with tempfile.TemporaryDirectory() as tmp:
            parent=pathlib.Path(tmp)/'MQL5/Profiles/Charts';original=parent/'Default';original.mkdir(parents=True);(original/'chart01.chr').write_text('keep')
            managed=r.prepare_profile(tmp);(managed/'chart01.chr').write_text('remove');(managed/'order.wnd').write_text('remove');(managed/'notes.txt').write_text('keep')
            r.prepare_profile(tmp)
            self.assertTrue((original/'chart01.chr').exists());self.assertFalse((managed/'chart01.chr').exists());self.assertTrue((managed/'notes.txt').exists())
    def test_unowned_profile_is_never_deleted(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=pathlib.Path(tmp)/'MQL5/Profiles/Charts'/r.PROFILE;folder.mkdir(parents=True);(folder/'chart01.chr').write_text('keep')
            with self.assertRaises(RuntimeError):r.prepare_profile(tmp)
            self.assertTrue((folder/'chart01.chr').exists())
    def test_failed_kill_never_touches_profile_or_launches(self):
        with patch.object(r,'data_directory',return_value='data'),patch.object(r,'prepare_profile') as prepare:
            launch=Mock();result=r.restart(Mock(),'terminal',1,'secret','S','config',Mock(side_effect=RuntimeError()),launch)
        self.assertFalse(result['ready']);prepare.assert_not_called();launch.assert_not_called()
    def test_no_ipc_auto_launch_before_fresh_heartbeat(self):
        clock=[0.0];events=[]
        def sleep(n):clock[0]+=n
        def beat(*args):events.append('heartbeat');return clock[0]>=4
        mt=Mock();mt.initialize.side_effect=lambda *a,**kw:events.append('initialize') or True
        with patch.object(r,'data_directory',return_value='data'),patch.object(r,'prepare_profile'),patch.object(r,'heartbeat_fresh',side_effect=beat),patch.object(r,'verify',return_value={'ready':True,'status':'verified'}),patch.object(r,'probe',return_value={'status':'verified'}),patch.object(r.time,'monotonic',side_effect=lambda:clock[0]),patch.object(r.time,'sleep',side_effect=sleep):
            self.assertTrue(r.restart(mt,'terminal',1,'secret','S','config',lambda:None,lambda c:None)['ready'])
        self.assertGreaterEqual(events.index('initialize'),3)
    def test_blocked_login_uses_delayed_bounded_ipc_then_verifies_ea(self):
        clock=[0.0];attached_at=[]
        mt=self.mt5();mt.initialize=lambda *a,**kw:attached_at.append(clock[0]) or True
        process=Mock();process.poll.return_value=None
        with patch.object(r,'data_directory',return_value='data'),patch.object(r,'prepare_profile'),patch.object(r,'heartbeat_fresh',return_value=False),patch.object(r,'probe',return_value={'status':'verified'}),patch.object(r,'verify',return_value={'ready':True,'status':'verified'}),patch.object(r.time,'monotonic',side_effect=lambda:clock[0]),patch.object(r.time,'sleep',side_effect=lambda n:clock.__setitem__(0,clock[0]+n)):
            result=r.restart(mt,'terminal',1,'secret','S','config',lambda:None,lambda c:process,timeout=30)
        self.assertTrue(result['ready']);self.assertGreaterEqual(attached_at[0],23)
    def test_exited_process_never_causes_ipc_auto_spawn(self):
        process=Mock();process.poll.return_value=0
        with patch.object(r,'data_directory',return_value='data'),patch.object(r,'prepare_profile'),patch.object(r,'heartbeat_fresh',return_value=False),patch.object(r.time,'sleep'):
            mt=Mock();result=r.restart(mt,'terminal',1,'secret','S','config',lambda:None,lambda c:process)
        self.assertEqual(result['status'],'terminal_exited');mt.initialize.assert_not_called()
    def test_python_only_restart_preserves_current_account(self):
        tree=ast.parse((pathlib.Path(__file__).resolve().parents[2]/'vps/worker.py').read_text())
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_verify_reader')
        verify=Mock(return_value={'ready':True})
        env={'mt5':N(terminal_info=lambda:N(data_path='data'),account_info=lambda:N(login=99,server='Client')),'reader_recovery':N(verify=verify),'BASE_ACCOUNT':1,'BASE_SERVER':'Home','time':r.time}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'recovery','exec'),env)
        self.assertTrue(env[fn.name](preserve_account=True))
        self.assertEqual(verify.call_args.args[1:3],(99,'Client'));self.assertEqual(env['_current_account_str'],'99')
        env[fn.name]()
        self.assertEqual(verify.call_args.args[1:3],(1,'Home'))
    def test_busy_worker_is_never_restarted_by_async_recovery(self):
        tree=ast.parse((pathlib.Path(__file__).resolve().parents[2]/'vps/worker.py').read_text())
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_async_stage2_recovery_impl')
        lock=Mock();lock.acquire.return_value=False;restart=Mock()
        env={'TERMINAL_ID':12,'_lock':lock,'_reader_recovery_enabled':lambda:True,'_restart_reader':restart}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'recovery','exec'),env)
        env[fn.name]();restart.assert_not_called();lock.release.assert_not_called()

if __name__=='__main__':unittest.main()
