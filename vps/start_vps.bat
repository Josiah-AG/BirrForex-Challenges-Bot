@echo off
setlocal enabledelayedexpansion
echo ==================================================
echo   WinnerPip VPS v6.1 — Starting System
echo   Python 3.12 + Official MT5 Terminals
echo   Terminals: 12 (configurable via VPS_TERMINAL_COUNT)
echo ==================================================
echo.

cd /d C:\BirrForex

REM ──────────────────────────────────────────────────────────────────
REM  TERMINAL COUNT CONFIG
REM  To change: update NUM_TERMINALS below AND set env var:
REM    set VPS_TERMINAL_COUNT=15
REM  Then re-run this bat. The router reads VPS_TERMINAL_COUNT at start.
REM ──────────────────────────────────────────────────────────────────
set NUM_TERMINALS=12

REM Step 1: Write base account config for all terminals, then launch with /config
echo [1/3] Launching %NUM_TERMINALS% MT5 terminals...
for /L %%i in (1,1,%NUM_TERMINALS%) do (
    echo [Common]> "C:\MetaTrader\Terminal %%i\base_login.ini"
    echo Login=435924397>> "C:\MetaTrader\Terminal %%i\base_login.ini"
    echo Password=Abc@1234>> "C:\MetaTrader\Terminal %%i\base_login.ini"
    echo Server=Exness-MT5Trial9>> "C:\MetaTrader\Terminal %%i\base_login.ini"
    echo KeepPrivate=1>> "C:\MetaTrader\Terminal %%i\base_login.ini"
)
for /L %%i in (1,1,%NUM_TERMINALS%) do (
    start "" "C:\MetaTrader\Terminal %%i\terminal64.exe" /config:"C:\MetaTrader\Terminal %%i\base_login.ini"
)
echo     All %NUM_TERMINALS% terminals launched.
echo     Waiting 60 seconds for broker connections...
timeout /t 60 /nobreak >nul

REM Step 2: Start workers (each owns one terminal, 2s apart)
echo.
echo [2/3] Starting %NUM_TERMINALS% workers (py -3.12)...
for /L %%i in (1,1,%NUM_TERMINALS%) do (
    set /a PORT=8000+%%i
    start "VPS Worker %%i" /min py -3.12 vps\worker.py %%i !PORT!
    timeout /t 2 /nobreak >nul
)
echo     All %NUM_TERMINALS% workers started.
echo     Waiting 10 seconds for workers to initialize...
timeout /t 10 /nobreak >nul

REM Step 3: Start router (foreground — keeps batch window alive)
echo.
echo [3/3] Starting router on port 8000...
echo ==================================================
set VPS_TERMINAL_COUNT=%NUM_TERMINALS%
py -3.12 vps\router.py
