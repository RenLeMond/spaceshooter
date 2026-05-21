@echo off
chcp 65001 >nul
title 星海猎手：项目启动器 (Port 9999)
cd /d "%~dp0"

echo ======================================================
echo           正在初始化本地 Web 服务器 (端口: 9999)...
echo ======================================================
echo.

set SERVER_TYPE=None

:: 1. 优先尝试检测并使用 Python
where python >nul 2>nul
if %errorlevel% equ 0 (
echo [INFO] 检测到本地已安装 Python，正在创建 Python HTTP 服务...
start /b python -m http.server 9999 >nul 2>&1
set SERVER_TYPE=Python
goto server_started
)

:: 2. 其次尝试检测并使用 Node.js
where npm >nul 2>nul
if %errorlevel% equ 0 (
echo [INFO] 检测到本地已安装 Node.js，正在通过 npx 启动静态服务...
start /b npx http-server -p 9999 --silent >nul 2>&1
set SERVER_TYPE=NodeJS (npx)
goto server_started
)

:: 3. 终极兼容方案：使用 Windows 原生 PowerShell (零环境依赖，完美兼容任何现代 Windows)
echo [INFO] 未检测到 Python/Node.js 运行环境。
echo [INFO] 正在调用 Windows 原生 PowerShell 网络监听器启动静默服务...
start /b powershell -NoProfile -WindowStyle Hidden -Command "$l=New-Object Net.HttpListener; $l.Prefixes.Add('http://localhost:9999/'); $l.Start(); while($l.IsListening){ $c=$l.GetContext(); $rq=$c.Request; $rp=$c.Response; $f=Join-Path . $rq.Url.LocalPath.TrimStart('/'); if($rq.Url.LocalPath -eq '/'){$f='space_shooter.html'}; if(Test-Path $f -PathType Leaf){ $b=[IO.File]::ReadAllBytes($f); $rp.OutputStream.Write($b,0,$b.Length) }else{$rp.StatusCode=404}; $rp.Close() }"
set SERVER_TYPE=PowerShell Native

:server_started
echo [OK] 本地静态 Web 服务已在后台成功挂载！
timeout /t 2 >nul

:menu
cls
echo ======================================================
echo           星海猎手 (Starsea Hunter) 项目中心
echo ======================================================
echo.
echo   [ 本地服务运行中 ]
echo   - 站点地址: http://localhost:9999
echo   - 服务驱动: %SERVER_TYPE%
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
start http://localhost:9999/space_shooter.html
timeout /t 1 >nul
goto menu

:cleanup_exit
echo.
echo 正在安全释放 9999 端口并清理后台服务...
:: 获取占用 9999 端口的 PID 并强制结束进程，防止端口被持续占用
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :9999') do (
taskkill /f /pid %%a >nul 2>&1
)
echo [OK] 本地服务器已关闭。感谢您的游玩！
timeout /t 2 >nul
exit