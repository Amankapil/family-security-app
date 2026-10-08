const express = require('express');
const {
  getMemberGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence
} = require('../controllers/geofenceController');
const { requireAuth } = require('../middleware/auth');
const { requireFamily, requireRole } = require('../middleware/roles');
const { ROLES } = require('@family-safety/shared-types');

const router = express.Router();

router.use(requireAuth, requireFamily);

// List geofences applicable to member
router.get('/members/:id/geofences', getMemberGeofences);

// Geofence management (Owner or Admin)
router.post('/geofences', requireRole(ROLES.OWNER, ROLES.ADMIN), createGeofence);
router.patch('/geofences/:id', requireRole(ROLES.OWNER, ROLES.ADMIN), updateGeofence);
router.delete('/geofences/:id', requireRole(ROLES.OWNER, ROLES.ADMIN), deleteGeofence);

module.exports = router;
