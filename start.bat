@echo off
title BLACKOUT OPS - Local Server
cd /d "%~dp0"

rem If the server is already running, just open the game.
netstat -ano | findstr /c:":8080" | findstr /c:"LISTENING" >nul
if not errorlevel 1 (
  echo Server already running on http://localhost:8080
  start "" "http://localhost:8080"
  timeout /t 2 >nul
  exit /b
)

start "" powershell -WindowStyle Hidden -Command "Start-Sleep -Seconds 1; Start-Process 'http://localhost:8080'"
node server.js
pause
