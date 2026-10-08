const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { User, Family, FamilyMembership, AuditLog } = require('../models');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../utils/token');
const { ROLES } = require('@family-safety/shared-types');

/**
 * Register initial family owner / admin account
 */
async function register(req, res, next) {
  try {
    const { email, password, fullName, familyName } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and full name are required.'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists.'
      });
    }

    // Hash password with bcrypt salt rounds 10
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      email: normalizedEmail,
      passwordHash,
      fullName: fullName.trim()
    });

    // Create the Family entity
    const assignedFamilyName = (familyName && familyName.trim()) || `${fullName.trim()}'s Family`;
    const family = await Family.create({
      name: assignedFamilyName,
      ownerUserId: user._id
    });

    // Create Owner FamilyMembership
    const membership = await FamilyMembership.create({
      familyId: family._id,
      userId: user._id,
      displayName: fullName.trim(),
      role: ROLES.OWNER,
      locationSharingEnabled: true,
      visibleToFamily: true
    });

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      familyId: family._id.toString(),
      membershipId: membership._id.toString(),
      role: ROLES.OWNER
    });
    const rawRefreshToken = generateRefreshToken({ userId: user._id.toString() });

    // Store hashed refresh token on user record using SHA-256
    user.refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    await user.save();

    // Audit Log
    await AuditLog.create({
      familyId: family._id,
      actorUserId: user._id,
      actorMembershipId: membership._id,
      action: 'FAMILY_INITIALIZED',
      details: { familyName: family.name }
    });

    return res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName
        },
        family: {
          id: family._id,
          name: family.name
        },
        membership: {
          id: membership._id,
          displayName: membership.displayName,
          role: membership.role
        },
        tokens: {
          accessToken,
          refreshToken: rawRefreshToken
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Login existing user
 */
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.'
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password.'
      });
    }

    // Find active family membership
    const membership = await FamilyMembership.findOne({ userId: user._id }).populate('familyId');
    const family = membership ? membership.familyId : await Family.findOne({ ownerUserId: user._id });

    const role = membership ? membership.role : ROLES.MEMBER;
    const familyIdStr = family ? family._id.toString() : null;
    const membershipIdStr = membership ? membership._id.toString() : null;

    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      familyId: familyIdStr,
      membershipId: membershipIdStr,
      role
    });
    const rawRefreshToken = generateRefreshToken({ userId: user._id.toString() });

    // Rotate refresh token using SHA-256
    user.refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    await user.save();

    return res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          fullName: user.fullName
        },
        family: family
          ? {
              id: family._id,
              name: family.name
            }
          : null,
        membership: membership
          ? {
              id: membership._id,
              displayName: membership.displayName,
              role: membership.role
            }
          : null,
        tokens: {
          accessToken,
          refreshToken: rawRefreshToken
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Rotate Refresh Token
 */
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: 'Refresh token is required.'
      });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token.'
      });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.refreshTokenHash) {
      return res.status(401).json({
        success: false,
        error: 'Invalid session.'
      });
    }

    // Verify token matches hash in database using SHA-256
    const providedHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    if (providedHash !== user.refreshTokenHash) {
      // Possible reuse attack: invalidate session
      user.refreshTokenHash = null;
      await user.save();
      return res.status(401).json({
        success: false,
        error: 'Refresh token reuse detected. Please login again.'
      });
    }

    const membership = await FamilyMembership.findOne({ userId: user._id });
    const family = membership
      ? await Family.findById(membership.familyId)
      : await Family.findOne({ ownerUserId: user._id });

    const newAccessToken = generateAccessToken({
      userId: user._id.toString(),
      familyId: family ? family._id.toString() : null,
      membershipId: membership ? membership._id.toString() : null,
      role: membership ? membership.role : ROLES.MEMBER
    });
    const newRefreshToken = generateRefreshToken({ userId: user._id.toString() });

    // Rotate stored token hash with SHA-256
    user.refreshTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    await user.save();

    return res.status(200).json({
      success: true,
      data: {
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get current authenticated user profile
 */
async function me(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('-passwordHash -refreshTokenHash');
    const family = req.user.familyId ? await Family.findById(req.user.familyId) : null;
    const membership = req.user.membershipId ? await FamilyMembership.findById(req.user.membershipId) : null;

    return res.status(200).json({
      success: true,
      data: {
        user,
        family,
        membership
      }
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  refresh,
  me
};
