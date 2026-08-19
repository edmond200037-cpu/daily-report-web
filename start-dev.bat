@echo off
setlocal

rem 施工日報 PWA：啟動 Vite 開發伺服器並開啟日報頁面
cd /d "%~dp0"

set "DEV_HOST=127.0.0.1"
set "DEV_PORT=5300"
set "DEV_URL=http://%DEV_HOST%:%DEV_PORT%/#daily"

if not exist "node_modules\.bin\vite.cmd" (
    echo 找不到 node_modules，請先在此資料夾執行 npm install。
    pause
    exit /b 1
)

start "施工日報 - Vite 開發伺服器" /D "%~dp0" cmd /k "call npm.cmd run dev -- --host %DEV_HOST% --port %DEV_PORT%"

rem 留一點時間讓 Vite 啟動，再開啟瀏覽器
timeout /t 2 /nobreak >nul
start "" "%DEV_URL%"

endlocal
