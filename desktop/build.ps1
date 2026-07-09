# build.ps1 - ScanBridge build script (mirror-aware)
# Run: powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "========================================" -ForegroundColor Green
Write-Host "  ScanBridge - Build Script" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# -------- 国内镜像加速 --------
# 如果直接从 npm/GitHub 下载失败，尝试设置镜像
$env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
$env:npm_config_electron_mirror = $env:ELECTRON_MIRROR
$env:npm_config_registry = "https://registry.npmmirror.com"

Write-Host "Mirror: $env:ELECTRON_MIRROR" -ForegroundColor Gray
Write-Host ""

# -------- Step 1: Check Node.js --------
Write-Host "[1/4] Checking Node.js..." -ForegroundColor Cyan
$nodeVer = & node -v 2>$null
if ($LASTEXITCODE -ne 0 -or -not $nodeVer) {
    Write-Host "[FAIL] Node.js not found: https://nodejs.org" -ForegroundColor Red
    Read-Host "Press Enter"
    exit 1
}
Write-Host "[ OK ] Node $nodeVer" -ForegroundColor Green

# -------- Step 2: Clean previous failed installs --------
Write-Host ""
Write-Host "[2/4] Cleaning..." -ForegroundColor Cyan
if (Test-Path node_modules) {
    Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
    Write-Host "      Removed node_modules/"
}
if (Test-Path package-lock.json) {
    Remove-Item package-lock.json -ErrorAction SilentlyContinue
}
Write-Host "[ OK ] Clean" -ForegroundColor Green

# -------- Step 3: Install dependencies (with retry) --------
Write-Host ""
Write-Host "[3/4] Installing dependencies..." -ForegroundColor Cyan

$maxRetries = 3
$success = $false

for ($i = 1; $i -le $maxRetries; $i++) {
    Write-Host "      Attempt $i / $maxRetries ..." -ForegroundColor Gray
    
    # Use npm.cmd explicitly to bypass PS script blocking
    $npmPath = ""
    try { $npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source } catch {}
    if (-not $npmPath) { $npmPath = "C:\Program Files\nodejs\npm.cmd" }
    
    if (Test-Path $npmPath) {
        & cmd.exe /c "`"$npmPath`" install --no-audit --no-fund 2>&1"
    } else {
        & npm install --no-audit --no-fund 2>&1
    }
    
    if ($LASTEXITCODE -eq 0) {
        # Verify electron was actually installed
        if (Test-Path "node_modules\.bin\electron-builder.cmd") {
            $success = $true
            break
        }
        Write-Host "      electron-builder not found, retrying..." -ForegroundColor Yellow
    } else {
        Write-Host "      Failed (exit code: $LASTEXITCODE)" -ForegroundColor Yellow
    }
    
    if ($i -lt $maxRetries) {
        Write-Host "      Waiting 3s before retry..." -ForegroundColor Gray
        Start-Sleep 3
    }
}

if (-not $success) {
    Write-Host ""
    Write-Host "[FAIL] npm install failed after $maxRetries attempts." -ForegroundColor Red
    Write-Host ""
    Write-Host "  Manual fix:" -ForegroundColor Yellow
    Write-Host "  1. Try a different network (VPN/proxy)" -ForegroundColor Yellow
    Write-Host "  2. npm config set registry https://registry.npmmirror.com" -ForegroundColor Yellow
    Write-Host "  3. npm install" -ForegroundColor Yellow
    Read-Host "Press Enter"
    exit 1
}

Write-Host "[ OK ] Dependencies installed" -ForegroundColor Green

# -------- Step 4: Build --------
Write-Host ""
Write-Host "[4/4] Building..." -ForegroundColor Cyan
Write-Host "      - portable: single exe, no install needed" -ForegroundColor Gray
Write-Host "      - nsis: installer with uninstaller" -ForegroundColor Gray
Write-Host ""

& cmd.exe /c "node_modules\.bin\electron-builder.cmd --win --x64 2>&1"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Build Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Output: $PSScriptRoot\dist" -ForegroundColor White
    Get-ChildItem "$PSScriptRoot\dist\*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 1)
        Write-Host "  $($_.Name)  ($sizeMB MB)" -ForegroundColor White
    }
} else {
    Write-Host ""
    Write-Host "[FAIL] Build failed." -ForegroundColor Red
    Write-Host "  Try: node_modules\.bin\electron-builder.cmd --win --x64" -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter"
