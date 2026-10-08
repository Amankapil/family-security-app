const { ALERT_LEVELS, ALERT_CATEGORIES, SAFETY_CONFIG } = require('@family-safety/shared-types');
const { Device, FamilyMembership, Alert } = require('../models');
const { sendLowBatteryAlert } = require('./notificationService');
const { broadcastToFamily } = require('./realtimeService');

/**
 * Evaluates comprehensive health metrics for a device
 * @param {Object} device Mongoose Device document or plain object
 * @returns {Object} Diagnostic report with health score, status, issues, and actionable recommendations
 */
function evaluateDeviceHealth(device) {
  if (!device) {
    return {
      status: 'UNKNOWN',
      healthScore: 0,
      isHealthy: false,
      issues: ['DEVICE_NOT_FOUND'],
      recommendations: ['Register or pair the device.']
    };
  }

  const now = Date.now();
  const lastSeenMs = device.lastSeenAt ? new Date(device.lastSeenAt).getTime() : 0;
  const minutesSinceSeen = Math.max(0, Math.floor((now - lastSeenMs) / 60000));

  // 1. Connection / Liveness Status
  let status = 'ONLINE';
  if (!device.isActive) {
    status = 'REVOKED';
  } else if (minutesSinceSeen > 120) {
    status = 'OFFLINE';
  } else if (minutesSinceSeen > 15) {
    status = 'STANDBY';
  }

  // 2. Battery Telemetry
  const batteryLevel = typeof device.batteryLevel === 'number' ? device.batteryLevel : 100;
  const isCharging = Boolean(device.isCharging);
  let batteryStatus = 'NORMAL';
  if (batteryLevel < (SAFETY_CONFIG.CRITICAL_BATTERY_PERCENT || 15)) {
    batteryStatus = 'CRITICAL';
  } else if (batteryLevel < 30) {
    batteryStatus = 'LOW';
  }

  // 3. Android Permissions & Battery Whitelist State
  const permissions = {
    fineLocation: Boolean(device.permissions?.fineLocation),
    backgroundLocation: Boolean(device.permissions?.backgroundLocation),
    notifications: Boolean(device.permissions?.notifications),
    batteryOptimizationDisabled: Boolean(device.permissions?.batteryOptimizationDisabled)
  };

  let permissionStatus = 'OPTIMAL';
  if (!permissions.fineLocation) {
    permissionStatus = 'CRITICAL';
  } else if (!permissions.backgroundLocation || !permissions.batteryOptimizationDisabled) {
    permissionStatus = 'DEGRADED';
  }

  // 4. Identify Specific Issues
  const issues = [];
  const recommendations = [];

  if (batteryStatus === 'CRITICAL' && !isCharging) {
    issues.push('BATTERY_CRITICAL');
    recommendations.push('Connect phone to charger immediately (< 15% remaining).');
  }

  if (!permissions.batteryOptimizationDisabled) {
    issues.push('BATTERY_OPTIMIZATION_ACTIVE');
    recommendations.push(
      'Whitelist app in Android Battery Optimization settings to prevent background kills.'
    );
  }

  if (!permissions.backgroundLocation) {
    issues.push('BACKGROUND_LOCATION_MISSING');
    recommendations.push(
      'Grant "Allow all the time" location access in Android Settings for non-stop protection.'
    );
  }

  if (!permissions.fineLocation) {
    issues.push('FINE_LOCATION_MISSING');
    recommendations.push('Enable Precise / Fine GPS location permission.');
  }

  if (!permissions.notifications) {
    issues.push('NOTIFICATIONS_DISABLED');
    recommendations.push('Enable push notifications to receive emergency family alerts.');
  }

  if (status === 'OFFLINE') {
    issues.push('DEVICE_OFFLINE');
    recommendations.push(
      `Phone has been inactive for ${minutesSinceSeen} minutes. Verify device is powered on.`
    );
  }

  // 5. Health Score Calculation (0 - 100)
  let healthScore = 100;
  if (!permissions.batteryOptimizationDisabled) healthScore -= 30;
  if (!permissions.backgroundLocation) healthScore -= 30;
  if (!permissions.fineLocation) healthScore -= 40;
  if (batteryStatus === 'CRITICAL') healthScore -= 20;
  if (status === 'STANDBY') healthScore -= 10;
  if (status === 'OFFLINE') healthScore -= 30;
  if (status === 'REVOKED') healthScore = 0;
  healthScore = Math.max(0, Math.min(100, healthScore));

  const isHealthy = issues.length === 0 && status === 'ONLINE';

  return {
    deviceId: device._id,
    deviceName: device.deviceName,
    manufacturer: device.manufacturer,
    model: device.model,
    androidVersion: device.androidVersion,
    appVersion: device.appVersion,
    status,
    healthScore,
    isHealthy,
    battery: {
      level: batteryLevel,
      isCharging,
      status: batteryStatus
    },
    network: {
      type: device.networkType || 'UNKNOWN'
    },
    permissions,
    permissionStatus,
    telemetry: {
      lastSeenAt: device.lastSeenAt,
      minutesSinceSeen
    },
    issues,
    recommendations
  };
}

/**
 * Checks telemetry indicators and dispatches health alerts when degraded (with anti-spam throttling)
 */
async function checkAndTriggerHealthAlerts(device, member) {
  if (!device || !member) return null;

  const results = {
    lowBatteryAlertCreated: false,
    permissionAlertCreated: false
  };

  const familyId = device.familyId;
  const membershipId = member._id;

  // 1. Critical Low Battery Check (< 15% and not charging)
  const criticalThreshold = SAFETY_CONFIG.CRITICAL_BATTERY_PERCENT || 15;
  if (device.batteryLevel < criticalThreshold && !device.isCharging) {
    // Throttle: Max 1 alert per 3 hours
    const recentBatteryAlert = await Alert.findOne({
      familyId,
      membershipId,
      category: ALERT_CATEGORIES.LOW_BATTERY,
      createdAt: { $gte: new Date(Date.now() - 3 * 60 * 60 * 1000) }
    });

    if (!recentBatteryAlert) {
      const alert = await Alert.create({
        familyId,
        membershipId,
        type: ALERT_LEVELS.WARNING,
        category: ALERT_CATEGORIES.LOW_BATTERY,
        title: `Low Battery: ${member.displayName}`,
        message: `${member.displayName}'s device battery is critically low (${device.batteryLevel}%).`,
        metadata: {
          batteryLevel: device.batteryLevel,
          deviceId: device._id,
          deviceName: device.deviceName
        }
      });

      // Dispatch FCM Push Notification to other family members
      await sendLowBatteryAlert(familyId, member, device.batteryLevel);

      // Broadcast Realtime SSE event
      await broadcastToFamily(familyId, 'device-health-alert', {
        alertId: alert._id,
        category: ALERT_CATEGORIES.LOW_BATTERY,
        memberId: membershipId.toString(),
        displayName: member.displayName,
        batteryLevel: device.batteryLevel,
        message: alert.message
      });

      results.lowBatteryAlertCreated = true;
    }
  }

  // 2. Battery Optimization / Background Location Revocation Check
  const hasOptimizationActive = !device.permissions?.batteryOptimizationDisabled;
  const hasNoBgLocation = !device.permissions?.backgroundLocation;

  if (hasOptimizationActive || hasNoBgLocation) {
    // Throttle: Max 1 alert per 24 hours
    const recentPermAlert = await Alert.findOne({
      familyId,
      membershipId,
      category: ALERT_CATEGORIES.PERMISSION_REVOKED,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    });

    if (!recentPermAlert) {
      const issueDetails = [];
      if (hasOptimizationActive) issueDetails.push('Battery Optimization is restricting background sync');
      if (hasNoBgLocation) issueDetails.push('Background location permission is not granted');

      await Alert.create({
        familyId,
        membershipId,
        type: ALERT_LEVELS.WARNING,
        category: ALERT_CATEGORIES.PERMISSION_REVOKED,
        title: `Safety Degraded: ${member.displayName}`,
        message: `${member.displayName}'s device protection is degraded: ${issueDetails.join(', ')}.`,
        metadata: {
          deviceId: device._id,
          permissions: device.permissions
        }
      });

      results.permissionAlertCreated = true;
    }
  }

  return results;
}

/**
 * Retrieves full diagnostic report for a device
 */
async function getDiagnosticsForDevice(deviceId, familyId) {
  const device = await Device.findOne({ _id: deviceId, familyId });
  if (!device) return null;

  const member = await FamilyMembership.findById(device.membershipId);
  const diagnostics = evaluateDeviceHealth(device);

  return {
    ...diagnostics,
    member: member
      ? {
          id: member._id,
          displayName: member.displayName,
          role: member.role,
          locationSharingEnabled: member.locationSharingEnabled
        }
      : null
  };
}

/**
 * Retrieves full diagnostic report for a member's active device
 */
async function getDiagnosticsForMember(membershipId, familyId) {
  const member = await FamilyMembership.findOne({ _id: membershipId, familyId });
  if (!member) return null;

  const device = await Device.findOne({
    membershipId,
    familyId,
    isActive: true
  }).sort({ lastSeenAt: -1 });

  if (!device) {
    return {
      hasDevice: false,
      member: {
        id: member._id,
        displayName: member.displayName,
        role: member.role
      },
      diagnostics: null
    };
  }

  const diagnostics = evaluateDeviceHealth(device);

  return {
    hasDevice: true,
    member: {
      id: member._id,
      displayName: member.displayName,
      role: member.role,
      locationSharingEnabled: member.locationSharingEnabled
    },
    diagnostics
  };
}

module.exports = {
  evaluateDeviceHealth,
  checkAndTriggerHealthAlerts,
  getDiagnosticsForDevice,
  getDiagnosticsForMember
};
