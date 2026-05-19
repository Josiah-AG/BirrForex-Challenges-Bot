@echo off
echo ==================================================
echo   WinnerPip VPS v5.0 — Starting System
echo ==================================================
echo.
echo   Each worker launches its own MT5 terminal.
echo   No need to open terminals manually.
echo.

cd /d C:\BirrForex

REM Step 1: Start workers (each launches its own MT5 terminal)
echo Starting workers (each will launch its own terminal)...
echo.
start "VPS Worker 1"  /min python vps\worker.py 1  8001
timeout /t 5 /nobreak >nul
start "VPS Worker 2"  /min python vps\worker.py 2  8002
timeout /t 5 /nobreak >nul
start "VPS Worker 3"  /min python vps\worker.py 3  8003
timeout /t 5 /nobreak >nul
start "VPS Worker 4"  /min python vps\worker.py 4  8004
timeout /t 5 /nobreak >nul
start "VPS Worker 5"  /min python vps\worker.py 5  8005
timeout /t 5 /nobreak >nul
start "VPS Worker 6"  /min python vps\worker.py 6  8006
timeout /t 5 /nobreak >nul
start "VPS Worker 7"  /min python vps\worker.py 7  8007
timeout /t 5 /nobreak >nul
start "VPS Worker 8"  /min python vps\worker.py 8  8008
timeout /t 5 /nobreak >nul
start "VPS Worker 9"  /min python vps\worker.py 9  8009
timeout /t 5 /nobreak >nul
start "VPS Worker 10" /min python vps\worker.py 10 8010

echo.
echo All workers launched. Waiting 20 seconds for terminals to connect...
timeout /t 20 /nobreak >nul

REM Step 2: Start router (foreground — keeps the batch file alive)
echo.
echo Starting router on port 8000...
echo ==================================================
python vps\router.py
