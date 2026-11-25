@echo off
title Alphaline
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed yet.
  echo Opening nodejs.org: install the LTS version, then double-click Start Alphaline again.
  start "" https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo First run: setting up Alphaline. This takes about a minute...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo Setup failed. Copy the message above and paste it to your AI. & pause & exit /b 1 )
)
node server.js --open
pause
