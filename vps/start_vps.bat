@echo off
setlocal enabledelayedexpansion
REM Keep logs visible and Unicode-safe in CMD and redirected diagnostics.
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
REM Guarded rolling restart launches this same BAT once for each visible console.
if /I "%~1"=="--worker" goto single_worker
if /I "%~1"=="--router" goto single_router
echo ==================================================
echo   WinnerPip VPS — Starting System
echo   Python 3.12 + Official MT5 Terminals
echo ==================================================
echo.

cd /d "%~dp0.."

REM Ask user how many terminals to start
set /p NUM_TERMINALS="How many terminals to start? (1-15): "

REM Validate input
if "%NUM_TERMINALS%"=="" set NUM_TERMINALS=10
if %NUM_TERMINALS% LSS 1 set NUM_TERMINALS=1
if %NUM_TERMINALS% GTR 15 set NUM_TERMINALS=15

REM Refuse duplicates; use the guarded restart script for already-running workers.
powershell -NoProfile -Command "$p=@(8000..(8000+[int]$env:NUM_TERMINALS)); if(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $p }) { Write-Host 'Workers already running. Use restart_python.ps1 to restart safely.'; exit 1 }"
if errorlevel 1 goto launch_failed

echo.
echo   Starting %NUM_TERMINALS% terminals...
echo ==================================================
echo.

REM Step 1: Write base account config and launch MT5 terminals
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
    start "VPS Worker %%i" cmd /k call "%~f0" --worker %%i !PORT!
    timeout /t 2 /nobreak >nul
)
echo     All %NUM_TERMINALS% workers started.
echo     Waiting 10 seconds for workers to initialize...
timeout /t 10 /nobreak >nul

REM Step 3: Start router (foreground — keeps batch window alive)
echo.
echo [3/3] Starting router on port 8000 (%NUM_TERMINALS% workers)...
echo ==================================================
set VPS_TERMINAL_COUNT=%NUM_TERMINALS%
title WinnerPip Router
py -3.12 -u vps\router.py
goto :eof

:single_worker
title WinnerPip Worker %~2
py -3.12 -u vps\worker.py %~2 %~3
goto :eof

:single_router
title WinnerPip Router
set VPS_TERMINAL_COUNT=%~2
py -3.12 -u vps\router.py
goto :eof

:launch_failed
echo No new workers were started.
pause
exit /b 1
