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

// deviceId → last assigned slot identity. Never cleared — persists across reconnects,
// consulted as a preference (not a reservation) so a device gets its old slot back.
const deviceSlots = new Map();

// identity → monotonic generation counter, bumped on every successful /register for
// that identity (independent of the `slots` occupant object, which /register replaces
// wholesale each time). This is what actually discriminates "old session" from "new
// session" — a LiveKit `sid` doesn't exist yet at register time (it's only assigned
// once the client finishes connecting), so a stale webhook for the old session can
// land in the gap between force-reclaim and the new session's connect completing,
// while the occupant object has no sid yet to compare against. Generation exists from
// the moment /register succeeds, so it has no such gap.
const slotGeneration = new Map();

// LiveKit participant sid → the generation that was current when that sid's
// `participant_joined` webhook was processed. Populated on join, consumed on leave.
const sessionGeneration = new Map();

function nextGeneration(identity) {
  const gen = (slotGeneration.get(identity) || 0) + 1;
  slotGeneration.set(identity, gen);
  return gen;
}

function assignSlot(deviceId) {
  if (deviceId) {
    const preferred = deviceSlots.get(deviceId);
    if (preferred) {
      const occupant = slots.get(preferred);
      if (!occupant) {
        // Slot freed normally (webhook already landed) — hand it back.
        return preferred;
      }
      if (occupant.deviceId === deviceId) {
        // Same device re-registering before the disconnect webhook fired for its
        // old session. The new /register call is itself proof the old session is
        // dead, so reclaim immediately instead of waiting on LiveKit's ICE timeout.
        console.log(`[registration] force-reclaiming ${preferred} from stale session (reconnect race)`);
        return preferred;
      }
      // Preferred slot actively held by a different device — fall through.
    }
  }
  // First free slot fallback (also covers unknown/absent deviceId).
  for (const [identity, occupant] of slots) {
    if (!occupant) return identity;
  }
  return null;
}

// `generation` (when passed) is the generation the caller believes this event belongs
// to. When a slot is force-reclaimed, the old session's eventual (stale)
// `participant_left` webhook must not free the new session's slot — only free if the
// event's generation still matches the slot's current occupant. Called without a
// generation from `/unregister` (an explicit, deliberate client action, not a webhook
// race), which always frees unconditionally.
function freeSlotByIdentity(identity, generation) {
  if (!identity || !slots.has(identity)) return false;
  const occupant = slots.get(identity);
  if (!occupant) return false;
  if (generation !== undefined && occupant.generation !== generation) {
    console.log(`[registration] ignoring stale participant_left for ${identity} (generation ${generation} != current ${occupant.generation})`);
    return false;
  }
  slots.set(identity, null);
  console.log(`[registration] freed ${identity}`);
  return true;
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
  const { roomCode, deviceId } = req.body ?? {};
  const room = roomCode?.trim() || ROOM_NAME;

  const identity = assignSlot(deviceId);
  if (!identity) {
    res.status(503).json({ error: 'no slots available' });
    return;
  }

  slots.set(identity, { registeredAt: Date.now(), deviceId, generation: nextGeneration(identity) });
  if (deviceId) deviceSlots.set(deviceId, identity);

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

    if (event.event === 'participant_joined') {
      const identity = event.participant?.identity;
      const sid = event.participant?.sid;
      const occupant = identity && slots.get(identity);
      if (occupant && sid) {
        sessionGeneration.set(sid, occupant.generation);
        console.log(`[registration] participant_joined ${identity} sid=${sid} generation=${occupant.generation}`);
      }
    } else if (event.event === 'participant_left') {
      const sid = event.participant?.sid;
      const generation = sid ? sessionGeneration.get(sid) : undefined;
      sessionGeneration.delete(sid);
      freeSlotByIdentity(event.participant?.identity, generation);
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
