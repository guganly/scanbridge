@echo off
chcp 65001 >nul 2>&1
title ScanBridge Server
cd /d "%~dp0..\server"

echo.
echo   ========================================
echo     ScanBridge - Server Launcher
echo   ========================================
echo.
echo   Starting local server on port 8080...
echo.

:: Try to find node
set NODE=
where node.exe >nul 2>&1 && set NODE=node.exe
if not defined NODE (
    for %%d in (
        "%ProgramFiles%\nodejs"
        "%ProgramFiles(x86)%\nodejs"
        "%LOCALAPPDATA%\fnm_multishells"
        "%APPDATA%\fnm\node-versions"
        "%USERPROFILE%\.workbuddy\binaries\node\versions"
    ) do (
        if exist "%%d\node.exe" set NODE=%%d\node.exe
        if exist "%%d\*\node.exe" for /d %%v in (%%d\*) do (
            if exist "%%v\node.exe" set NODE=%%v\node.exe
        )
    )
)

if not defined NODE (
    echo   [ERROR] Node.js not found.
    echo   Please install Node.js from https://nodejs.org
    echo   or https://npmmirror.com/mirrors/node/
    echo.
    pause
    exit /b 1
)

echo   Node: %NODE%
echo.

:: Kill any existing server on port 8080
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080 " ^| findstr LISTENING 2^>nul') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: Start server
start "" "%NODE%" "%~dp0..\server\server.js"

:: Wait for server to be ready
:wait
timeout /t 1 /nobreak >nul
curl -s http://localhost:8080/health >nul 2>&1
if errorlevel 1 goto wait

:: Open browser
start http://localhost:8080

echo   Server started! Browser should open shortly.
echo   Close this window to stop the server.
echo.

:: Keep window open
pause >nul
