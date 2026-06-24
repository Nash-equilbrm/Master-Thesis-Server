@echo off
REM ============================================================================
REM  create_ingress.bat — create the cam1 WHIP ingress on the LiveKit server.
REM  Prints an IngressInfo table containing "URL" and "Stream Key".
REM
REM  Combine them as  <URL>/<Stream Key>  and pass that to stream_webcam.bat.
REM  (An ingress persists until deleted; you normally create it once.)
REM ============================================================================
setlocal

set "LIVEKIT_URL=http://localhost:7880"
set "LIVEKIT_API_KEY=devkey"
set "LIVEKIT_API_SECRET=secretsecretsecretsecretsecret00"

lk ingress create ^
  --url %LIVEKIT_URL% ^
  --api-key %LIVEKIT_API_KEY% ^
  --api-secret %LIVEKIT_API_SECRET% ^
  "%~dp0..\ingress\whip_cam1.json"

echo.
echo Copy the WHIP "URL" and "Stream Key" above, then run:
echo   ffmpeg\stream_webcam.bat "URL/StreamKey" "Your Webcam Name"
echo.
endlocal
pause
