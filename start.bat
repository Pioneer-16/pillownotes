@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
    echo 正在安装依赖...
    npm install
)
cd /d "%~dp0app\web"
echo 正在启动枕书阁...
start http://localhost:3000
node server.js
pause
