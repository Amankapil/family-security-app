const express = require('express');
const {
  deviceHeartbeat,
  getDevice,
  revokeDevice,
  getMemberDeviceDiagnostics
} = require('../controllers/pairingController');
const { requireDeviceAuth } = require('../middleware/deviceAuth');
const { requireAuth } = require('../middleware/auth');
const { requireRole, requireFamily } = require('../middleware/roles');
const { ROLES } = require('@family-safety/shared-types');

const router = express.Router();

// Device telemetry heartbeat (Authenticated via device token headers)
router.post('/heartbeat', requireDeviceAuth, deviceHeartbeat);

// Explicit FCM token sync from Android
router.post('/fcm-token', requireDeviceAuth, async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) {
      return res.status(400).json({ success: false, error: 'fcmToken is required.' });
    }
    const { Device } = require('../models');
    await Device.findByIdAndUpdate(req.device.id, { fcmToken });
    return res.status(200).json({ success: true, message: 'FCM token updated successfully.' });
  } catch (err) {
    next(err);
  }
});

// Get device diagnostics by Member ID (Authenticated via dashboard JWT)
router.get('/member/:memberId/diagnostics', requireAuth, requireFamily, getMemberDeviceDiagnostics);

// Get device diagnostics (Authenticated via dashboard JWT)
router.get('/:id', requireAuth, requireFamily, getDevice);
router.get('/:id/diagnostics', requireAuth, requireFamily, getDevice);

// Revoke device by ID (Authenticated via dashboard JWT with OWNER/ADMIN role)
router.post('/:id/revoke', requireAuth, requireFamily, requireRole(ROLES.OWNER, ROLES.ADMIN), revokeDevice);

module.exports = router;
