import jwt from 'jsonwebtoken';

function authMiddlewareJwt(req, res, next) {
  // Kunin ang token mula sa cookie
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function normalizeRoles(role) {
  const roles = String(role || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(roles)].filter(value => value === 'admin' || value === 'cashier');
}

function requireRole(requiredRole) {
  return (req, res, next) => {
    if (!normalizeRoles(req.admin?.role).includes(requiredRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. ${requiredRole === 'cashier' ? 'Cashier/POS' : 'Admin'} role required.`,
      });
    }
    return next();
  };
}

export { authMiddlewareJwt, requireRole };