const { Geofence, FamilyMembership, AuditLog } = require('../models');
const { GEOFENCE_TYPES, isValidCoordinate, ROLES } = require('@family-safety/shared-types');

/**
 * List geofences configured for a specific member or family
 */
async function getMemberGeofences(req, res, next) {
  try {
    const { id } = req.params;
    const member = await FamilyMembership.findOne({
      _id: id,
      familyId: req.user.familyId
    });

    if (!member) {
      return res.status(404).json({ success: false, error: 'Family member not found.' });
    }

    const geofences = await Geofence.find({
      familyId: req.user.familyId,
      $or: [{ membershipId: member._id }, { membershipId: null }]
    }).sort({ createdAt: 1 });

    const formatted = geofences.map((g) => ({
      id: g._id,
      name: g.name,
      type: g.type,
      latitude: g.location.coordinates[1],
      longitude: g.location.coordinates[0],
      radius: g.radius,
      dwellTimeSeconds: g.dwellTimeSeconds,
      enabled: g.enabled,
      isFamilyWide: g.membershipId === null
    }));

    return res.status(200).json({
      success: true,
      data: formatted
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new geofence
 */
async function createGeofence(req, res, next) {
  try {
    const {
      name,
      type,
      latitude,
      longitude,
      radius = 150,
      dwellTimeSeconds = 180,
      membershipId
    } = req.body;

    if (!name || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Name, latitude, and longitude are required.'
      });
    }

    if (!isValidCoordinate(latitude, longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid latitude or longitude coordinates.'
      });
    }

    const fenceType = Object.values(GEOFENCE_TYPES).includes(type)
      ? type
      : GEOFENCE_TYPES.CUSTOM;

    // Target member (if null, becomes shared family place)
    let targetMembershipId = null;
    if (membershipId) {
      const member = await FamilyMembership.findOne({
        _id: membershipId,
        familyId: req.user.familyId
      });
      if (member) {
        targetMembershipId = member._id;
      }
    }

    const geofence = await Geofence.create({
      familyId: req.user.familyId,
      membershipId: targetMembershipId,
      name: name.trim(),
      type: fenceType,
      location: {
        type: 'Point',
        coordinates: [longitude, latitude] // GeoJSON: [lng, lat]
      },
      radius: Math.max(50, Math.min(2000, Number(radius))),
      dwellTimeSeconds: Math.max(10, Math.min(600, Number(dwellTimeSeconds))),
      enabled: true
    });

    await AuditLog.create({
      familyId: req.user.familyId,
      actorUserId: req.user.id,
      action: 'GEOFENCE_CREATED',
      details: { name: geofence.name, type: geofence.type }
    });

    return res.status(201).json({
      success: true,
      data: {
        id: geofence._id,
        name: geofence.name,
        type: geofence.type,
        latitude,
        longitude,
        radius: geofence.radius,
        dwellTimeSeconds: geofence.dwellTimeSeconds,
        enabled: geofence.enabled,
        isFamilyWide: geofence.membershipId === null
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update an existing geofence
 */
async function updateGeofence(req, res, next) {
  try {
    const { id } = req.params;
    const { name, type, latitude, longitude, radius, dwellTimeSeconds, enabled } = req.body;

    const geofence = await Geofence.findOne({
      _id: id,
      familyId: req.user.familyId
    });

    if (!geofence) {
      return res.status(404).json({ success: false, error: 'Geofence not found.' });
    }

    if (name) geofence.name = name.trim();
    if (type && Object.values(GEOFENCE_TYPES).includes(type)) geofence.type = type;
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      if (!isValidCoordinate(latitude, longitude)) {
        return res.status(400).json({ success: false, error: 'Invalid coordinates.' });
      }
      geofence.location.coordinates = [longitude, latitude];
    }
    if (radius !== undefined) geofence.radius = Math.max(50, Math.min(2000, Number(radius)));
    if (dwellTimeSeconds !== undefined) geofence.dwellTimeSeconds = Math.max(10, Math.min(600, Number(dwellTimeSeconds)));
    if (enabled !== undefined) geofence.enabled = Boolean(enabled);

    await geofence.save();

    return res.status(200).json({
      success: true,
      data: {
        id: geofence._id,
        name: geofence.name,
        type: geofence.type,
        latitude: geofence.location.coordinates[1],
        longitude: geofence.location.coordinates[0],
        radius: geofence.radius,
        dwellTimeSeconds: geofence.dwellTimeSeconds,
        enabled: geofence.enabled
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a geofence
 */
async function deleteGeofence(req, res, next) {
  try {
    const { id } = req.params;
    const geofence = await Geofence.findOne({
      _id: id,
      familyId: req.user.familyId
    });

    if (!geofence) {
      return res.status(404).json({ success: false, error: 'Geofence not found.' });
    }

    await Geofence.deleteOne({ _id: geofence._id });

    await AuditLog.create({
      familyId: req.user.familyId,
      actorUserId: req.user.id,
      action: 'GEOFENCE_DELETED',
      details: { name: geofence.name }
    });

    return res.status(200).json({
      success: true,
      message: `Geofence "${geofence.name}" deleted successfully.`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMemberGeofences,
  createGeofence,
  updateGeofence,
  deleteGeofence
};
