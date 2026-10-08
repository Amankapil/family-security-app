const { Family, FamilyMembership, Device, AuditLog } = require('../models');
const { ROLES } = require('@family-safety/shared-types');

/**
 * Get current family info
 */
async function getFamily(req, res, next) {
  try {
    const family = await Family.findById(req.user.familyId);
    if (!family) {
      return res.status(404).json({
        success: false,
        error: 'Family not found.'
      });
    }

    const memberCount = await FamilyMembership.countDocuments({ familyId: family._id });
    const deviceCount = await Device.countDocuments({ familyId: family._id, isActive: true });

    return res.status(200).json({
      success: true,
      data: {
        family,
        stats: {
          memberCount,
          deviceCount
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update family settings (OWNER or ADMIN only)
 */
async function updateFamily(req, res, next) {
  try {
    const { name, settings } = req.body;
    const family = await Family.findById(req.user.familyId);
    if (!family) {
      return res.status(404).json({
        success: false,
        error: 'Family not found.'
      });
    }

    if (name) family.name = name.trim();
    if (settings) {
      if (settings.locationRetentionDays) family.settings.locationRetentionDays = settings.locationRetentionDays;
      if (settings.journeyTimeoutMinutes) family.settings.journeyTimeoutMinutes = settings.journeyTimeoutMinutes;
      if (settings.staleLocationThresholdMinutes) family.settings.staleLocationThresholdMinutes = settings.staleLocationThresholdMinutes;
      if (settings.lowBatteryThresholdPercent) family.settings.lowBatteryThresholdPercent = settings.lowBatteryThresholdPercent;
    }

    await family.save();

    await AuditLog.create({
      familyId: family._id,
      actorUserId: req.user.id,
      actorMembershipId: req.user.membershipId,
      action: 'FAMILY_SETTINGS_UPDATED',
      details: { name: family.name, settings: family.settings }
    });

    return res.status(200).json({
      success: true,
      data: family
    });
  } catch (error) {
    next(error);
  }
}

/**
 * List all members of the family
 */
async function getMembers(req, res, next) {
  try {
    const members = await FamilyMembership.find({ familyId: req.user.familyId }).sort({ createdAt: 1 });

    // Populate active device for each member
    const membersWithDevices = await Promise.all(
      members.map(async (member) => {
        const device = await Device.findOne({
          familyId: req.user.familyId,
          membershipId: member._id,
          isActive: true
        }).select('deviceName batteryLevel isCharging networkType lastSeenAt permissions');

        const memberObj = member.toObject();

        // If member has disabled location sharing and requester is not OWNER/ADMIN, hide coordinates
        if (!member.locationSharingEnabled && req.user.role === ROLES.MEMBER && req.user.membershipId !== member._id.toString()) {
          if (memberObj.currentStatus && memberObj.currentStatus.lastLocation) {
            delete memberObj.currentStatus.lastLocation;
          }
        }

        return {
          ...memberObj,
          activeDevice: device || null
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: membersWithDevices
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Add a new dynamic family member (Dad, Mom, Brother, Sister, etc.)
 */
async function addMember(req, res, next) {
  try {
    const { displayName, role, phone, emergencyContacts, expectedSchedule } = req.body;

    if (!displayName || !displayName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Member display name is required (e.g. Dad, Mom, Brother, Sister).'
      });
    }

    const memberRole = Object.values(ROLES).includes(role) ? role : ROLES.MEMBER;

    // Prevent non-owners from assigning OWNER role
    if (memberRole === ROLES.OWNER && req.user.role !== ROLES.OWNER) {
      return res.status(403).json({
        success: false,
        error: 'Only the current owner can assign OWNER role.'
      });
    }

    const member = await FamilyMembership.create({
      familyId: req.user.familyId,
      displayName: displayName.trim(),
      role: memberRole,
      phone: phone ? phone.trim() : null,
      emergencyContacts: emergencyContacts || [],
      expectedSchedule: expectedSchedule || { enabled: false },
      locationSharingEnabled: true,
      visibleToFamily: true,
      allowAdminsToView: true
    });

    await AuditLog.create({
      familyId: req.user.familyId,
      actorUserId: req.user.id,
      actorMembershipId: req.user.membershipId,
      action: 'MEMBER_ADDED',
      details: { memberId: member._id, displayName: member.displayName, role: member.role }
    });

    return res.status(201).json({
      success: true,
      data: member
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get single member by ID
 */
async function getMemberById(req, res, next) {
  try {
    const member = await FamilyMembership.findOne({
      _id: req.params.id,
      familyId: req.user.familyId
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Family member not found.'
      });
    }

    const device = await Device.findOne({
      familyId: req.user.familyId,
      membershipId: member._id,
      isActive: true
    });

    return res.status(200).json({
      success: true,
      data: {
        ...member.toObject(),
        activeDevice: device
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update member details or privacy toggles
 */
async function updateMember(req, res, next) {
  try {
    const member = await FamilyMembership.findOne({
      _id: req.params.id,
      familyId: req.user.familyId
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Family member not found.'
      });
    }

    // Role check: Only OWNER/ADMIN can edit other members; regular members can edit their own profile
    const isSelf = req.user.membershipId === member._id.toString();
    const isPrivileged = [ROLES.OWNER, ROLES.ADMIN].includes(req.user.role);

    if (!isSelf && !isPrivileged) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to modify this member.'
      });
    }

    const {
      displayName,
      role,
      phone,
      locationSharingEnabled,
      visibleToFamily,
      emergencyContacts,
      expectedSchedule
    } = req.body;

    if (displayName && isPrivileged) member.displayName = displayName.trim();
    if (role && isPrivileged && req.user.role === ROLES.OWNER) member.role = role;
    if (phone !== undefined) member.phone = phone ? phone.trim() : null;
    if (locationSharingEnabled !== undefined) member.locationSharingEnabled = Boolean(locationSharingEnabled);
    if (visibleToFamily !== undefined) member.visibleToFamily = Boolean(visibleToFamily);
    if (emergencyContacts) member.emergencyContacts = emergencyContacts;
    if (expectedSchedule) member.expectedSchedule = expectedSchedule;

    await member.save();

    await AuditLog.create({
      familyId: req.user.familyId,
      actorUserId: req.user.id,
      actorMembershipId: req.user.membershipId,
      action: 'MEMBER_UPDATED',
      details: { memberId: member._id, displayName: member.displayName }
    });

    return res.status(200).json({
      success: true,
      data: member
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Remove a family member (OWNER or ADMIN only)
 */
async function deleteMember(req, res, next) {
  try {
    const member = await FamilyMembership.findOne({
      _id: req.params.id,
      familyId: req.user.familyId
    });

    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Family member not found.'
      });
    }

    // Cannot delete the OWNER
    if (member.role === ROLES.OWNER) {
      return res.status(400).json({
        success: false,
        error: 'The family owner cannot be deleted. Transfer ownership first.'
      });
    }

    // Deactivate/revoke associated devices
    await Device.updateMany(
      { familyId: req.user.familyId, membershipId: member._id },
      { isActive: false }
    );

    await FamilyMembership.deleteOne({ _id: member._id });

    await AuditLog.create({
      familyId: req.user.familyId,
      actorUserId: req.user.id,
      actorMembershipId: req.user.membershipId,
      action: 'MEMBER_DELETED',
      details: { memberId: member._id, displayName: member.displayName }
    });

    return res.status(200).json({
      success: true,
      message: `Member ${member.displayName} removed successfully.`
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Retrieve security audit logs for the family (Admin or Owner)
 */
async function getFamilyAuditLogs(req, res, next) {
  try {
    const { limit = 50, action } = req.query;
    const query = { familyId: req.user.familyId };

    if (action) {
      query.action = action;
    }

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(200, Number(limit)));

    return res.status(200).json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getFamily,
  updateFamily,
  getMembers,
  addMember,
  getMemberById,
  updateMember,
  deleteMember,
  getFamilyAuditLogs
};
