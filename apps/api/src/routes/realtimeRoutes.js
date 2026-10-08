const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { addSseClient, removeSseClient } = require('../services/realtimeService');

/**
 * GET /api/v1/realtime/stream
 * Server-Sent Events stream for real-time family updates
 */
router.get('/stream', requireAuth, (req, res) => {
  const familyId = req.user.familyId;
  if (!familyId) {
    return res.status(400).json({
      success: false,
      error: 'User has no active family network.'
    });
  }

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  if (res.flushHeaders) {
    res.flushHeaders();
  }

  // Register client
  addSseClient(familyId, res);

  // Keep-alive heartbeat every 20 seconds
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000);
  heartbeat.unref();

  // Clean up when client disconnects
  req.on('close', () => {
    clearInterval(heartbeat);
    removeSseClient(familyId, res);
  });
});

module.exports = router;
