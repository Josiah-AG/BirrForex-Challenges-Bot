# VPS System Rebuild — Progress Tracker

## ROOT CAUSE (CONFIRMED)
- Exness-downloaded MT5 terminals have IPC DISABLED at the broker build level
- Official MetaTrader5 terminals from https://www.metatrader5.com/en/download WORK
- Python 3.13 + MetaTrader5 5.0.5735 = IPC broken (even with official terminal)
- Python 3.12 + MetaTrader5 5.0.4424 + numpy 1.26.4 = WORKING combination

## WORKING SETUP (CONFIRMED TESTED)
- **Python:** `py -3.12` (Python 3.12.10 installed at C:\Users\Administrator\AppData\Local\Programs\Python\Python312)
- **Package:** MetaTrader5==5.0.4424, numpy==1.26.4
- **Terminals:** Official MT5 from metatrader5.com installed at `C:\MetaTrader\Terminal 1` through `Terminal 10`
- **Base Account:** 435924397 / Abc@1234 / Exness-MT5Trial9 (demo — logged into all 10 terminals)
- **Test confirmed:** Init ✅, Login ✅, Balance ✅

## ARCHITECTURE (10 Independent Workers + 1 Router)

```
Port 8000: Router (FastAPI) — public API, forwards to workers, auto-failover
Port 8001: Worker 1 — owns C:\MetaTrader\Terminal 1\terminal64.exe
Port 8002: Worker 2 — owns C:\MetaTrader\Terminal 2\terminal64.exe
...
Port 8010: Worker 10 — owns C:\MetaTrader\Terminal 10\terminal64.exe
```

### Worker Flow (per request):
1. `mt5.initialize(terminal_path)` — connect to already-running terminal
2. `mt5.login(user_account, password, server)` — switch to user's account
3. Do operation (verify credentials OR pull trade history)
4. `mt5.login(435924397, password='Abc@1234', server='Exness-MT5Trial9')` — switch BACK to base account
5. `mt5.shutdown()` — disconnect Python IPC (terminal stays open)
6. Return result

### Keep-Alive System:
- Twice daily (when no pulls running — e.g., 04:00 and 16:00 EAT)
- On ONE terminal: login to base account, open random 0.01 lot trade (EURUSD/GBPUSD/AUDUSD)
- Wait 5 minutes, close the trade
- Prevents Exness from archiving the demo account due to inactivity

### Batch File (start_vps.bat):
- Launches all 10 terminals (they auto-connect with saved base account)
- Waits 30 seconds for broker connection
- Starts 10 workers (each on its own port, 2s apart)
- Starts router on port 8000

## FILES
- `vps/worker.py` — Single worker (takes terminal_id and port as args)
- `vps/router.py` — Router/API on port 8000 with auto-failover
- `vps/start_vps.bat` — Launches everything
- `vps/keepalive.py` — Keep-alive trade script (cron job)

## TERMINAL PATHS
```
C:\MetaTrader\Terminal 1\terminal64.exe
C:\MetaTrader\Terminal 2\terminal64.exe
C:\MetaTrader\Terminal 3\terminal64.exe
C:\MetaTrader\Terminal 4\terminal64.exe
C:\MetaTrader\Terminal 5\terminal64.exe
C:\MetaTrader\Terminal 6\terminal64.exe
C:\MetaTrader\Terminal 7\terminal64.exe
C:\MetaTrader\Terminal 8\terminal64.exe
C:\MetaTrader\Terminal 9\terminal64.exe
C:\MetaTrader\Terminal 10\terminal64.exe
```

## IMPORTANT NOTES
- Use `py -3.12` NOT `python` (Python 3.13 is also installed but doesn't work with MT5)
- `mt5.shutdown()` only disconnects Python IPC — does NOT close the terminal
- Terminals must be running and logged into base account BEFORE workers start
- After each pull/verify, worker logs back into base account to keep terminal ready
- Old Exness terminals at C:\MT5_1 through C:\MT5_10 are BROKEN — do not use

## CURRENT STATUS: Ready to implement

## NEXT STEPS
1. [x] Terminals installed and logged in (all 10 at C:\MetaTrader\Terminal 1-10)
2. [x] Write worker.py (with base account restore after each operation)
3. [x] Write router.py (with auto-failover)
4. [x] Write start_vps.bat (launches terminals + workers + router using py -3.12)
5. [x] Write keepalive.py (twice-daily random trade)
6. [x] Push to git
7. [ ] Pull on VPS and test single terminal
8. [ ] Test all 10 terminals
9. [ ] Run 500-account stress test
10. [ ] Set up Task Scheduler for keepalive.py (04:00 and 16:00 EAT)
