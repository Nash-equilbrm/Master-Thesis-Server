@echo off
REM ============================================================================
REM  Lists DirectShow capture devices (cameras + microphones).
REM  Copy your camera's EXACT name from between the quotes, e.g.:
REM      "Integrated Camera"   or   "HD Webcam C270"
REM  Use it as the 2nd argument to stream_webcam.bat.
REM ============================================================================
ffmpeg -hide_banner -list_devices true -f dshow -i dummy
echo.
pause
