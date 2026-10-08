const { Journey, Geofence, FamilyMembership, DailySummary, Alert } = require('../models');
const {
  calculateHaversineDistance,
  JOURNEY_STATUS,
  MEMBER_STATUS,
  ALERT_LEVELS,
  ALERT_CATEGORIES,
  GEOFENCE_TYPES
} = require('@family-safety/shared-types');

/**
 * Predicts the most likely destination among configured geofences based on distance & trajectory
 */
async function predictDestination(member, currentLat, currentLng, originGeofenceId) {
  const geofences = await Geofence.find({
    familyId: member.familyId,
    enabled: true,
    $or: [{ membershipId: member._id }, { membershipId: null }]
  });

  // Filter out the origin geofence
  const candidates = geofences.filter(
    (g) => !originGeofenceId || g._id.toString() !== originGeofenceId.toString()
  );

  if (!candidates.length) {
    return { geofenceId: null, name: 'Travelling' };
  }

  // If only one candidate destination exists, choose it
  if (candidates.length === 1) {
    return { geofenceId: candidates[0]._id, name: candidates[0].name };
  }

  // If candidate is a WORK or COLLEGE place and origin was HOME, prioritize it
  const workCandidate = candidates.find(
    (g) => g.type === GEOFENCE_TYPES.WORK || g.type === GEOFENCE_TYPES.COLLEGE
  );
  if (workCandidate) {
    return { geofenceId: workCandidate._id, name: workCandidate.name };
  }

  // Otherwise, default to the closest candidate
  let closest = candidates[0];
  let minDistance = Infinity;
  for (const c of candidates) {
    const dist = calculateHaversineDistance(
      currentLat,
      currentLng,
      c.location.coordinates[1],
      c.location.coordinates[0]
    );
    if (dist < minDistance) {
      minDistance = dist;
      closest = c;
    }
  }

  return { geofenceId: closest._id, name: closest.name };
}

/**
 * Appends an event to the member's DailySummary timeline
 */
async function recordDailyTimelineEvent(member, eventType, description, icon) {
  const todayDate = new Date().toISOString().split('T')[0];
  const timeStr = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  let summary = await DailySummary.findOne({
    membershipId: member._id,
    date: todayDate
  });

  if (!summary) {
    summary = new DailySummary({
      familyId: member.familyId,
      membershipId: member._id,
      date: todayDate,
      timelineEvents: []
    });
  }

  summary.timelineEvents.push({
    time: timeStr,
    eventType,
    description,
    icon: icon || '📍',
    timestamp: new Date()
  });

  if (eventType === 'JOURNEY_COMPLETED') {
    summary.journeysCompletedCount = (summary.journeysCompletedCount || 0) + 1;
  }

  await summary.save();
}

/**
 * Core Journey State Machine: Processes location updates to detect departure, transit, and arrival
 */
async function processLocationForJourneys(member, locationFix) {
  if (!member || !locationFix || !locationFix.latitude) return null;

  const fixLat = locationFix.latitude;
  const fixLng = locationFix.longitude;
  const fixSpeed = locationFix.speed || 0;
  const fixTime = new Date(locationFix.updatedAt || Date.now());

  // Check for an active ongoing journey for this member
  let activeJourney = await Journey.findOne({
    membershipId: member._id,
    status: { $in: [JOURNEY_STATUS.STARTING, JOURNEY_STATUS.TRAVELLING, JOURNEY_STATUS.DELAYED] }
  });

  // ==========================================
  // CASE 1: ACTIVE JOURNEY IN PROGRESS
  // ==========================================
  if (activeJourney) {
    // 1. Calculate incremental distance
    if (activeJourney.lastLocation && activeJourney.lastLocation.coordinates) {
      const prevLng = activeJourney.lastLocation.coordinates[0];
      const prevLat = activeJourney.lastLocation.coordinates[1];
      const stepDistance = calculateHaversineDistance(prevLat, prevLng, fixLat, fixLng);
      if (stepDistance > 5 && stepDistance < 5000) {
        activeJourney.distanceMeters = (activeJourney.distanceMeters || 0) + stepDistance;
      }
    }

    activeJourney.lastLocation = {
      coordinates: [fixLng, fixLat],
      timestamp: fixTime
    };

    // 2. Check Arrival at Destination
    // If member has entered a geofence that matches or represents destination
    if (member.currentStatus && member.currentStatus.geofenceId) {
      const currentGeofence = await Geofence.findById(member.currentStatus.geofenceId);
      if (currentGeofence) {
        const isNotOrigin =
          !activeJourney.originGeofenceId ||
          currentGeofence._id.toString() !== activeJourney.originGeofenceId.toString();

        if (isNotOrigin) {
          // Journey Arrival!
          activeJourney.status = JOURNEY_STATUS.COMPLETED;
          activeJourney.completedAt = fixTime;
          activeJourney.destinationGeofenceId = currentGeofence._id;
          activeJourney.destinationName = currentGeofence.name;

          const durationMs = fixTime.getTime() - new Date(activeJourney.startedAt).getTime();
          activeJourney.actualDurationMinutes = Math.max(1, Math.round(durationMs / 60000));

          await activeJourney.save();

          // Reset member active journey
          member.currentStatus.journeyId = null;
          await member.save();

          // Record in Daily Summary
          await recordDailyTimelineEvent(
            member,
            'JOURNEY_COMPLETED',
            `Reached ${currentGeofence.name}`,
            '✅'
          );

          // Alert family of safe arrival
          await Alert.create({
            familyId: member.familyId,
            membershipId: member._id,
            type: ALERT_LEVELS.INFO,
            category: ALERT_CATEGORIES.GEOFENCE_EVENT,
            title: `✅ ${member.displayName} reached ${currentGeofence.name} safely`,
            message: `${member.displayName} arrived at ${currentGeofence.name} (${activeJourney.actualDurationMinutes} mins, ${(activeJourney.distanceMeters / 1000).toFixed(1)} km).`,
            metadata: {
              journeyId: activeJourney._id,
              destination: currentGeofence.name,
              durationMinutes: activeJourney.actualDurationMinutes,
              distanceMeters: activeJourney.distanceMeters
            }
          });

          const { notifyJourneyEvent, notifyStatusChange } = require('./realtimeService');
          await notifyJourneyEvent(member.familyId, member._id, {
            eventType: 'JOURNEY_COMPLETED',
            description: `${member.displayName} reached ${currentGeofence.name} safely`
          });
          await notifyStatusChange(member.familyId, member._id, {
            state: member.currentStatus.state,
            statusMessage: member.currentStatus.statusMessage
          });

          return { event: 'JOURNEY_COMPLETED', journey: activeJourney };
        }
      }
    }

    activeJourney.metadata = activeJourney.metadata || {};

    // Abnormal Journey Heuristic 1: Prolonged Unexpected Stop mid-transit
    const isStationary = fixSpeed < 0.8; // < ~3 km/h
    if (isStationary) {
      if (!activeJourney.metadata.stoppedSince) {
        activeJourney.metadata.stoppedSince = fixTime.toISOString();
        activeJourney.metadata.stoppedLat = fixLat;
        activeJourney.metadata.stoppedLng = fixLng;
      } else {
        const stoppedDurationMins = Math.floor(
          (fixTime.getTime() - new Date(activeJourney.metadata.stoppedSince).getTime()) / 60000
        );
        activeJourney.metadata.stoppedDurationMinutes = stoppedDurationMins;

        // If stopped for >= 15 minutes outside a geofence and alert not yet sent
        if (stoppedDurationMins >= 15 && !activeJourney.metadata.stoppageAlertTriggered) {
          activeJourney.status = JOURNEY_STATUS.DELAYED;
          activeJourney.metadata.stoppageAlertTriggered = true;

          member.currentStatus.state = MEMBER_STATUS.POSSIBLE_ISSUE;
          member.currentStatus.statusMessage = `Unexpected stop mid-journey (${stoppedDurationMins}m)`;
          await member.save();

          await Alert.create({
            familyId: member.familyId,
            membershipId: member._id,
            type: ALERT_LEVELS.WARNING,
            category: ALERT_CATEGORIES.PROLONGED_STOP,
            title: `⚠️ Unexpected Stop: ${member.displayName}`,
            message: `${member.displayName} has stopped moving mid-journey for ${stoppedDurationMins} minutes.`,
            metadata: {
              journeyId: activeJourney._id,
              stoppedMinutes: stoppedDurationMins,
              coordinates: [fixLng, fixLat]
            }
          });

          const { notifyJourneyEvent, notifyStatusChange } = require('./realtimeService');
          await notifyJourneyEvent(member.familyId, member._id, {
            eventType: 'PROLONGED_STOP',
            description: `${member.displayName} has stopped moving for ${stoppedDurationMins} minutes`,
            journeyId: activeJourney._id.toString()
          });
          await notifyStatusChange(member.familyId, member._id, {
            state: member.currentStatus.state,
            statusMessage: member.currentStatus.statusMessage
          });

          // Dispatch FCM Push Notification to Family
          const { sendToFamily } = require('./notificationService');
          await sendToFamily(member.familyId, {
            title: `⚠️ Unexpected Stop: ${member.displayName}`,
            body: `${member.displayName} has stopped moving for ${stoppedDurationMins}m en route to ${activeJourney.destinationName}.`,
            priority: 'high',
            channelId: 'family_journey',
            excludeMembershipId: member._id,
            data: {
              type: 'PROLONGED_STOP',
              journeyId: activeJourney._id.toString(),
              membershipId: member._id.toString()
            }
          });
        }
      }
    } else if (fixSpeed > 2.0) {
      // Moving again (> 7 km/h): Clear stoppage if previously alerted or tracked
      if (activeJourney.metadata.stoppageAlertTriggered || activeJourney.metadata.stoppedSince) {
        const wasAlerted = activeJourney.metadata.stoppageAlertTriggered;
        activeJourney.metadata.stoppedSince = null;
        activeJourney.metadata.stoppageAlertTriggered = false;
        activeJourney.metadata.stoppedDurationMinutes = 0;

        if (activeJourney.status === JOURNEY_STATUS.DELAYED) {
          activeJourney.status = JOURNEY_STATUS.TRAVELLING;
        }

        if (member.currentStatus.state === MEMBER_STATUS.POSSIBLE_ISSUE) {
          member.currentStatus.state = MEMBER_STATUS.TRAVELLING;
          member.currentStatus.statusMessage = `Travelling to ${activeJourney.destinationName}`;
          await member.save();

          if (wasAlerted) {
            const { notifyJourneyEvent, notifyStatusChange } = require('./realtimeService');
            await notifyJourneyEvent(member.familyId, member._id, {
              eventType: 'JOURNEY_RESUMED',
              description: `${member.displayName} resumed travelling to ${activeJourney.destinationName}`,
              journeyId: activeJourney._id.toString()
            });
            await notifyStatusChange(member.familyId, member._id, {
              state: member.currentStatus.state,
              statusMessage: member.currentStatus.statusMessage
            });
          }
        }
      }
    }

    // Save ongoing transit progress
    if (activeJourney.status === JOURNEY_STATUS.STARTING) {
      activeJourney.status = JOURNEY_STATUS.TRAVELLING;
    }
    activeJourney.markModified('metadata');
    await activeJourney.save();
    return { event: 'JOURNEY_UPDATED', journey: activeJourney };
  }

  // ==========================================
  // CASE 2: NO ACTIVE JOURNEY — DETECT DEPARTURE
  // ==========================================
  // If member is not currently inside a confirmed geofence, and is moving (speed > 2.5 m/s = 9 km/h)
  const isInsideGeofence = Boolean(member.currentStatus && member.currentStatus.geofenceId);
  const isMoving = fixSpeed > 2.5;

  if (!isInsideGeofence && isMoving) {
    // Find closest or recent geofence to designate as origin
    let originGeofence = null;
    const allGeofences = await Geofence.find({
      familyId: member.familyId,
      enabled: true,
      $or: [{ membershipId: member._id }, { membershipId: null }]
    });

    let minOriginDist = Infinity;
    for (const g of allGeofences) {
      const d = calculateHaversineDistance(
        fixLat,
        fixLng,
        g.location.coordinates[1],
        g.location.coordinates[0]
      );
      if (d < minOriginDist) {
        minOriginDist = d;
        originGeofence = g;
      }
    }

    // If within 1.5km of a known place, designate it as origin
    const originName = originGeofence && minOriginDist < 1500
      ? originGeofence.name
      : 'Home';
    const originId = originGeofence && minOriginDist < 1500
      ? originGeofence._id
      : null;

    // Predict destination
    const destination = await predictDestination(member, fixLat, fixLng, originId);

    // Create new Journey record
    const newJourney = await Journey.create({
      familyId: member.familyId,
      membershipId: member._id,
      originGeofenceId: originId,
      originName,
      destinationGeofenceId: destination.geofenceId,
      destinationName: destination.name,
      status: JOURNEY_STATUS.TRAVELLING,
      startedAt: fixTime,
      distanceMeters: 0,
      lastLocation: {
        coordinates: [fixLng, fixLat],
        timestamp: fixTime
      }
    });

    // Update member live state
    member.currentStatus.state = MEMBER_STATUS.TRAVELLING;
    member.currentStatus.journeyId = newJourney._id;
    member.currentStatus.statusMessage = `Travelling to ${destination.name}`;
    await member.save();

    // Record in Daily Summary
    await recordDailyTimelineEvent(
      member,
      'JOURNEY_STARTED',
      `Started travelling: ${originName} → ${destination.name}`,
      '🚗'
    );

    // Alert family of departure
    await Alert.create({
      familyId: member.familyId,
      membershipId: member._id,
      type: ALERT_LEVELS.INFO,
      category: ALERT_CATEGORIES.GEOFENCE_EVENT,
      title: `🚗 ${member.displayName} started travelling to ${destination.name}`,
      message: `${member.displayName} departed from ${originName} and is on their way.`,
      metadata: {
        journeyId: newJourney._id,
        origin: originName,
        destination: destination.name
      }
    });

    const { notifyJourneyEvent, notifyStatusChange } = require('./realtimeService');
    await notifyJourneyEvent(member.familyId, member._id, {
      eventType: 'JOURNEY_STARTED',
      description: `Started travelling: ${originName} → ${destination.name}`
    });
    await notifyStatusChange(member.familyId, member._id, {
      state: member.currentStatus.state,
      statusMessage: member.currentStatus.statusMessage
    });

    return { event: 'JOURNEY_STARTED', journey: newJourney };
  }

  return null;
}

/**
 * Detects stale journeys where tracking has frozen or dropped during transit
 */
async function detectStaleJourneys(familyId) {
  const staleThresholdMs = 15 * 60 * 1000; // 15 minutes
  const now = Date.now();

  const query = {
    status: { $in: [JOURNEY_STATUS.TRAVELLING, JOURNEY_STATUS.DELAYED] }
  };
  if (familyId) query.familyId = familyId;

  const activeJourneys = await Journey.find(query);
  const flagged = [];

  for (const journey of activeJourneys) {
    const lastTimestamp = journey.lastLocation?.timestamp
      ? new Date(journey.lastLocation.timestamp).getTime()
      : new Date(journey.startedAt).getTime();

    const elapsedMs = now - lastTimestamp;
    if (elapsedMs >= staleThresholdMs) {
      const minutesSilent = Math.floor(elapsedMs / 60000);
      journey.metadata = journey.metadata || {};

      if (!journey.metadata.staleAlertTriggered) {
        journey.metadata.staleAlertTriggered = true;
        journey.metadata.staleMinutes = minutesSilent;
        journey.markModified('metadata');
        await journey.save();

        const member = await FamilyMembership.findById(journey.membershipId);
        if (member) {
          member.currentStatus.statusMessage = `GPS silent for ${minutesSilent}m during transit`;
          await member.save();

          await Alert.create({
            familyId: journey.familyId,
            membershipId: journey.membershipId,
            type: ALERT_LEVELS.WARNING,
            category: ALERT_CATEGORIES.LOCATION_STALE,
            title: `⚠️ GPS Stale: ${member.displayName}`,
            message: `No GPS updates from ${member.displayName} for ${minutesSilent} minutes during transit to ${journey.destinationName}.`,
            metadata: {
              journeyId: journey._id,
              minutesSilent
            }
          });

          const { sendToFamily } = require('./notificationService');
          await sendToFamily(journey.familyId, {
            title: `⚠️ GPS Stale: ${member.displayName}`,
            body: `No updates from ${member.displayName} for ${minutesSilent}m during transit.`,
            priority: 'normal',
            channelId: 'family_journey',
            excludeMembershipId: member._id,
            data: {
              type: 'LOCATION_STALE',
              journeyId: journey._id.toString(),
              membershipId: member._id.toString()
            }
          });
        }
      }

      flagged.push({
        journeyId: journey._id,
        membershipId: journey.membershipId,
        minutesSilent,
        destinationName: journey.destinationName
      });
    }
  }

  return flagged;
}

/**
 * Returns all active journeys in a family with their anomaly diagnostics
 */
async function getFamilyJourneyAnomalies(familyId) {
  const journeys = await Journey.find({
    familyId,
    status: { $in: [JOURNEY_STATUS.STARTING, JOURNEY_STATUS.TRAVELLING, JOURNEY_STATUS.DELAYED] }
  });

  const now = Date.now();
  return journeys.map((j) => {
    const lastTime = j.lastLocation?.timestamp
      ? new Date(j.lastLocation.timestamp).getTime()
      : new Date(j.startedAt).getTime();
    const minutesSinceLastFix = Math.floor((now - lastTime) / 60000);
    const stoppedMinutes = j.metadata?.stoppedDurationMinutes || 0;
    const isProlongedStop = Boolean(j.metadata?.stoppageAlertTriggered);
    const isStale = minutesSinceLastFix >= 15;

    return {
      journeyId: j._id,
      membershipId: j.membershipId,
      originName: j.originName,
      destinationName: j.destinationName,
      status: j.status,
      startedAt: j.startedAt,
      distanceMeters: j.distanceMeters,
      minutesSinceLastFix,
      stoppedMinutes,
      isProlongedStop,
      isStale,
      hasAnomaly: isProlongedStop || isStale || j.status === JOURNEY_STATUS.DELAYED
    };
  });
}

module.exports = {
  processLocationForJourneys,
  predictDestination,
  recordDailyTimelineEvent,
  detectStaleJourneys,
  getFamilyJourneyAnomalies
};
