@echo off
setlocal

rem Start the Vite development server and open the daily report page.
cd /d "%~dp0"

set "DEV_HOST=127.0.0.1"
set "DEV_PORT=5300"
set "DEV_URL=http://%DEV_HOST%:%DEV_PORT%/#daily"

if not exist "node_modules\.bin\vite.cmd" (
    echo node_modules not found. Run npm install in this folder first.
    pause
    exit /b 1
)

start "Daily Report - Vite Dev Server" /D "%~dp0" cmd /k "call npm.cmd run dev -- --host %DEV_HOST% --port %DEV_PORT%"

rem Wait until Vite is ready instead of relying on a fixed delay.
set /a WAIT_RETRIES=30
:wait_for_vite
curl.exe -fsS --max-time 1 "http://%DEV_HOST%:%DEV_PORT%/" >nul 2>&1
if not errorlevel 1 goto open_daily_report
set /a WAIT_RETRIES-=1
if %WAIT_RETRIES% LEQ 0 goto vite_timeout
timeout /t 1 /nobreak >nul
goto wait_for_vite

:open_daily_report
start "" "%DEV_URL%"
goto finish

:vite_timeout
echo Vite did not respond within 30 seconds. Check the dev server window.
pause

:finish
endlocal
