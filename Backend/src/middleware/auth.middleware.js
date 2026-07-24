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

export { authMiddlewareJwt };