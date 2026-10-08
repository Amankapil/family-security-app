const express = require('express');
const { triggerSos, sendImOk, resolveSos } = require('../controllers/safetyController');
const { requireDeviceAuth } = require('../middleware/deviceAuth');
const { requireAuth } = require('../middleware/auth');
const { requireFamily } = require('../middleware/roles');

const router = express.Router();

// Device triggers SOS
router.post('/sos', requireDeviceAuth, triggerSos);

// Device sends "I'm OK" safe confirmation
router.post('/status/im-ok', requireDeviceAuth, sendImOk);

// Web Dashboard / Admin resolves SOS
router.post('/sos/:id/resolve', requireAuth, requireFamily, resolveSos);

module.exports = router;
