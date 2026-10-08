const express = require('express');
const {
  getFamily,
  updateFamily,
  getMembers,
  addMember,
  getMemberById,
  updateMember,
  deleteMember,
  getFamilyAuditLogs
} = require('../controllers/familyController');
const { requireAuth } = require('../middleware/auth');
const { requireRole, requireFamily } = require('../middleware/roles');
const { ROLES } = require('@family-safety/shared-types');

const router = express.Router();

// All family routes require authentication and an active family
router.use(requireAuth, requireFamily);

// Security Audit Logs (OWNER or ADMIN only)
router.get('/audit-logs', requireRole(ROLES.OWNER, ROLES.ADMIN), getFamilyAuditLogs);

// Family details & settings
router.get('/', getFamily);
router.patch('/', requireRole(ROLES.OWNER, ROLES.ADMIN), updateFamily);

// Member management
router.get('/members', getMembers);
router.post('/members', requireRole(ROLES.OWNER, ROLES.ADMIN), addMember);
router.get('/members/:id', getMemberById);
router.patch('/members/:id', updateMember);
router.delete('/members/:id', requireRole(ROLES.OWNER, ROLES.ADMIN), deleteMember);

module.exports = router;
