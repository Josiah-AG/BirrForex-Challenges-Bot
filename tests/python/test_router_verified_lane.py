import ast
import asyncio
import unittest
from pathlib import Path
from types import SimpleNamespace as N

class LaneTests(unittest.IsolatedAsyncioTestCase):
    async def test_verified_myfxpath_uses_limiter_winnerpip_does_not(self):
        tree=ast.parse((Path(__file__).resolve().parents[2]/'vps/router.py').read_text())
        fn=next(n for n in tree.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='pull');fn.decorator_list=[]
        seen=[]
        class Limiter:
            async def __aenter__(self):seen.append('enter')
            async def __aexit__(self,*args):seen.append('exit')
        async def verified(req):seen.append('pull');return {'success':True}
        env={'PullRequest':object,'API_KEY':'test','_myfxpath_limiter':Limiter(),'_verified_pull':verified}
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'router','exec'),env)
        await env['pull'](N(api_key='test',protocol_version=2,priority=True))
        self.assertEqual(seen,['enter','pull','exit']);seen.clear()
        await env['pull'](N(api_key='test',protocol_version=2,priority=False))
        self.assertEqual(seen,['pull'])
