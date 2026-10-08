const { verifyAccessToken } = require('../utils/token');
const { User, FamilyMembership } = require('../models');

/**
 * Authentication Middleware: Validates Bearer JWT and injects identity context
 */
async function requireAuth(req, res, next) {
  try {
    let authHeader = req.headers.authorization;
    if (!authHeader && req.query && req.query.token) {
      authHeader = `Bearer ${req.query.token}`;
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required. No token provided.'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    // Verify user still exists in database
    const user = await User.findById(decoded.userId).select('-passwordHash -refreshTokenHash');
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User account no longer exists.'
      });
    }

    // Verify active family membership
    let membership = null;
    if (decoded.membershipId) {
      membership = await FamilyMembership.findById(decoded.membershipId);
    } else if (decoded.familyId) {
      membership = await FamilyMembership.findOne({
        familyId: decoded.familyId,
        userId: user._id
      });
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      fullName: user.fullName,
      familyId: decoded.familyId || (membership ? membership.familyId.toString() : null),
      membershipId: membership ? membership._id.toString() : null,
      role: membership ? membership.role : decoded.role || 'MEMBER'
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Access token expired.'
      });
    }
    return res.status(401).json({
      success: false,
      error: 'Invalid or malformed authentication token.'
    });
  }
}

module.exports = {
  requireAuth
};
