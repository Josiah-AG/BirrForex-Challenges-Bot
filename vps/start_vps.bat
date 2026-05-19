@echo off
echo ==================================================
echo   WinnerPip VPS v6.0 — Starting System
echo   Python 3.12 + Official MT5 Terminals
echo ==================================================
echo.

cd /d C:\BirrForex

REM Step 1: Launch all 10 MT5 terminals (they auto-login to saved base account)
echo [1/3] Launching MT5 terminals...
start "" "C:\MetaTrader\Terminal 1\terminal64.exe"
start "" "C:\MetaTrader\Terminal 2\terminal64.exe"
start "" "C:\MetaTrader\Terminal 3\terminal64.exe"
start "" "C:\MetaTrader\Terminal 4\terminal64.exe"
start "" "C:\MetaTrader\Terminal 5\terminal64.exe"
start "" "C:\MetaTrader\Terminal 6\terminal64.exe"
start "" "C:\MetaTrader\Terminal 7\terminal64.exe"
start "" "C:\MetaTrader\Terminal 8\terminal64.exe"
start "" "C:\MetaTrader\Terminal 9\terminal64.exe"
start "" "C:\MetaTrader\Terminal 10\terminal64.exe"
echo     All 10 terminals launched.
echo     Waiting 30 seconds for broker connection...
timeout /t 30 /nobreak >nul

REM Step 2: Start workers (each owns one terminal, 2s apart)
echo.
echo [2/3] Starting workers (py -3.12)...
start "VPS Worker 1"  /min py -3.12 vps\worker.py 1  8001
timeout /t 2 /nobreak >nul
start "VPS Worker 2"  /min py -3.12 vps\worker.py 2  8002
timeout /t 2 /nobreak >nul
start "VPS Worker 3"  /min py -3.12 vps\worker.py 3  8003
timeout /t 2 /nobreak >nul
start "VPS Worker 4"  /min py -3.12 vps\worker.py 4  8004
timeout /t 2 /nobreak >nul
start "VPS Worker 5"  /min py -3.12 vps\worker.py 5  8005
timeout /t 2 /nobreak >nul
start "VPS Worker 6"  /min py -3.12 vps\worker.py 6  8006
timeout /t 2 /nobreak >nul
start "VPS Worker 7"  /min py -3.12 vps\worker.py 7  8007
timeout /t 2 /nobreak >nul
start "VPS Worker 8"  /min py -3.12 vps\worker.py 8  8008
timeout /t 2 /nobreak >nul
start "VPS Worker 9"  /min py -3.12 vps\worker.py 9  8009
timeout /t 2 /nobreak >nul
start "VPS Worker 10" /min py -3.12 vps\worker.py 10 8010
echo     All 10 workers started.
echo     Waiting 10 seconds for workers to initialize...
timeout /t 10 /nobreak >nul

REM Step 3: Start router (foreground — keeps batch window alive)
echo.
echo [3/3] Starting router on port 8000...
echo ==================================================
py -3.12 vps\router.py
