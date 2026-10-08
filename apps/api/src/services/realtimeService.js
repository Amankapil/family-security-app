/**
 * Realtime Event Service
 * Dispatches domain events via Pusher Channels (Vercel serverless compatible)
 * and provides built-in Server-Sent Events (SSE) fallback for local / self-hosted environments.
 */

const Pusher = require('pusher');

let pusherClient = null;

if (
  process.env.PUSHER_APP_ID &&
  process.env.PUSHER_KEY &&
  process.env.PUSHER_SECRET &&
  process.env.PUSHER_CLUSTER
) {
  pusherClient = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true
  });
}

// In-memory SSE subscriber store: familyId -> Set of express res objects
const sseSubscribers = new Map();

/**
 * Register an SSE client for a given family
 */
function addSseClient(familyId, res) {
  const fid = familyId.toString();
  if (!sseSubscribers.has(fid)) {
    sseSubscribers.set(fid, new Set());
  }
  sseSubscribers.get(fid).add(res);

  // Send initial SSE connected ping
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', familyId: fid })}\n\n`);
}

/**
 * Remove an SSE client on disconnect
 */
function removeSseClient(familyId, res) {
  const fid = familyId.toString();
  if (sseSubscribers.has(fid)) {
    const clients = sseSubscribers.get(fid);
    clients.delete(res);
    if (clients.size === 0) {
      sseSubscribers.delete(fid);
    }
  }
}

/**
 * Broadcast an event to all subscribers of a specific family
 */
async function broadcastToFamily(familyId, eventName, data) {
  if (!familyId) return;
  const fid = familyId.toString();
  const channelName = `family-${fid}`;

  // 1. Pusher Channels (if configured)
  if (pusherClient) {
    try {
      await pusherClient.trigger(channelName, eventName, data);
    } catch (err) {
      console.error(`[RealtimeService] Pusher broadcast error on ${channelName}:`, err.message);
    }
  }

  // 2. Server-Sent Events (SSE) local delivery
  if (sseSubscribers.has(fid)) {
    const payload = JSON.stringify(data);
    const message = `event: ${eventName}\ndata: ${payload}\n\n`;
    const clients = sseSubscribers.get(fid);

    for (const client of clients) {
      try {
        client.write(message);
      } catch (err) {
        clients.delete(client);
      }
    }
  }
}

/**
 * Domain-specific broadcast helpers
 */

async function notifyLocationUpdate(familyId, memberId, locationData) {
  return broadcastToFamily(familyId, 'location-updated', {
    memberId: memberId.toString(),
    ...locationData
  });
}

async function notifyStatusChange(familyId, memberId, statusData) {
  return broadcastToFamily(familyId, 'status-changed', {
    memberId: memberId.toString(),
    ...statusData
  });
}

async function notifySosTriggered(familyId, sosAlert) {
  return broadcastToFamily(familyId, 'sos-triggered', {
    alertId: sosAlert._id ? sosAlert._id.toString() : sosAlert.id,
    memberId: sosAlert.membershipId ? sosAlert.membershipId.toString() : null,
    displayName: sosAlert.displayName,
    message: sosAlert.message,
    severity: sosAlert.severity || 'CRITICAL',
    location: sosAlert.location,
    timestamp: sosAlert.createdAt || new Date().toISOString()
  });
}

async function notifySosResolved(familyId, alertId, memberId) {
  return broadcastToFamily(familyId, 'sos-resolved', {
    alertId: alertId ? alertId.toString() : null,
    memberId: memberId ? memberId.toString() : null
  });
}

async function notifyJourneyEvent(familyId, memberId, journeyEvent) {
  return broadcastToFamily(familyId, 'journey-event', {
    memberId: memberId ? memberId.toString() : null,
    ...journeyEvent
  });
}

module.exports = {
  addSseClient,
  removeSseClient,
  broadcastToFamily,
  notifyLocationUpdate,
  notifyStatusChange,
  notifySosTriggered,
  notifySosResolved,
  notifyJourneyEvent
};
