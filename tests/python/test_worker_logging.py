import ast
import io
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace

class LoggingTests(unittest.TestCase):
    def test_legacy_redirected_logs_cannot_break_login_diagnostics(self):
        tree=ast.parse((Path(__file__).resolve().parents[2]/'vps/worker.py').read_text())
        functions=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('configure_log_streams','_ts_print')]
        sink=io.BytesIO()
        stream=io.TextIOWrapper(sink,encoding='cp1252')
        env={'sys':SimpleNamespace(stdout=stream,stderr=stream),'datetime':datetime,'timezone':timezone,'_original_print':lambda *args,**kw:print(*args,file=stream,**kw)}
        exec(compile(ast.Module(body=functions,type_ignores=[]),'worker-logging','exec'),env)
        env['configure_log_streams']()
        env['_ts_print']('login_user: direct login → OK ✓')
        stream.flush()
        self.assertIn(b'login_user: direct login \\u2192 OK',sink.getvalue())
        self.assertIn(b'\\u2713',sink.getvalue())

if __name__=='__main__':unittest.main()
