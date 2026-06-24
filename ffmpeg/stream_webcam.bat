@echo off
REM ============================================================================
REM  stream_webcam.bat — publish a Windows webcam to LiveKit via WHIP.
REM
REM  Usage:
REM    stream_webcam.bat "<WHIP_URL>" ["<Webcam device name>"]
REM
REM    <WHIP_URL>  = the "URL" + "/" + "Stream Key" from create_ingress.bat,
REM                  e.g. "http://192.168.1.50:8080/w/wsk_xxxxxxxxxxxx"
REM    device      = exact DirectShow name (list_devices.bat). Default below.
REM
REM  Encoding is WebRTC-compliant: H.264 baseline, NO B-frames (-bf 0), NVENC.
REM  Video-only (-an); see README to add a microphone (Opus).
REM  Do NOT add -re : that is for files, it desyncs live capture.
REM ============================================================================
setlocal

if "%~1"=="" (
  echo [ERROR] WHIP URL required.
  echo Usage: stream_webcam.bat "http://192.168.1.50:8080/w/STREAMKEY" ["Integrated Camera"]
  exit /b 1
)

set "WHIP_URL=%~1"
set "DEVICE=%~2"
if "%DEVICE%"=="" set "DEVICE=Integrated Camera"

echo Publishing webcam "%DEVICE%" to:
echo   %WHIP_URL%
echo Press Q (or Ctrl+C) in this window to stop.
echo.

ffmpeg -hide_banner ^
  -f dshow -rtbufsize 256M -i video="%DEVICE%" ^
  -c:v h264_nvenc -profile:v baseline -preset p4 -tune ll ^
  -bf 0 -g 60 -b:v 4M -maxrate 4M -bufsize 8M -pix_fmt yuv420p ^
  -an ^
  -f whip "%WHIP_URL%"

endlocal
