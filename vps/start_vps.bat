@echo off
echo ==================================================
echo   WinnerPip VPS v5.0 — Starting System
echo ==================================================
echo.

cd /d C:\BirrForex

REM Step 1: Launch MT5 terminals (they should auto-login if "Save password" was checked)
echo Starting MT5 terminals...
start "" "C:\MT5_1\terminal64.exe"
start "" "C:\MT5_2\terminal64.exe"
start "" "C:\MT5_3\terminal64.exe"
start "" "C:\MT5_4\terminal64.exe"
start "" "C:\MT5_5\terminal64.exe"
start "" "C:\MT5_6\terminal64.exe"
start "" "C:\MT5_7\terminal64.exe"
start "" "C:\MT5_8\terminal64.exe"
start "" "C:\MT5_9\terminal64.exe"
start "" "C:\MT5_10\terminal64.exe"

echo All terminals launched. Waiting 30 seconds for broker connection...
timeout /t 30 /nobreak >nul

REM Step 2: Start workers (each in its own background process)
echo.
echo Starting workers...
start "VPS Worker 1"  /min python vps\worker.py 1  8001
start "VPS Worker 2"  /min python vps\worker.py 2  8002
start "VPS Worker 3"  /min python vps\worker.py 3  8003
start "VPS Worker 4"  /min python vps\worker.py 4  8004
start "VPS Worker 5"  /min python vps\worker.py 5  8005
start "VPS Worker 6"  /min python vps\worker.py 6  8006
start "VPS Worker 7"  /min python vps\worker.py 7  8007
start "VPS Worker 8"  /min python vps\worker.py 8  8008
start "VPS Worker 9"  /min python vps\worker.py 9  8009
start "VPS Worker 10" /min python vps\worker.py 10 8010

echo Workers starting. Waiting 10 seconds...
timeout /t 10 /nobreak >nul

REM Step 3: Start router (foreground — keeps the batch file alive)
echo.
echo Starting router on port 8000...
echo ==================================================
python vps\router.py
