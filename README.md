# streaming-server — LiveKit + registration service

Local dev stack for the **Multi-Camera Live Stream System**. Camera machines
(Unity, Android/Windows) publish directly into LiveKit via the LiveKit Unity
SDK — no FFmpeg, no WHIP ingest. The Unity viewer client subscribes to one
camera track at a time and switches on demand.

```
[ Camera machine — Unity ] --LiveKit Unity SDK (WebRTC)--> [ LiveKit Server ] --WebRTC--> [ Unity viewer ]
                 ^                                                  ^
                 |                                                  |
                 +---------------- POST /register --------- registration service
```

> The old FFmpeg → WHIP → LiveKit Ingress path (for IP cameras without a
> Unity client) has been retired from this stack for now. See
> `../CLAUDE.md` under "Known Constraints" for the future IP-camera plan —
> re-adding Ingress + Redis to `docker-compose.yml` is the way back in if
> that work resumes.

---

## Prerequisites

| Tool | Check | Notes |
|------|-------|-------|
| Docker Desktop | `docker --version` | required to run the stack |
| **LiveKit CLI (`lk`)** | `lk --version` | optional — only needed for manual token/debug commands (`tokens/create_token.bat`, `lk room join`) |

> ⚠️ **Dev keys only.** `devkey` / `secretsecretsecretsecretsecret00` are
> hard-coded for local testing. Regenerate before any non-local use.

---

## Running the stack

```bat
start.bat
```
Re-detects your LAN IPv4, regenerates `.env` + `livekit.yaml` fresh, then
`docker compose up -d`. Run this every session — the LAN IP can change
between reboots/reconnects, and a stale IP breaks WebRTC (ICE) even though
plain HTTP calls to the registration service still succeed.

Note the printed `ws://<IP>:7880` — that's the Unity client's `serverUrl`.

```bat
logs.bat
```
Tails `registration` + `livekit` logs in a second terminal — run alongside
`start.bat` to watch a camera register/connect/publish in real time.

```bat
stop.bat
```
`docker compose down`. Safe anytime — no persistent volumes, nothing is
lost between stop/start cycles.

`configure.bat` (called automatically by `start.bat`) regenerates `.env` +
`livekit.yaml` without starting the stack — useful if you just want fresh
config.

---

## Smoke-testing without the Unity client

Prove LiveKit + token flow works before touching Unity:
```bat
tokens\create_token.bat
lk room join --url ws://<YOUR_IP>:7880 --api-key devkey ^
  --api-secret secretsecretsecretsecretsecret00 ^
  --identity demo-bot --publish-demo --room studio
```
In Unity you should see a moving test pattern as a participant. If this
works, LiveKit + Unity are good and any later problem is isolated to the
Camera/Viewer app itself.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Unity WebRTC connect fails, but HTTP calls to registration succeed | `node_ip` in `livekit.yaml` is stale — re-run `start.bat` to refresh it. |
| Unity connects but no camera shows up | Confirm the camera machine's `/register` call succeeded (check `logs.bat`) and it's publishing into the expected room. |
| Camera slot doesn't free after a disconnect | Webhook delivery lag — LiveKit's disconnect-timeout is ~15-20s before `participant_left` fires. See `../CLAUDE.md` "Known issue" notes. |

---

## Files
```
streaming-server/
├── start.bat                  # detect LAN IP, regenerate config, docker compose up -d
├── stop.bat                   # docker compose down
├── logs.bat                   # tail registration + livekit logs
├── configure.bat              # detect LAN IP -> writes .env + livekit.yaml (called by start.bat)
├── docker-compose.yml         # livekit + registration
├── livekit.template.yaml      # template (__NODE_IP__ placeholder)
├── livekit.yaml               # generated (git-ignored)
├── .env                       # generated: LIVEKIT_NODE_IP (git-ignored)
├── tokens/
│   └── create_token.bat       # manual JWT for the Unity client (room "studio")
└── registration-service/      # Node.js: POST /register, /viewer-token, dynamic cam1-10 slot assignment
    ├── server.js
    ├── package.json
    └── Dockerfile
```

---

## Registration service

Assigns each camera machine a free slot (`cam1`-`cam10`) and mints its LiveKit
JWT. Runs as its own container (`registration`), started with the rest of the
stack via `start.bat`.

- `POST /register` `{ roomCode, userId, username }` → `{ identity, token, livekit_url }` (first-come-first-served; `roomCode` becomes the LiveKit room name, falling back to the `ROOM_NAME` env var if absent)
- `POST /viewer-token` `{ roomCode, userId, username }` → `{ token, livekit_url }` (subscriber-only)
- `POST /unregister` `{ identity }` → frees a slot manually
- LiveKit is configured (`webhook:` in `livekit.yaml`) to POST to `/webhook` on
  participant disconnect, so a slot is also freed automatically if the camera
  machine drops without calling `/unregister`.
- State is in-memory only — restarting the container resets all slots to free.

```bat
curl -X POST http://<YOUR_IP>:3000/register -H "Content-Type: application/json" -d "{}"
```
