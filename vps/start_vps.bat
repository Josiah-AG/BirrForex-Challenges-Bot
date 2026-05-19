@echo off
echo ==================================================
echo   WinnerPip VPS v5.1 — Starting System
echo ==================================================
echo.

cd /d C:\BirrForex

REM Step 1: Launch all MT5 terminals first
echo [1/3] Launching MT5 terminals...
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
echo     All 10 terminals launched.
echo     Waiting 30 seconds for broker connection...
timeout /t 30 /nobreak >nul

REM Step 2: Start workers (each connects to its pre-launched terminal)
echo.
echo [2/3] Starting workers...
start "VPS Worker 1"  /min python vps\worker.py 1  8001
timeout /t 2 /nobreak >nul
start "VPS Worker 2"  /min python vps\worker.py 2  8002
timeout /t 2 /nobreak >nul
start "VPS Worker 3"  /min python vps\worker.py 3  8003
timeout /t 2 /nobreak >nul
start "VPS Worker 4"  /min python vps\worker.py 4  8004
timeout /t 2 /nobreak >nul
start "VPS Worker 5"  /min python vps\worker.py 5  8005
timeout /t 2 /nobreak >nul
start "VPS Worker 6"  /min python vps\worker.py 6  8006
timeout /t 2 /nobreak >nul
start "VPS Worker 7"  /min python vps\worker.py 7  8007
timeout /t 2 /nobreak >nul
start "VPS Worker 8"  /min python vps\worker.py 8  8008
timeout /t 2 /nobreak >nul
start "VPS Worker 9"  /min python vps\worker.py 9  8009
timeout /t 2 /nobreak >nul
start "VPS Worker 10" /min python vps\worker.py 10 8010
echo     All workers started.
echo     Waiting 10 seconds for workers to connect...
timeout /t 10 /nobreak >nul

REM Step 3: Start router (foreground — keeps batch alive)
echo.
echo [3/3] Starting router on port 8000...
echo ==================================================
python vps\router.py
