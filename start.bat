@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
    echo 正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo 依赖安装失败，请检查网络或手动运行 npm install
        pause
        exit /b 1
    )
)
set PORT=3000
if exist .env (
    for /f "usebackq tokens=1,* delims==" %%a in (.env) do (
        if /i "%%a"=="PORT" set PORT=%%b
    )
)
cd /d "%~dp0app\web"
echo 正在启动枕书阁...
start http://localhost:%PORT%
node server.js
pause
