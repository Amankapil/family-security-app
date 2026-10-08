const express = require('express');
const {
  uploadLocations,
  getMemberLatestLocation,
  getMemberLocationHistory
} = require('../controllers/locationController');
const { requireDeviceAuth } = require('../middleware/deviceAuth');
const { requireAuth } = require('../middleware/auth');
const { requireFamily } = require('../middleware/roles');

const router = express.Router();

// Device uploads location fixes (Authenticated via device token headers)
router.post('/locations', requireDeviceAuth, uploadLocations);

// Dashboard queries member location (Authenticated via JWT)
router.get('/members/:id/location', requireAuth, requireFamily, getMemberLatestLocation);
router.get('/members/:id/locations', requireAuth, requireFamily, getMemberLocationHistory);

module.exports = router;
