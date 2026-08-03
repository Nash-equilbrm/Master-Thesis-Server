@echo off
REM ============================================================================
REM  logs.bat — tail registration + livekit logs to watch a camera connect.
REM  Run this in a second terminal after start.bat, then press Play in the
REM  Camera Instance Unity project.
REM ============================================================================
docker compose -f "%~dp0docker-compose.yml" logs -f registration livekit
