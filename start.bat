@echo off
REM ============================================================================
REM  start.bat — always-fresh startup for the streaming server stack.
REM  Re-detects the LAN IP and regenerates livekit.yaml/.env on every run,
REM  then brings the Docker stack up. This avoids the stale-IP mismatch bug
REM  that happens when configure.bat is run once and the LAN IP later
REM  changes (DHCP reassignment, reconnect, reboot, etc).
REM ============================================================================
setlocal

call "%~dp0configure.bat" auto
if errorlevel 1 (
  echo.
  echo [ERROR] configure.bat failed — aborting startup.
  exit /b 1
)

echo.
echo Starting Docker stack...
docker compose -f "%~dp0docker-compose.yml" up -d

echo.
echo Container status:
docker compose -f "%~dp0docker-compose.yml" ps

endlocal
