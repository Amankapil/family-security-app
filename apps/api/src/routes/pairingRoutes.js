const express = require('express');
const { createPairingToken, completePairing, revokeDevice } = require('../controllers/pairingController');
const { requireAuth } = require('../middleware/auth');
const { requireRole, requireFamily } = require('../middleware/roles');
const { ROLES } = require('@family-safety/shared-types');

const router = express.Router();

// Generate pairing QR token (Admin/Owner authenticated)
router.post('/create', requireAuth, requireFamily, requireRole(ROLES.OWNER, ROLES.ADMIN), createPairingToken);

// Android phone completes pairing (Called by phone after QR scan)
router.post('/complete', completePairing);

// Revoke device pairing (Admin/Owner authenticated)
router.post('/revoke', requireAuth, requireFamily, requireRole(ROLES.OWNER, ROLES.ADMIN), revokeDevice);

module.exports = router;
