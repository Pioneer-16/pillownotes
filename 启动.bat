@echo off
chcp 65001 >nul
echo.
echo   ╔══════════════════════════════════╗
echo   ║   时间线蓝图 · 枕书阁            ║
echo   ╚══════════════════════════════════╝
echo.
echo   正在启动开发服务器...
echo.
cd /d "%~dp0"
npm run dev
pause
