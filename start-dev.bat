@echo off
setlocal

rem Start the Vite dev server for THIS checkout (branch or worktree) and open the daily report page.
rem Each folder gets its own port (5300 + hash of the folder path), so every branch/worktree has its own
rem browser origin and therefore its own IndexedDB; different DB_VERSIONs never collide.
cd /d "%~dp0"

set "DEV_HOST=127.0.0.1"
for /f %%p in ('powershell -NoProfile -Command "$s=0; [Text.Encoding]::UTF8.GetBytes((Get-Location).Path.ToLower()) | ForEach-Object { $s=($s*31+$_) %% 400 }; 5300+$s"') do set "DEV_PORT=%%p"
set "DEV_URL=http://%DEV_HOST%:%DEV_PORT%/#daily"
echo Folder: %CD%
echo URL:    %DEV_URL%

if not exist "node_modules\.bin\vite.cmd" (
    echo node_modules not found. Running npm ci for this folder...
    call npm.cmd ci
    if errorlevel 1 (
        echo npm ci failed.
        pause
        exit /b 1
    )
)

rem Stop an older Vite dev server of THIS folder still holding the port (never touches other checkouts).
powershell -NoProfile -Command "$here=(Get-Location).Path; Get-NetTCPConnection -LocalPort %DEV_PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.OwningProcess); if ($p -and $p.CommandLine -like '*vite*' -and $p.CommandLine -like ('*' + $here + '*')) { Stop-Process -Id $p.ProcessId -Force } }"
timeout /t 1 /nobreak >nul

start "Daily Report - %DEV_PORT%" /D "%~dp0" cmd /k "call npm.cmd run dev -- --host %DEV_HOST% --port %DEV_PORT% --strictPort"

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
echo Vite did not respond within 30 seconds. Check the dev server window (port %DEV_PORT% may belong to another program).
pause

:finish
endlocal
