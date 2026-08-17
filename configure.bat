@echo off
REM ============================================================================
REM  configure.bat  — detect this machine's LAN IPv4 and generate config.
REM  Writes:  .env (LIVEKIT_NODE_IP) and livekit.yaml (from template).
REM  Called automatically by start.bat before every "docker compose up", so the
REM  IP is always fresh. Run it manually only if you want to regenerate config
REM  without also starting the stack.
REM ============================================================================
setlocal enabledelayedexpansion

echo Detecting LAN IPv4 address...
for /f "delims=" %%i in ('powershell -NoProfile -Command ^
  "(Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1 -ExpandProperty IPv4Address).IPAddress"') do set "IP=%%i"

if "%IP%"=="" (
  echo.
  echo [ERROR] Could not auto-detect a LAN IP.
  echo         Run "ipconfig", find your IPv4 Address, then edit .env and
  echo         livekit.yaml manually ^(replace __NODE_IP__^).
  exit /b 1
)

echo Detected LAN IP: %IP%

> "%~dp0.env" echo LIVEKIT_NODE_IP=%IP%

powershell -NoProfile -Command ^
  "(Get-Content '%~dp0livekit.template.yaml') -replace '__NODE_IP__','%IP%' | Set-Content '%~dp0livekit.yaml'"

echo.
echo Wrote:  .env, livekit.yaml   (node_ip = %IP%)
echo.
echo  Unity client serverUrl should be:   ws://%IP%:7880
echo.
endlocal
if "%~1"=="" pause
