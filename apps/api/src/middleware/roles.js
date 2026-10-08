const { ROLES } = require('@family-safety/shared-types');

/**
 * Role-Based Access Control Middleware
 * @param  {...string} allowedRoles
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. No role assigned.'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `Access denied. Requires one of: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

/**
 * Guard that verifies user has an active associated family
 */
function requireFamily(req, res, next) {
  if (!req.user || !req.user.familyId) {
    return res.status(400).json({
      success: false,
      error: 'User is not associated with an active family.'
    });
  }
  next();
}

module.exports = {
  requireRole,
  requireFamily
};
