@echo off
setlocal
chcp 65001 >nul
title ZAMAZKA - quick online server
set "ZAMAZKA_HOST_DIR=%~dp0ZAMAZKA-SERVER"
echo.
echo ======================================================
echo  ZAMAZKA - One-click online server installer
echo  Downloads the server from your Pocket Works repository.
echo ======================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; $root=$env:ZAMAZKA_HOST_DIR; $base='https://raw.githubusercontent.com/JustSadSock/pocket-works/main/apps/zamazka/server/'; foreach($f in @('module.ts','local/package.json','local/server.mjs','local/start.ps1')) { $p=Join-Path $root $f; New-Item -ItemType Directory -Force -Path (Split-Path $p -Parent) | Out-Null; Write-Host ('Downloading '+$f); Invoke-WebRequest -Uri ($base+$f) -OutFile $p -UseBasicParsing }"
if errorlevel 1 (
  echo ERROR: Cannot download the server files. Check your internet connection.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ZAMAZKA_HOST_DIR%\local\start.ps1"
if errorlevel 1 pause
