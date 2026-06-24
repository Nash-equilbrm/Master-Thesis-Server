@echo off
REM ============================================================================
REM  create_token.bat — generate a JWT for the Unity client to join room "studio".
REM  All cameras publish into this ONE shared room as participants cam1..cam10;
REM  the Unity client subscribes to one participant's track at a time.
REM  Paste the printed token into LiveKitManager.token in the Unity Inspector.
REM  Valid for 24h; re-run when it expires.
REM ============================================================================
setlocal

set "LIVEKIT_API_KEY=devkey"
set "LIVEKIT_API_SECRET=secretsecretsecretsecretsecret00"

lk token create ^
  --api-key %LIVEKIT_API_KEY% ^
  --api-secret %LIVEKIT_API_SECRET% ^
  --join --room studio ^
  --identity unity-viewer --name "Unity Viewer" ^
  --valid-for 24h

echo.
endlocal
pause
