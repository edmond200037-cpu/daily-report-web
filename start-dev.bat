@echo off
setlocal

rem Project directory: this .bat file's folder
cd /d "%~dp0"

rem 5173 is reserved by Windows on this machine (excluded range: 5167-5266).
set "DEV_HOST=127.0.0.1"
set "DEV_PORT=5300"

echo Starting Vite dev server at http://%DEV_HOST%:%DEV_PORT%/
call npm.cmd run dev -- --host %DEV_HOST% --port %DEV_PORT%

pause
