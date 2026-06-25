@echo off
REM Stop any Vite dev server bound to ports 5173-5176.
title Stop LaunchFoundry

for %%P in (5173 5174 5175 5176) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr ":%%P " ^| findstr LISTENING') do (
    echo Stopping node process %%A on port %%P
    taskkill /PID %%A /F >nul 2>&1
  )
)

echo Done.
timeout /t 2 /nobreak >nul
