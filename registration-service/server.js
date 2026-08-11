import express from 'express';
import { randomUUID } from 'crypto';
import { AccessToken, WebhookReceiver } from 'livekit-server-sdk';

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const API_SECRET = process.env.LIVEKIT_API_SECRET || 'secretsecretsecretsecretsecret00';
const NODE_IP = process.env.LIVEKIT_NODE_IP || 'localhost';
const WS_PORT = process.env.LIVEKIT_WS_PORT || '7880';
const ROOM_NAME = process.env.ROOM_NAME || 'studio';
const SLOT_COUNT = Number(process.env.SLOT_COUNT || 10);
const TOKEN_TTL = process.env.TOKEN_TTL || '24h';

// cam1..camN, first-come-first-served. null = free, object = assigned.
const slots = new Map();
for (let i = 1; i <= SLOT_COUNT; i++) slots.set(`cam${i}`, null);

function assignSlot() {
  for (const [identity, occupant] of slots) {
    if (!occupant) return identity;
  }
  return null;
}

function freeSlotByIdentity(identity) {
  if (identity && slots.has(identity) && slots.get(identity)) {
    slots.set(identity, null);
    console.log(`[registration] freed ${identity}`);
    return true;
  }
  return false;
}

async function mintToken(identity, room) {
  const at = new AccessToken(API_KEY, API_SECRET, { identity, ttl: TOKEN_TTL });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: false,
    canPublishData: false,
    canUpdateOwnMetadata: true,
  });
  return at.toJwt();
}

async function mintViewerToken(room, userId) {
  const identity = userId ? `viewer-${userId}` : `viewer-${randomUUID()}`;
  const at = new AccessToken(API_KEY, API_SECRET, { identity, ttl: TOKEN_TTL });
  at.addGrant({
    room,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
    canPublishData: false,
  });
  return at.toJwt();
}

const app = express();
app.use(express.json());

app.post('/register', async (req, res) => {
  const { roomCode } = req.body ?? {};
  const room = roomCode?.trim() || ROOM_NAME;

  const identity = assignSlot();
  if (!identity) {
    res.status(503).json({ error: 'no slots available' });
    return;
  }

  slots.set(identity, { registeredAt: Date.now() });

  try {
    const token = await mintToken(identity, room);
    console.log(`[registration] assigned ${identity} → room "${room}"`);
    res.json({ identity, token, livekit_url: `ws://${NODE_IP}:${WS_PORT}` });
  } catch (err) {
    slots.set(identity, null);
    console.error('[registration] token mint failed', err);
    res.status(500).json({ error: 'failed to mint token' });
  }
});

app.post('/viewer-token', async (req, res) => {
  const { roomCode, userId } = req.body ?? {};
  const room = roomCode?.trim() || ROOM_NAME;

  try {
    const token = await mintViewerToken(room, userId);
    res.json({ token, livekit_url: `ws://${NODE_IP}:${WS_PORT}` });
  } catch (err) {
    console.error('[registration] viewer token mint failed', err);
    res.status(500).json({ error: 'failed to mint token' });
  }
});

app.post('/unregister', (req, res) => {
  const { identity } = req.body ?? {};
  if (!freeSlotByIdentity(identity)) {
    res.status(404).json({ error: 'slot not assigned' });
    return;
  }
  res.status(204).end();
});

// LiveKit calls this on room/participant lifecycle events (configured in livekit.yaml).
// Frees the slot automatically when a camera disconnects, without relying on the
// client to call /unregister.
const webhookReceiver = new WebhookReceiver(API_KEY, API_SECRET);

app.post('/webhook', express.raw({ type: 'application/webhook+json' }), async (req, res) => {
  try {
    const event = await webhookReceiver.receive(req.body.toString(), req.get('Authorization'));

    if (event.event === 'participant_left') {
      freeSlotByIdentity(event.participant?.identity);
    } else if (event.event === 'room_finished') {
      console.log(`[registration] room "${event.room?.name}" finished`);
    }

    res.status(200).end();
  } catch (err) {
    console.error('[registration] webhook validation failed', err);
    res.status(400).end();
  }
});

app.listen(PORT, () => {
  console.log(`[registration] listening on :${PORT}, room "${ROOM_NAME}", ${SLOT_COUNT} slots`);
});
