# Tauri v2 build muhitini o'rnatish (Windows)
# Ishga tushirish:  powershell -ExecutionPolicy Bypass -File .\setup-tauri.ps1
# Administrator huquqi tavsiya etiladi (Build Tools uchun).

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# 1. Microsoft C++ Build Tools (MSVC + Windows SDK)
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasMsvc = (Test-Path $vswhere) -and (& $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
if ($hasMsvc) {
    Write-Host '[1/4] C++ Build Tools: bor' -ForegroundColor Green
} else {
    Write-Host '[1/4] C++ Build Tools o`rnatilmoqda (bir necha daqiqa)...' -ForegroundColor Yellow
    winget install --id Microsoft.VisualStudio.2022.BuildTools -e --accept-source-agreements --accept-package-agreements `
        --override '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
}

# 2. WebView2 (Windows 10/11 da odatda bor)
$wv2 = Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}' -ErrorAction SilentlyContinue
if ($wv2) {
    Write-Host '[2/4] WebView2: bor' -ForegroundColor Green
} else {
    Write-Host '[2/4] WebView2 o`rnatilmoqda...' -ForegroundColor Yellow
    winget install --id Microsoft.EdgeWebView2Runtime -e --accept-source-agreements --accept-package-agreements
}

# 3. Rust
if (Has rustc) {
    Write-Host "[3/4] Rust: bor ($(rustc --version))" -ForegroundColor Green
} else {
    Write-Host '[3/4] Rust o`rnatilmoqda...' -ForegroundColor Yellow
    winget install --id Rustlang.Rustup -e --accept-source-agreements --accept-package-agreements
    $env:Path += ";$env:USERPROFILE\.cargo\bin"
    rustup default stable-msvc
}

# 4. npm bog'liqliklar
Write-Host '[4/4] npm install...' -ForegroundColor Yellow
npm install

Write-Host "`nTekshiruv:" -ForegroundColor Cyan
npx tauri info

Write-Host "`nTayyor. Terminalni qayta oching, so'ng:" -ForegroundColor Green
Write-Host '  npm run tauri:dev     # development'
Write-Host '  npm run tauri:build   # NSIS + MSI installer'
