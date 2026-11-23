const jwt = require('jsonwebtoken');
const { db } = require('../database');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'secret_admin_master_jwt_key_9988_2026';

function adminAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized. Admin login required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    const admin = db.prepare('SELECT id, username, role FROM admins WHERE id = ?').get(decoded.id);

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Admin account not found.' });
    }

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired admin session token.' });
  }
}

// RBAC Role Enforcement Middleware
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ success: false, message: 'Unauthorized. Admin login required.' });
    }
    // 'superadmin' has access to everything
    if (req.admin.role === 'superadmin' || allowedRoles.includes(req.admin.role)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: `Access denied. Your role (${req.admin.role}) does not have permission for this action. Requires: ${allowedRoles.join(' or ')}.`
    });
  };
}

module.exports = {
  adminAuthMiddleware,
  requireRole,
  ADMIN_JWT_SECRET
};
