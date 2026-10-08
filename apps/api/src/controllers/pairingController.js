const crypto = require('crypto');
const { PairingToken, Device, FamilyMembership, Family, AuditLog } = require('../models');
const { SAFETY_CONFIG, NETWORK_TYPES } = require('@family-safety/shared-types');

/**
 * Generate ephemeral pairing code and QR payload for a family member
 */
async function createPairingToken(req, res, next) {
  try {
    const { membershipId } = req.body;

    if (!membershipId) {
      return res.status(400).json({
        success: false,
        error: 'membershipId is required to generate a pairing token.'
      });
    }

    const member = await FamilyMembership.findOne({
      _id: membershipId,
      familyId: req.user.familyId
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Family member not found in this family.'
      });
    }

    // Invalidate any existing unused pairing tokens for this member
    await PairingToken.deleteMany({
      familyId: req.user.familyId,
      membershipId: member._id
    });

    // Generate high-entropy 24-char token
    const rawToken = 'PAIR-' + crypto.randomBytes(9).toString('base64url').toUpperCase();
    const expiryMinutes = SAFETY_CONFIG.PAIRING_TOKEN_EXPIRY_MINUTES || 15;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const pairingRecord = await PairingToken.create({
      familyId: req.user.familyId,
      membershipId: member._id,
      token: rawToken,
      expiresAt,
      used: false
    });

    const apiUrl = process.env.API_URL || 'http://localhost:5000';

    // QR Payload contains only the minimum required info, no credentials
    const qrPayload = JSON.stringify({
      v: 1,
      type: 'FAMILY_PAIRING',
      token: rawToken,
      apiUrl
    });

    await AuditLog.create({
      familyId: req.user.familyId,
      actorUserId: req.user.id,
      actorMembershipId: req.user.membershipId,
      action: 'PAIRING_TOKEN_GENERATED',
      details: { memberName: member.displayName, membershipId: member._id }
    });

    return res.status(201).json({
      success: true,
      data: {
        token: rawToken,
        expiresAt,
        expiresInMinutes: expiryMinutes,
        memberName: member.displayName,
        qrPayload
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Complete Pairing: Android phone exchanges pairing token for long-lived Device API credentials
 */
async function completePairing(req, res, next) {
  try {
    const {
      pairingToken,
      deviceName,
      manufacturer,
      model,
      androidVersion,
      appVersion,
      fcmToken,
      permissions
    } = req.body;

    if (!pairingToken || !deviceName) {
      return res.status(400).json({
        success: false,
        error: 'pairingToken and deviceName are required.'
      });
    }

    // Look up pairing token
    const tokenRecord = await PairingToken.findOne({ token: pairingToken.trim() });
    if (!tokenRecord) {
      return res.status(404).json({
        success: false,
        error: 'Invalid pairing token. Please scan a fresh QR code.'
      });
    }

    if (tokenRecord.used) {
      return res.status(400).json({
        success: false,
        error: 'This pairing token has already been used. Tokens are single-use.'
      });
    }

    if (new Date() > new Date(tokenRecord.expiresAt)) {
      return res.status(400).json({
        success: false,
        error: 'Pairing token has expired. Please generate a new QR code from the dashboard.'
      });
    }

    const member = await FamilyMembership.findById(tokenRecord.membershipId);
    const family = await Family.findById(tokenRecord.familyId);

    if (!member || !family) {
      return res.status(404).json({
        success: false,
        error: 'Target family member or family no longer exists.'
      });
    }

    // Mark pairing token as used
    tokenRecord.used = true;
    await tokenRecord.save();

    // Generate high-entropy 256-bit device token
    const rawDeviceToken = crypto.randomBytes(32).toString('hex');
    const deviceTokenHash = crypto.createHash('sha256').update(rawDeviceToken).digest('hex');

    // Create device entry
    const device = await Device.create({
      familyId: family._id,
      membershipId: member._id,
      deviceName: deviceName.trim(),
      manufacturer: manufacturer || 'Android Device',
      model: model || 'Generic Model',
      androidVersion: androidVersion || '14',
      appVersion: appVersion || '1.0.0',
      deviceTokenHash,
      fcmToken: fcmToken || null,
      permissions: permissions || {
        fineLocation: true,
        backgroundLocation: true,
        notifications: true,
        batteryOptimizationDisabled: true
      },
      isActive: true,
      lastSeenAt: new Date()
    });

    await AuditLog.create({
      familyId: family._id,
      actorMembershipId: member._id,
      action: 'DEVICE_PAIRED',
      details: {
        deviceId: device._id,
        deviceName: device.deviceName,
        memberName: member.displayName
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        deviceId: device._id.toString(),
        deviceToken: rawDeviceToken,
        member: {
          id: member._id.toString(),
          displayName: member.displayName,
          role: member.role
        },
        family: {
          id: family._id.toString(),
          name: family.name
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Revoke device authorization (Admin or Owner)
 */
async function revokeDevice(req, res, next) {
  try {
    const { deviceId } = req.body;
    const targetDeviceId = deviceId || req.params.id;

    if (!targetDeviceId) {
      return res.status(400).json({
        success: false,
        error: 'deviceId is required to revoke device.'
      });
    }

    const device = await Device.findOne({
      _id: targetDeviceId,
      familyId: req.user.familyId
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        error: 'Device not found in this family.'
      });
    }

    device.isActive = false;
    device.deviceTokenHash = 'REVOKED_' + crypto.randomUUID();
    await device.save();

    await AuditLog.create({
      familyId: req.user.familyId,
      actorUserId: req.user.id,
      actorMembershipId: req.user.membershipId,
      action: 'DEVICE_REVOKED',
      details: { deviceId: device._id, deviceName: device.deviceName }
    });

    return res.status(200).json({
      success: true,
      message: `Device "${device.deviceName}" has been revoked successfully.`
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Heartbeat: Device reports hardware state, battery level, network type, and permissions
 */
async function deviceHeartbeat(req, res, next) {
  try {
    const { batteryLevel, isCharging, networkType, permissions, fcmToken } = req.body;

    const device = await Device.findById(req.device.id);
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    if (batteryLevel !== undefined) device.batteryLevel = Math.max(0, Math.min(100, Number(batteryLevel)));
    if (isCharging !== undefined) device.isCharging = Boolean(isCharging);
    if (networkType && Object.values(NETWORK_TYPES).includes(networkType)) device.networkType = networkType;
    if (permissions) device.permissions = { ...device.permissions, ...permissions };
    if (fcmToken) device.fcmToken = fcmToken;
    device.lastSeenAt = new Date();

    await device.save();

    // Sync member telemetry summary
    const member = req.member;
    if (member) {
      member.currentStatus.batteryLevel = device.batteryLevel;
      member.currentStatus.isCharging = device.isCharging;
      member.currentStatus.lastSeenAt = device.lastSeenAt;
      await member.save();
    }

    // Check for low battery and degraded permission health alerts
    const { checkAndTriggerHealthAlerts } = require('../services/diagnosticService');
    await checkAndTriggerHealthAlerts(device, member);

    // Broadcast Realtime Heartbeat Telemetry to Family Dashboard
    const { broadcastToFamily } = require('../services/realtimeService');
    await broadcastToFamily(device.familyId, 'device-heartbeat', {
      deviceId: device._id.toString(),
      memberId: member ? member._id.toString() : null,
      batteryLevel: device.batteryLevel,
      isCharging: device.isCharging,
      networkType: device.networkType,
      permissions: device.permissions,
      lastSeenAt: device.lastSeenAt
    });

    return res.status(200).json({
      success: true,
      data: {
        deviceId: device._id,
        lastSeenAt: device.lastSeenAt,
        batteryLevel: device.batteryLevel,
        isCharging: device.isCharging
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get device diagnostics details
 */
async function getDevice(req, res, next) {
  try {
    const { getDiagnosticsForDevice } = require('../services/diagnosticService');
    const diagnostics = await getDiagnosticsForDevice(req.params.id, req.user.familyId);

    if (!diagnostics) {
      return res.status(404).json({ success: false, error: 'Device not found.' });
    }

    return res.status(200).json({
      success: true,
      data: diagnostics
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get device diagnostics by family member ID
 */
async function getMemberDeviceDiagnostics(req, res, next) {
  try {
    const { getDiagnosticsForMember } = require('../services/diagnosticService');
    const result = await getDiagnosticsForMember(req.params.memberId, req.user.familyId);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Family member not found.' });
    }

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createPairingToken,
  completePairing,
  revokeDevice,
  deviceHeartbeat,
  getDevice,
  getMemberDeviceDiagnostics
};
