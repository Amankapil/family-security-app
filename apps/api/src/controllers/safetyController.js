const { Alert, FamilyMembership, Location, AuditLog } = require('../models');
const { ALERT_LEVELS, ALERT_CATEGORIES, MEMBER_STATUS } = require('@family-safety/shared-types');

/**
 * Trigger Emergency SOS from Android device
 */
async function triggerSos(req, res, next) {
  try {
    const { latitude, longitude, accuracy, batteryLevel, triggerType } = req.body;
    const { id: deviceId, familyId, membershipId } = req.device;
    const member = req.member;

    // Create high-priority SOS alert
    const alert = await Alert.create({
      familyId,
      membershipId,
      type: ALERT_LEVELS.SOS,
      category: ALERT_CATEGORIES.SOS,
      title: `🚨 EMERGENCY: ${member.displayName} requested assistance!`,
      message: `${member.displayName} activated SOS on their phone. Immediate attention required.`,
      metadata: {
        deviceId,
        latitude,
        longitude,
        accuracy,
        batteryLevel,
        triggerType: triggerType || 'MANUAL_SOS',
        timestamp: new Date()
      }
    });

    // Update member live state
    member.currentStatus.state = MEMBER_STATUS.SOS;
    member.currentStatus.statusMessage = '🚨 EMERGENCY SOS ACTIVE';
    if (batteryLevel !== undefined) member.currentStatus.batteryLevel = batteryLevel;
    if (latitude && longitude) {
      member.currentStatus.lastLocation = {
        latitude,
        longitude,
        accuracy: accuracy || 10,
        updatedAt: new Date()
      };
    }
    member.currentStatus.lastSeenAt = new Date();
    await member.save();

    // Record in Audit Log
    await AuditLog.create({
      familyId,
      actorMembershipId: member._id,
      action: 'SOS_TRIGGERED',
      details: { memberName: member.displayName, alertId: alert._id }
    });

    // Broadcast Realtime SOS to all Family Dashboards
    const { notifySosTriggered, notifyStatusChange } = require('../services/realtimeService');
    await notifySosTriggered(familyId, {
      _id: alert._id,
      membershipId: member._id,
      displayName: member.displayName,
      message: alert.message,
      severity: 'CRITICAL',
      location: { latitude, longitude }
    });
    await notifyStatusChange(familyId, member._id, {
      state: MEMBER_STATUS.SOS,
      statusMessage: member.currentStatus.statusMessage
    });

    // Send High-Priority FCM Push Notification to all Family Phones
    const { sendSosAlert } = require('../services/notificationService');
    await sendSosAlert(familyId, member, { latitude, longitude }, alert._id);

    return res.status(200).json({
      success: true,
      data: {
        alertId: alert._id,
        status: 'SOS_BROADCASTED',
        member: member.displayName
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * "I'M OK" Safe Confirmation
 */
async function sendImOk(req, res, next) {
  try {
    const { latitude, longitude, note } = req.body;
    const { familyId, membershipId } = req.device;
    const member = req.member;

    // If member was in SOS or Warning, return to Normal
    member.currentStatus.state = MEMBER_STATUS.NORMAL;
    member.currentStatus.statusMessage = '🟢 Confirmed OK';
    member.currentStatus.lastSeenAt = new Date();
    if (latitude && longitude) {
      member.currentStatus.lastLocation = {
        latitude,
        longitude,
        accuracy: 10,
        updatedAt: new Date()
      };
    }
    await member.save();

    // Automatically resolve pending non-critical warnings
    await Alert.updateMany(
      {
        familyId,
        membershipId,
        resolvedAt: null,
        type: { $in: [ALERT_LEVELS.WARNING, ALERT_LEVELS.HIGH] }
      },
      {
        resolvedAt: new Date()
      }
    );

    // Record an INFO confirmation alert
    const alert = await Alert.create({
      familyId,
      membershipId,
      type: ALERT_LEVELS.INFO,
      category: ALERT_CATEGORIES.GEOFENCE_EVENT,
      title: `👍 ${member.displayName} checked in safe`,
      message: note || `${member.displayName} sent "I'm OK" status.`,
      metadata: { latitude, longitude }
    });

    // Broadcast Realtime "I'm OK" status
    const { notifyStatusChange, notifyJourneyEvent, notifySosResolved } = require('../services/realtimeService');
    await notifyStatusChange(familyId, member._id, {
      state: MEMBER_STATUS.NORMAL,
      statusMessage: '🟢 Confirmed OK'
    });
    await notifyJourneyEvent(familyId, member._id, {
      eventType: 'CHECK_IN_SAFE',
      description: `${member.displayName} checked in safe ("I'm OK")`
    });

    return res.status(200).json({
      success: true,
      data: {
        status: 'SAFE_CONFIRMED',
        alertId: alert._id
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Resolve SOS emergency (Admin/Owner or Family member)
 */
async function resolveSos(req, res, next) {
  try {
    const { id } = req.params;
    const alert = await Alert.findOne({
      _id: id,
      familyId: req.user.familyId,
      type: ALERT_LEVELS.SOS
    });

    if (!alert) {
      return res.status(404).json({ success: false, error: 'Active SOS alert not found.' });
    }

    alert.resolvedAt = new Date();
    await alert.save();

    // Reset member status
    const member = await FamilyMembership.findById(alert.membershipId);
    if (member && member.currentStatus.state === MEMBER_STATUS.SOS) {
      member.currentStatus.state = MEMBER_STATUS.NORMAL;
      member.currentStatus.statusMessage = 'Safe';
      await member.save();
    }

    await AuditLog.create({
      familyId: req.user.familyId,
      actorUserId: req.user.id,
      action: 'SOS_RESOLVED',
      details: { alertId: alert._id }
    });

    // Broadcast Realtime SOS Resolved
    const { notifySosResolved, notifyStatusChange } = require('../services/realtimeService');
    await notifySosResolved(req.user.familyId, alert._id, alert.membershipId);
    if (member) {
      await notifyStatusChange(req.user.familyId, member._id, {
        state: MEMBER_STATUS.NORMAL,
        statusMessage: 'Safe'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'SOS alert resolved successfully.'
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  triggerSos,
  sendImOk,
  resolveSos
};
