@echo off
cd /d "%~dp0"
echo 正在启动枕书阁...
start http://localhost:3000
node server.js
pause
