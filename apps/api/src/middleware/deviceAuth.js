const crypto = require('crypto');
const { Device, FamilyMembership } = require('../models');

/**
 * Device Authentication Middleware
 * Authenticates requests coming directly from paired Android phones.
 * Expects headers:
 * - X-Device-Id
 * - X-Device-Token
 */
async function requireDeviceAuth(req, res, next) {
  try {
    const deviceId = req.headers['x-device-id'];
    const deviceToken = req.headers['x-device-token'];

    if (!deviceId || !deviceToken) {
      return res.status(401).json({
        success: false,
        error: 'Device authentication required. Missing device headers.'
      });
    }

    const device = await Device.findById(deviceId);
    if (!device) {
      return res.status(401).json({
        success: false,
        error: 'Unrecognized device. Please re-pair your device.'
      });
    }

    if (!device.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Device authorization has been revoked by family administrator.'
      });
    }

    // Verify constant-time SHA-256 hash of deviceToken
    const computedHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
    if (computedHash !== device.deviceTokenHash) {
      return res.status(401).json({
        success: false,
        error: 'Invalid device credentials.'
      });
    }

    // Verify membership is active
    const membership = await FamilyMembership.findById(device.membershipId);
    if (!membership) {
      return res.status(401).json({
        success: false,
        error: 'Associated family member profile no longer exists.'
      });
    }

    // Attach device context to request
    req.device = {
      id: device._id.toString(),
      familyId: device.familyId.toString(),
      membershipId: device.membershipId.toString(),
      deviceName: device.deviceName
    };
    req.member = membership;

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  requireDeviceAuth
};
