@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0..\server"

echo ========================================
echo   ScanBridge - PKG Build
echo ========================================
echo.

echo [1/2] Installing pkg...
call npm install -g pkg --registry=https://registry.npmmirror.com 2>&1
if errorlevel 1 (
    echo [WARN] global install failed, trying local...
    call npm install pkg --no-save --registry=https://registry.npmmirror.com 2>&1
)

:: Clean old build artifacts
if exist pkg-config.json del pkg-config.json 2>nul
if exist dist\ScanBridge.exe del dist\ScanBridge.exe 2>nul
if not exist dist mkdir dist

echo.
echo [2/2] Building ScanBridge.exe...
echo     (includes public/* assets for web receiver page)
echo     Mirror: npmmirror.com
echo.

set PKG_NODE_MIRROR=https://npmmirror.com/mirrors/node/
set NODE_MIRROR=https://npmmirror.com/mirrors/node/
set npm_config_node_mirror=https://npmmirror.com/mirrors/node/

:: pkg reads "pkg" config from server/package.json (which has "assets": "public/**/*")
if exist "node_modules\.bin\pkg.cmd" (
    echo     Using local pkg...
    call node_modules\.bin\pkg.cmd . --targets node18-win-x64 --output dist/ScanBridge.exe 2>&1
) else (
    echo     Using global pkg...
    call pkg . --targets node18-win-x64 --output dist/ScanBridge.exe 2>&1
)

if errorlevel 1 (
    echo.
    echo ========================================
    echo   PKG build failed.
    echo ========================================
    echo   Fallback: start-server.bat
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Build Complete!
echo   Output: dist\ScanBridge.exe
echo ========================================
echo.
pause
