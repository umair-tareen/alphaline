@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 ( echo Install Node.js from nodejs.org first. & start "" https://nodejs.org & pause & exit /b 1 )
node scripts\connect-ai.js
pause
