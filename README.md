# streaming-server — Webcam ingest (LiveKit + Ingress + FFmpeg)

Local dev stack for the **Multi-Camera Live Stream System**. This is the
**webcam version**: instead of 10 IP cameras, a single Windows webcam is
published into LiveKit so the Unity client can be tested end-to-end without
any camera hardware.

> The IP-camera version reuses this **exact** stack. Only the FFmpeg input
> changes (`-f dshow` → `-rtsp_transport tcp -i rtsp://...`). Nothing else moves.

```
[ Webcam ] --dshow--> [ FFmpeg (NVENC H.264) ] --WHIP--> [ LiveKit Ingress ]
                                                                  |
                                                          republish (WebRTC)
                                                                  v
                                                          [ LiveKit Server ] --WebRTC--> [ Unity client ]
```

---

## Prerequisites

| Tool | Check | Notes |
|------|-------|-------|
| Docker Desktop | `docker --version` | ✅ already installed (28.0.4) |
| **FFmpeg ≥ 7.0** | `ffmpeg -muxers \| findstr whip` | ⛔ **not installed** — needs the WHIP muxer (added in 7.0). Get a recent build from gyan.dev or BtbN, add `bin` to PATH. |
| **LiveKit CLI (`lk`)** | `lk --version` | ⛔ **not installed** — `winget install LiveKit.LiveKitCLI` or download from github.com/livekit/livekit-cli/releases |
| NVIDIA GPU | — | `h264_nvenc` (RTX 5070). If absent, swap to `-c:v libx264` in `stream_webcam.bat`. |

> ⚠️ **Dev keys only.** `devkey` / `secretsecretsecretsecretsecret00` are
> hard-coded for local testing. Regenerate before any non-local use.

---

## One-time setup

```bat
configure.bat
```
Detects your LAN IPv4 and writes `.env` + `livekit.yaml` (replacing `__NODE_IP__`).
This IP is the **announced IP** the README's "Docker NAT" constraint refers to —
it must be reachable by both the Unity host and the ingress container, so it has
to be your real LAN IP (e.g. `192.168.1.50`), not `localhost`.

Note the printed `ws://<IP>:7880` — that's your Unity `serverUrl`.

---

## Run it (in order — each step is independently verifiable)

### 1. Start the server stack
```bat
docker compose up -d
docker compose ps          REM all three (redis, livekit, ingress) should be "running"
docker compose logs -f livekit
```

### 2. (Smoke test) Prove the Unity path with NO webcam/ingress
This validates LiveKit + token + Unity subscribe/switch before touching FFmpeg:
```bat
tokens\create_token.bat
lk room join --url ws://<YOUR_IP>:7880 --api-key devkey ^
  --api-secret secretsecretsecretsecretsecret00 ^
  --identity demo-bot --publish-demo --room cam1
```
In Unity (see below) you should see a moving test pattern as **cam1**. If this
works, LiveKit + Unity are good and any later problem is isolated to ingest.

### 3. Find your webcam's device name
```bat
ffmpeg\list_devices.bat
```
Copy the exact name in quotes (e.g. `Integrated Camera`).

### 4. Create the WHIP ingress for cam1
```bat
scripts\create_ingress.bat
```
Note the printed **URL** and **Stream Key**. The push target is `URL/StreamKey`.

### 5. Publish the webcam
```bat
ffmpeg\stream_webcam.bat "http://<YOUR_IP>:8080/w/<STREAM_KEY>" "Integrated Camera"
```
FFmpeg should connect and stay running. Stop with `Q`.

### 6. View in Unity
1. `tokens\create_token.bat` → copy the JWT.
2. In Unity, on `LiveKitManager`: set `serverUrl = ws://<YOUR_IP>:7880`, paste the `token`.
3. Run `Tools > Setup Test Scene` (if not done), press **Play**, click **cam1**.

---

## Stopping / cleanup
```bat
docker compose down            REM stop stack (ingress definitions are in Redis, lost on down -v)
lk ingress list  --url ws://<YOUR_IP>:7880 --api-key devkey --api-secret secretsecretsecretsecretsecret00
lk ingress delete <INGRESS_ID> --url ...   REM remove a stale ingress
```

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `ffmpeg: Unknown output format 'whip'` | FFmpeg < 7.0. Install a current build. |
| WHIP POST returns **404** | `whip_base_url` path in `livekit.template.yaml` (`/w`) doesn't match what your ingress build serves. Try `/` or `/whip`, re-run `configure.bat`, `docker compose up -d`. |
| FFmpeg connects but **no video in Unity** | ICE/NAT: `node_ip` isn't reachable. Confirm `.env` has your LAN IP, that UDP **7882** (livekit) and **7885** (ingress) are published, and your firewall allows them. |
| Unity connects but **no cam1 button** | Token room must be `cam1` and match the ingress `room_name`. The demo bot (step 2) is the fastest way to isolate this. |
| `h264_nvenc` error | No NVIDIA encoder available — switch `stream_webcam.bat` to `-c:v libx264`. |
| Ingress unhealthy in logs | api_key/secret or redis address must match between `livekit.yaml` and `ingress.yaml`. |

### Adding webcam audio (optional)
Replace the input/output flags in `stream_webcam.bat`:
```
-f dshow -i video="Integrated Camera":audio="Microphone (Realtek...)"
-c:a libopus -ar 48000 -ac 2     (remove -an)
```

---

## Files
```
streaming-server/
├── configure.bat              # detect LAN IP -> writes .env + livekit.yaml
├── docker-compose.yml         # redis + livekit + ingress
├── livekit.template.yaml      # template (__NODE_IP__ placeholder)
├── livekit.yaml               # generated (git-ignored)
├── ingress.yaml               # ingress service config
├── .env                       # generated: LIVEKIT_NODE_IP (git-ignored)
├── ffmpeg/
│   ├── list_devices.bat       # find your webcam's DirectShow name
│   └── stream_webcam.bat      # publish webcam -> WHIP
├── ingress/
│   └── whip_cam1.json         # WHIP ingress definition (room cam1)
├── scripts/
│   └── create_ingress.bat     # create the cam1 WHIP ingress
└── tokens/
    └── create_token.bat       # JWT for the Unity client (room cam1)
```
