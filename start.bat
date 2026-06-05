@echo off
chcp 65001 >nul
title 星海猎手：项目启动器 (Port 9999)
cd /d "%~dp0"

echo ======================================================
echo           正在初始化本地 Web 服务器 (端口: 9999)...
echo ======================================================
echo.

set SERVER_PID=
for /f %%p in ('powershell -NoProfile -Command "$p=Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','tools\local_server.ps1','-Port','9999' -WorkingDirectory '%~dp0' -WindowStyle Hidden -PassThru; $p.Id"') do set SERVER_PID=%%p

if not defined SERVER_PID (
    echo [ERROR] 本地服务器启动失败。
    pause
    exit /b 1
)

timeout /t 2 >nul
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:9999/' -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
    echo [ERROR] 本地服务器未能监听 127.0.0.1:9999。
    taskkill /t /f /pid %SERVER_PID% >nul 2>&1
    pause
    exit /b 1
)

echo [OK] 本地静态 Web 服务已在后台成功挂载！

:menu
cls
echo ======================================================
echo           星海猎手 (Starsea Hunter) 项目中心
echo ======================================================
echo.
echo   [ 本地服务运行中 ]
echo   - 站点地址: http://127.0.0.1:9999
echo   - 服务进程: %SERVER_PID%
echo.
echo   [1] 启动游戏本体 (Space Shooter Game)
echo   [2] 关闭本地服务器并退出
echo.
echo ======================================================
set /p choice=请选择要执行的操作 (1-2):

if "%choice%"=="1" goto play
if "%choice%"=="2" goto cleanup_exit
goto menu

:play
echo 正在打开游戏主页...
start http://127.0.0.1:9999/index.html
timeout /t 1 >nul
goto menu

:cleanup_exit
echo.
echo 正在关闭本启动器创建的本地服务器...
taskkill /t /f /pid %SERVER_PID% >nul 2>&1
echo [OK] 本地服务器已关闭。感谢您的游玩！
timeout /t 2 >nul
exit
