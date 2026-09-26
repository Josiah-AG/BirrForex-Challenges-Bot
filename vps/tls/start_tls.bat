@echo off
title Shared VPS Encrypted Ingress
set "XDG_DATA_HOME=C:\ProgramData\WinnerPipTLS\data"
"C:\ProgramData\WinnerPipTLS\caddy.exe" run --config "%~dp0Caddyfile" --adapter caddyfile
if errorlevel 1 pause
