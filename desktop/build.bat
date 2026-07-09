@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1
cd /d "%~dp0"

echo ========================================
echo   ScanBridge - Build Script
echo ========================================
echo.

echo [1/3] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo [FAIL] Node.js not found. Please install from https://nodejs.org
    echo.
    echo     npm install:
    echo     1. Close this window
    echo     2. Open a CMD window (Win+R, type: cmd)
    echo     3. Run: cd /d "%~dp0"
    echo     4. Run: npm install
    echo     5. Run: npm run build
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node -v') do set NODE_VER=%%i
echo [ OK ] Node.js found: !NODE_VER!

echo.
echo [2/3] Installing dependencies...
call npm.cmd install --no-audit --no-fund
if errorlevel 1 (
    echo [FAIL] npm install failed.
    echo.
    echo     Try running manually:
    echo       npm install
    echo       npm run build
    pause
    exit /b 1
)
echo [ OK ] Dependencies installed.

echo.
echo [3/3] Building...
echo     - portable exe (no install required)
echo     - NSIS installer
call npm.cmd run build
if errorlevel 1 (
    echo [FAIL] Build failed.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo Output: %~dp0dist
echo.
if exist "dist\*.exe" (
    dir /b dist\*.exe
) else (
    echo (no exe files found)
)
echo.
pause
