# VPS System Rebuild — Progress Tracker

## Architecture: 10 Independent Processes + 1 Router

```
Port 8000: Router (FastAPI) — receives all requests, forwards to correct worker
Port 8001: Worker 1 — owns C:\MT5_1\terminal64.exe
Port 8002: Worker 2 — owns C:\MT5_2\terminal64.exe
...
Port 8010: Worker 10 — owns C:\MT5_10\terminal64.exe
```

Each worker is a standalone Python process (no multiprocessing module).
Router on port 8000 is the public API — same endpoints as before (/health, /verify, /pull).

## Why This Architecture
- No `multiprocessing` module = no IPC/session issues
- Each worker initializes its own MT5 terminal at startup
- If one worker dies, others keep working
- Router handles failover (if assigned worker is down, try another)
- One batch file starts everything

---

## FILES TO CREATE
- [x] `vps/worker.py` — Single worker script (takes terminal_id and port as args)
- [x] `vps/router.py` — Router/API on port 8000
- [x] `vps/start_vps.bat` — Launches all 10 workers + router
- [ ] `vps/test_500.py` — Updated test script

## STEPS

### Step 1: Write the code ✅
- Created `vps/worker.py`
- Created `vps/router.py`  
- Updated `vps/start_vps.bat`

### Step 2: Push to git
- [ ] Commit and push

### Step 3: VPS Setup
- [ ] End current Task Scheduler task
- [ ] Kill all python.exe processes on VPS
- [ ] Close all MT5 terminals
- [ ] `cd C:\BirrForex && git pull`
- [ ] Open all 10 MT5 terminals manually, log in, check "Save password"
- [ ] Close and reopen terminals to confirm they auto-connect (no login popup)
- [ ] Run `C:\BirrForex\vps\start_vps.bat` manually first to test
- [ ] Verify health: `curl http://localhost:8000/health`

### Step 4: Test from Mac
- [ ] Health check from Mac
- [ ] Single pull test (both accounts)
- [ ] 500-account stress test

### Step 5: Task Scheduler Setup
- [ ] Create new task or update existing
- [ ] Program: `C:\BirrForex\vps\start_vps.bat`
- [ ] Start in: `C:\BirrForex`
- [ ] "Run only when user is logged on" (needed for MT5 GUI)
- [ ] Trigger: At system startup
- [ ] Settings: "If task fails, restart every 1 minute"

### Step 6: Verify persistence
- [ ] Reboot VPS
- [ ] Confirm everything auto-starts
- [ ] Test pull from Mac after reboot

---

## CURRENT STATUS: Step 2 — Push to git

## NOTES
- Old `verify_api.py` kept for reference but no longer used
- Router needs `httpx` package: `pip install httpx`
- Workers listen on 127.0.0.1 (localhost only) — not exposed to internet
- Only the router (port 8000) is exposed to the internet
- Each worker does mt5.shutdown() → mt5.initialize() → mt5.login() per request
- No multiprocessing module anywhere — just independent processes
