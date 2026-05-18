@echo off
echo ================================================
echo   WinnerPip VPS - Starting All Terminals + API
echo ================================================

echo.
echo Starting MT5 terminals...

start "" "C:\MT5_1\terminal64.exe"
timeout /t 2 /nobreak >nul
start "" "C:\MT5_2\terminal64.exe"
timeout /t 2 /nobreak >nul
start "" "C:\MT5_3\terminal64.exe"
timeout /t 2 /nobreak >nul
start "" "C:\MT5_4\terminal64.exe"
timeout /t 2 /nobreak >nul
start "" "C:\MT5_5\terminal64.exe"
timeout /t 2 /nobreak >nul
start "" "C:\MT5_6\terminal64.exe"
timeout /t 2 /nobreak >nul
start "" "C:\MT5_7\terminal64.exe"
timeout /t 2 /nobreak >nul
start "" "C:\MT5_8\terminal64.exe"
timeout /t 2 /nobreak >nul
start "" "C:\MT5_9\terminal64.exe"
timeout /t 2 /nobreak >nul
start "" "C:\MT5_10\terminal64.exe"

echo.
echo All terminals launched. Waiting 20 seconds for broker connection...
timeout /t 20 /nobreak >nul

echo.
echo Starting VPS API...
cd /d C:\BirrForex
python vps\verify_api.py
