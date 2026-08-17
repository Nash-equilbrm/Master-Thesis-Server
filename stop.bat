@echo off
REM ============================================================================
REM  stop.bat — stop the streaming server stack (companion to start.bat).
REM  Containers are stopped and removed; .env/livekit.yaml are left in
REM  place, so the next start.bat run just regenerates them fresh.
REM ============================================================================
docker compose -f "%~dp0docker-compose.yml" down
