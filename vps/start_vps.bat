@echo off
echo ==================================================
echo   WinnerPip VPS v6.0 — Starting System
echo   Python 3.12 + Official MT5 Terminals
echo ==================================================
echo.

cd /d C:\BirrForex

REM Step 1: Write base account config for all terminals, then launch with /config
REM         This ensures every terminal starts on the base account regardless of
REM         any corrupted saved state from previous credential failures.
echo [1/3] Launching MT5 terminals...
for /L %%i in (1,1,10) do (
    echo [Common]> "C:\MetaTrader\Terminal %%i\base_login.ini"
    echo Login=435924397>> "C:\MetaTrader\Terminal %%i\base_login.ini"
    echo Password=Abc@1234>> "C:\MetaTrader\Terminal %%i\base_login.ini"
    echo Server=Exness-MT5Trial9>> "C:\MetaTrader\Terminal %%i\base_login.ini"
    echo KeepPrivate=1>> "C:\MetaTrader\Terminal %%i\base_login.ini"
)
start "" "C:\MetaTrader\Terminal 1\terminal64.exe"  /config:"C:\MetaTrader\Terminal 1\base_login.ini"
start "" "C:\MetaTrader\Terminal 2\terminal64.exe"  /config:"C:\MetaTrader\Terminal 2\base_login.ini"
start "" "C:\MetaTrader\Terminal 3\terminal64.exe"  /config:"C:\MetaTrader\Terminal 3\base_login.ini"
start "" "C:\MetaTrader\Terminal 4\terminal64.exe"  /config:"C:\MetaTrader\Terminal 4\base_login.ini"
start "" "C:\MetaTrader\Terminal 5\terminal64.exe"  /config:"C:\MetaTrader\Terminal 5\base_login.ini"
start "" "C:\MetaTrader\Terminal 6\terminal64.exe"  /config:"C:\MetaTrader\Terminal 6\base_login.ini"
start "" "C:\MetaTrader\Terminal 7\terminal64.exe"  /config:"C:\MetaTrader\Terminal 7\base_login.ini"
start "" "C:\MetaTrader\Terminal 8\terminal64.exe"  /config:"C:\MetaTrader\Terminal 8\base_login.ini"
start "" "C:\MetaTrader\Terminal 9\terminal64.exe"  /config:"C:\MetaTrader\Terminal 9\base_login.ini"
start "" "C:\MetaTrader\Terminal 10\terminal64.exe" /config:"C:\MetaTrader\Terminal 10\base_login.ini"
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
