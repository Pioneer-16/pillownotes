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
cd /d "%~dp0app\web"
echo 正在启动枕书阁...
start http://localhost:3000
node server.js
pause
