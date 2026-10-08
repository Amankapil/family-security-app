const { Location, FamilyMembership, Device } = require('../models');
const {
  SAFETY_CONFIG,
  isValidCoordinate,
  calculateHaversineDistance,
  ROLES
} = require('@family-safety/shared-types');

/**
 * Ingest location fix (single or batch) from Android device
 */
async function uploadLocations(req, res, next) {
  try {
    const { locations } = req.body;
    const { id: deviceId, familyId, membershipId } = req.device;
    const member = req.member;

    // Support raw array body, wrapped { locations: [...] }, or single object fix
    const rawList = Array.isArray(req.body)
      ? req.body
      : Array.isArray(locations)
      ? locations
      : [req.body];

    if (!rawList.length || typeof rawList[0].latitude !== 'number' || typeof rawList[0].longitude !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'At least one valid location fix with latitude and longitude is required.'
      });
    }

    const savedRecords = [];
    let latestValidFix = null;

    for (const fix of rawList) {
      const {
        latitude,
        longitude,
        accuracy,
        speed = 0,
        heading = 0,
        altitude = 0,
        batteryLevel,
        networkType,
        timestamp
      } = fix;

      // 1. Coordinate Validity Check
      if (!isValidCoordinate(latitude, longitude)) {
        continue; // Reject Null Island or out of range coordinates
      }

      // 2. Accuracy Check (Drop fixes exceeding max threshold)
      const maxAccuracy = SAFETY_CONFIG.MAX_GPS_ACCURACY_METERS || 65;
      if (typeof accuracy === 'number' && accuracy > maxAccuracy) {
        continue; // Drop imprecise fixes
      }

      // 3. Speed & Teleportation Anomaly Filter
      const speedKmh = (speed || 0) * 3.6;
      if (speedKmh > SAFETY_CONFIG.MAX_ALLOWED_SPEED_KMH) {
        continue; // Reject impossible speed jump
      }

      const fixTimestamp = timestamp ? new Date(timestamp) : new Date();

      // Check against previous location for jump calculation
      if (member.currentStatus && member.currentStatus.lastLocation && member.currentStatus.lastLocation.latitude) {
        const lastLat = member.currentStatus.lastLocation.latitude;
        const lastLng = member.currentStatus.lastLocation.longitude;
        const lastTime = new Date(member.currentStatus.lastLocation.updatedAt).getTime();
        const currentTime = fixTimestamp.getTime();

        const deltaTimeSeconds = Math.max(1, (currentTime - lastTime) / 1000);
        const distanceMeters = calculateHaversineDistance(lastLat, lastLng, latitude, longitude);
        const calculatedSpeedKmh = (distanceMeters / deltaTimeSeconds) * 3.6;

        // If time delta is realistic (> 2 seconds) and calculated speed is absurd, drop it
        if (deltaTimeSeconds > 2 && calculatedSpeedKmh > (SAFETY_CONFIG.MAX_ALLOWED_SPEED_KMH * 1.5)) {
          continue;
        }
      }

      // Prepare database document
      const doc = {
        familyId,
        membershipId,
        deviceId,
        location: {
          type: 'Point',
          coordinates: [longitude, latitude] // GeoJSON format: [lng, lat]
        },
        accuracy: accuracy || 10,
        speed: speed || 0,
        heading: heading || 0,
        altitude: altitude || 0,
        batteryLevel: batteryLevel !== undefined ? batteryLevel : null,
        networkType: networkType || 'UNKNOWN',
        timestamp: fixTimestamp
      };

      savedRecords.push(doc);

      // Track the chronologically newest fix in the batch
      if (!latestValidFix || new Date(fixTimestamp) > new Date(latestValidFix.updatedAt)) {
        latestValidFix = {
          latitude,
          longitude,
          accuracy: accuracy || 10,
          speed: speed || 0,
          updatedAt: fixTimestamp,
          batteryLevel
        };
      }
    }

    if (savedRecords.length > 0) {
      await Location.insertMany(savedRecords);

      // Update Member live status only if newest fix is more recent than existing record
      if (latestValidFix) {
        const existingTimestamp = member.currentStatus?.lastLocation?.updatedAt
          ? new Date(member.currentStatus.lastLocation.updatedAt).getTime()
          : 0;
        const fixTimestampMs = new Date(latestValidFix.updatedAt).getTime();

        if (fixTimestampMs >= existingTimestamp) {
          member.currentStatus.lastLocation = {
            latitude: latestValidFix.latitude,
            longitude: latestValidFix.longitude,
            accuracy: latestValidFix.accuracy,
            updatedAt: latestValidFix.updatedAt
          };
          if (latestValidFix.batteryLevel !== undefined && latestValidFix.batteryLevel !== null) {
            member.currentStatus.batteryLevel = latestValidFix.batteryLevel;
          }
          member.currentStatus.lastSeenAt = new Date();
          await member.save();
        }

        // Evaluate Geofence Transitions (Enter, Dwell, Exit)
        const { evaluateGeofenceTransitions } = require('../services/geofenceService');
        await evaluateGeofenceTransitions(member, latestValidFix);

        // Process Journey Engine (Departure, In-Transit, Arrival)
        const { processLocationForJourneys } = require('../services/journeyService');
        await processLocationForJourneys(member, latestValidFix);

        // Update Device lastSeenAt & battery
        const updatedDevice = await Device.findByIdAndUpdate(
          deviceId,
          {
            lastSeenAt: new Date(),
            ...(latestValidFix.batteryLevel !== undefined ? { batteryLevel: latestValidFix.batteryLevel } : {})
          },
          { new: true }
        );

        // Check for health alerts (e.g. critical low battery trigger)
        if (updatedDevice) {
          const { checkAndTriggerHealthAlerts } = require('../services/diagnosticService');
          await checkAndTriggerHealthAlerts(updatedDevice, member);
        }

        // Broadcast Realtime Location Update to Family Dashboard
        const { notifyLocationUpdate } = require('../services/realtimeService');
        await notifyLocationUpdate(familyId, membershipId, {
          latitude: latestValidFix.latitude,
          longitude: latestValidFix.longitude,
          accuracy: latestValidFix.accuracy,
          recordedAt: latestValidFix.updatedAt,
          batteryLevel: latestValidFix.batteryLevel,
          state: member.currentStatus?.state
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        ingestedCount: savedRecords.length,
        droppedCount: rawList.length - savedRecords.length,
        latestLocation: latestValidFix
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get latest location for a specific family member (subject to privacy toggles)
 */
async function getMemberLatestLocation(req, res, next) {
  try {
    const { id } = req.params;
    const member = await FamilyMembership.findOne({
      _id: id,
      familyId: req.user.familyId
    });

    if (!member) {
      return res.status(404).json({ success: false, error: 'Family member not found.' });
    }

    // Privacy Guard: If location sharing is toggled off by the member
    if (!member.locationSharingEnabled) {
      const isPrivileged = [ROLES.OWNER, ROLES.ADMIN].includes(req.user.role) && member.allowAdminsToView;
      const isSelf = req.user.membershipId === member._id.toString();

      if (!isPrivileged && !isSelf) {
        return res.status(200).json({
          success: true,
          data: {
            memberId: member._id,
            displayName: member.displayName,
            sharingStatus: 'PAUSED',
            location: null,
            message: `${member.displayName} has paused location sharing.`
          }
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        memberId: member._id,
        displayName: member.displayName,
        sharingStatus: member.locationSharingEnabled ? 'ACTIVE' : 'PAUSED',
        lastLocation: member.currentStatus.lastLocation || null,
        batteryLevel: member.currentStatus.batteryLevel,
        isCharging: member.currentStatus.isCharging,
        lastSeenAt: member.currentStatus.lastSeenAt
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get historical location breadcrumbs for journey visualization
 */
async function getMemberLocationHistory(req, res, next) {
  try {
    const { id } = req.params;
    const { from, to, limit = 100, order = 'desc' } = req.query;

    const member = await FamilyMembership.findOne({
      _id: id,
      familyId: req.user.familyId
    });

    if (!member) {
      return res.status(404).json({ success: false, error: 'Family member not found.' });
    }

    const query = {
      familyId: req.user.familyId,
      membershipId: member._id
    };

    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }

    const sortOrder = String(order).toLowerCase() === 'asc' ? 1 : -1;
    const history = await Location.find(query)
      .sort({ timestamp: sortOrder })
      .limit(Math.min(500, Number(limit)))
      .select('location accuracy speed heading timestamp batteryLevel');

    const formattedHistory = history.map((loc) => ({
      latitude: loc.location.coordinates[1],
      longitude: loc.location.coordinates[0],
      accuracy: loc.accuracy,
      speed: loc.speed,
      heading: loc.heading,
      timestamp: loc.timestamp,
      batteryLevel: loc.batteryLevel
    }));

    return res.status(200).json({
      success: true,
      data: formattedHistory
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  uploadLocations,
  getMemberLatestLocation,
  getMemberLocationHistory
};
