@echo off
REM Launch LaunchFoundry Lite — starts Vite dev server and opens the browser.
title LaunchFoundry Lite
cd /d "%~dp0"

REM Open the browser after a short delay so Vite has time to bind.
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:5173/"

npm run dev
