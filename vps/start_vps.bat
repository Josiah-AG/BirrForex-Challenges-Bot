@echo off
setlocal enabledelayedexpansion
REM Keep logs visible and Unicode-safe in CMD and redirected diagnostics.
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
cd /d "%~dp0.."
REM Guarded rolling restart launches this same BAT once for each visible console.
if /I "%~1"=="--worker" goto single_worker
if /I "%~1"=="--router" goto single_router
title WinnerPip Launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch_vps.ps1"
pause
goto :eof

:single_worker
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch_vps.ps1" -ConsoleOnly
title WinnerPip Worker %~2
py -3.12 -u vps\worker.py %~2 %~3
goto :eof

:single_router
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launch_vps.ps1" -ConsoleOnly
title WinnerPip Router
set VPS_TERMINAL_COUNT=%~2
py -3.12 -u vps\router.py
goto :eof

:launch_failed
echo No new workers were started.
pause
exit /b 1
