const { Geofence, FamilyMembership, Alert } = require('../models');
const {
  calculateHaversineDistance,
  MEMBER_STATUS,
  ALERT_LEVELS,
  ALERT_CATEGORIES,
  GEOFENCE_TYPES
} = require('@family-safety/shared-types');

// In-memory transition tracker to debounce edge jitter across rapid fixes
// Map key: `${membershipId}_${geofenceId}` -> { enterTime, exitTime, isInsideConfirmed }
const transitionTracker = new Map();

/**
 * Maps Geofence type to MemberStatus
 */
function mapGeofenceTypeToMemberStatus(type) {
  switch (type) {
    case GEOFENCE_TYPES.HOME:
      return MEMBER_STATUS.AT_HOME;
    case GEOFENCE_TYPES.WORK:
      return MEMBER_STATUS.AT_WORK;
    case GEOFENCE_TYPES.COLLEGE:
      return MEMBER_STATUS.AT_COLLEGE;
    default:
      return MEMBER_STATUS.AT_DESTINATION;
  }
}

/**
 * Evaluates whether a location fix enters, dwells within, or exits configured geofences.
 * Implements hysteresis margin (radius + 40m) and debounce timing to reject GPS jitter.
 *
 * @param {Object} member - FamilyMembership Mongoose document
 * @param {Object} locationFix - { latitude, longitude, accuracy, updatedAt }
 * @returns {Promise<Object|null>} Transition event details if state changed
 */
async function evaluateGeofenceTransitions(member, locationFix) {
  if (!member || !locationFix || !locationFix.latitude) return null;

  // Fetch all geofences applicable to this member (member-specific + shared family places)
  const geofences = await Geofence.find({
    familyId: member.familyId,
    enabled: true,
    $or: [{ membershipId: member._id }, { membershipId: null }]
  });

  if (!geofences.length) return null;

  const fixLat = locationFix.latitude;
  const fixLng = locationFix.longitude;
  const now = new Date(locationFix.updatedAt || Date.now()).getTime();

  let matchedGeofence = null;
  let transitionEvent = null;

  for (const fence of geofences) {
    const fenceLng = fence.location.coordinates[0];
    const fenceLat = fence.location.coordinates[1];
    const radius = fence.radius || 150;
    const dwellSeconds = fence.dwellTimeSeconds || 180;

    const distance = calculateHaversineDistance(fixLat, fixLng, fenceLat, fenceLng);
    const trackingKey = `${member._id}_${fence._id}`;
    let tracker = transitionTracker.get(trackingKey) || {
      firstSeenInside: null,
      firstSeenOutside: null,
      isInsideConfirmed: false
    };

    // Hysteresis boundary: Entering requires distance <= radius; Exiting requires distance > (radius + 40m)
    const isInsideNow = distance <= radius;
    const isDefinitelyOutside = distance > (radius + 40);

    if (isInsideNow) {
      tracker.firstSeenOutside = null;
      if (!tracker.firstSeenInside) {
        tracker.firstSeenInside = now;
      }

      const elapsedInsideSec = (now - tracker.firstSeenInside) / 1000;

      // Check if dwell threshold reached or already confirmed
      if (!tracker.isInsideConfirmed && elapsedInsideSec >= dwellSeconds) {
        tracker.isInsideConfirmed = true;
        matchedGeofence = fence;

        // Transition: ENTER & DWELL CONFIRMED
        const targetStatus = mapGeofenceTypeToMemberStatus(fence.type);
        const previousStatus = member.currentStatus.state;

        if (previousStatus !== targetStatus || member.currentStatus.geofenceId?.toString() !== fence._id.toString()) {
          member.currentStatus.state = targetStatus;
          member.currentStatus.geofenceId = fence._id;
          member.currentStatus.statusMessage = `At ${fence.name}`;
          await member.save();

          // Create Info Alert
          await Alert.create({
            familyId: member.familyId,
            membershipId: member._id,
            type: ALERT_LEVELS.INFO,
            category: ALERT_CATEGORIES.GEOFENCE_EVENT,
            title: `📍 ${member.displayName} reached ${fence.name}`,
            message: `${member.displayName} arrived safely at ${fence.name}.`,
            metadata: {
              geofenceId: fence._id,
              geofenceName: fence.name,
              geofenceType: fence.type,
              distance: Math.round(distance)
            }
          });

          transitionEvent = {
            type: 'ENTER_CONFIRMED',
            geofence: fence,
            status: targetStatus
          };
        }
      } else if (tracker.isInsideConfirmed) {
        matchedGeofence = fence;
      }
    } else if (isDefinitelyOutside && tracker.isInsideConfirmed) {
      // Transition: EXIT
      if (!tracker.firstSeenOutside) {
        tracker.firstSeenOutside = now;
      }

      const elapsedOutsideSec = (now - tracker.firstSeenOutside) / 1000;

      // Debounce exit by at least 30 seconds of confirmed outside location
      if (elapsedOutsideSec >= 30) {
        tracker.isInsideConfirmed = false;
        tracker.firstSeenInside = null;
        tracker.firstSeenOutside = null;

        if (member.currentStatus.geofenceId?.toString() === fence._id.toString()) {
          member.currentStatus.state = MEMBER_STATUS.NORMAL;
          member.currentStatus.geofenceId = null;
          member.currentStatus.statusMessage = `Left ${fence.name}`;
          await member.save();

          await Alert.create({
            familyId: member.familyId,
            membershipId: member._id,
            type: ALERT_LEVELS.INFO,
            category: ALERT_CATEGORIES.GEOFENCE_EVENT,
            title: `🚗 ${member.displayName} left ${fence.name}`,
            message: `${member.displayName} departed from ${fence.name}.`,
            metadata: {
              geofenceId: fence._id,
              geofenceName: fence.name,
              geofenceType: fence.type
            }
          });

          transitionEvent = {
            type: 'EXIT_CONFIRMED',
            geofence: fence,
            status: MEMBER_STATUS.NORMAL
          };
        }
      }
    }

    transitionTracker.set(trackingKey, tracker);
  }

  if (transitionEvent) {
    const { notifyStatusChange, notifyJourneyEvent } = require('./realtimeService');
    await notifyStatusChange(member.familyId, member._id, {
      state: member.currentStatus.state,
      statusMessage: member.currentStatus.statusMessage
    });
    await notifyJourneyEvent(member.familyId, member._id, {
      eventType: transitionEvent.type,
      description: member.currentStatus.statusMessage,
      geofenceName: transitionEvent.geofence?.name
    });

    const { sendGeofenceAlert } = require('./notificationService');
    await sendGeofenceAlert(member.familyId, member, transitionEvent.geofence, transitionEvent.type);
  }

  return transitionEvent;
}

/**
 * Clear memory tracker (useful for tests)
 */
function clearGeofenceTrackers() {
  transitionTracker.clear();
}

module.exports = {
  evaluateGeofenceTransitions,
  clearGeofenceTrackers,
  mapGeofenceTypeToMemberStatus
};
