/**
 * Firebase Cloud Messaging (FCM) Push Notification Service
 * Manages high-priority family emergency alerts, geofence arrivals/departures,
 * and low battery warnings for paired Android devices.
 */

const admin = require('firebase-admin');
const { Device } = require('../models');

let fcmInitialized = false;

// Initialize Firebase Admin SDK if configuration is provided
if (
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY
) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey
      })
    });
    fcmInitialized = true;
    console.log('[NotificationService] Firebase Cloud Messaging initialized successfully.');
  } catch (err) {
    console.warn('[NotificationService] Firebase Admin initialization failed, running in simulated mode:', err.message);
  }
} else {
  console.log('[NotificationService] No Firebase credentials provided. Operating in simulated notification mode.');
}

/**
 * Send notification to a specific FCM device token
 */
async function sendToToken(token, { title, body, data = {}, priority = 'normal', channelId = 'family_general' }) {
  if (!token) return { success: false, reason: 'NO_TOKEN' };

  const stringData = {};
  for (const [k, v] of Object.entries(data)) {
    stringData[k] = v !== null && v !== undefined ? String(v) : '';
  }

  const message = {
    token,
    notification: {
      title,
      body
    },
    data: stringData,
    android: {
      priority: priority === 'high' ? 'high' : 'normal',
      notification: {
        channelId,
        sound: priority === 'high' ? 'alarm_sound' : 'default',
        priority: priority === 'high' ? 'max' : 'default',
        visibility: 'public'
      }
    }
  };

  if (!fcmInitialized) {
    return {
      success: true,
      simulated: true,
      messageId: `sim_${Date.now()}`,
      title,
      body,
      recipientToken: token
    };
  }

  try {
    const response = await admin.messaging().send(message);
    return { success: true, messageId: response };
  } catch (err) {
    console.error('[NotificationService] FCM Send Error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Send push notification to all paired devices in a family
 */
async function sendToFamily(familyId, { title, body, data = {}, priority = 'normal', channelId = 'family_general', excludeDeviceId = null, excludeMembershipId = null }) {
  if (!familyId) return { count: 0 };

  const query = {
    familyId,
    isActive: true,
    fcmToken: { $exists: true, $ne: null }
  };

  if (excludeDeviceId) {
    query._id = { $ne: excludeDeviceId };
  }
  if (excludeMembershipId) {
    query.membershipId = { $ne: excludeMembershipId };
  }

  const devices = await Device.find(query);
  const results = [];

  for (const device of devices) {
    if (device.fcmToken) {
      const res = await sendToToken(device.fcmToken, {
        title,
        body,
        data: {
          ...data,
          targetDeviceId: device._id.toString()
        },
        priority,
        channelId
      });
      results.push(res);
    }
  }

  return {
    targetedDevicesCount: devices.length,
    results
  };
}

/**
 * 🚨 High-Priority Emergency SOS Broadcast
 */
async function sendSosAlert(familyId, member, location, alertId) {
  const memberName = member.displayName || 'A family member';
  const title = `🚨 EMERGENCY SOS: ${memberName}!`;
  const body = `${memberName} triggered distress SOS! Tap immediately to view their live GPS location.`;

  return sendToFamily(familyId, {
    title,
    body,
    priority: 'high',
    channelId: 'emergency_sos',
    excludeMembershipId: member._id,
    data: {
      type: 'SOS',
      alertId: alertId ? alertId.toString() : '',
      membershipId: member._id.toString(),
      displayName: memberName,
      latitude: location?.latitude || '',
      longitude: location?.longitude || '',
      timestamp: new Date().toISOString()
    }
  });
}

/**
 * 🚗 Geofence Arrival / Departure Alert
 */
async function sendGeofenceAlert(familyId, member, geofence, eventType) {
  const memberName = member.displayName || 'Family member';
  const placeName = geofence.name || 'Saved Place';

  let title;
  let body;

  if (eventType === 'ENTER_CONFIRMED') {
    title = `📍 ${memberName} reached ${placeName}`;
    body = `${memberName} arrived safely at ${placeName}.`;
  } else {
    title = `🚗 ${memberName} left ${placeName}`;
    body = `${memberName} departed from ${placeName}.`;
  }

  return sendToFamily(familyId, {
    title,
    body,
    priority: 'normal',
    channelId: 'family_journey',
    excludeMembershipId: member._id,
    data: {
      type: 'GEOFENCE',
      eventType,
      membershipId: member._id.toString(),
      geofenceId: geofence._id ? geofence._id.toString() : '',
      placeName
    }
  });
}

/**
 * 🔋 Low Battery Warning Alert
 */
async function sendLowBatteryAlert(familyId, member, batteryLevel) {
  const memberName = member.displayName || 'Family member';
  const title = `🔋 Low Battery Warning: ${memberName}`;
  const body = `${memberName}'s phone battery has dropped to ${batteryLevel}%.`;

  return sendToFamily(familyId, {
    title,
    body,
    priority: 'normal',
    channelId: 'family_general',
    excludeMembershipId: member._id,
    data: {
      type: 'LOW_BATTERY',
      membershipId: member._id.toString(),
      batteryLevel: String(batteryLevel)
    }
  });
}

module.exports = {
  sendToToken,
  sendToFamily,
  sendSosAlert,
  sendGeofenceAlert,
  sendLowBatteryAlert,
  isFcmInitialized: () => fcmInitialized
};
