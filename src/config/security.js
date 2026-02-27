const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { verifyAdminToken } = require('../services/authService');

function createCorsOptions() {
  const configuredOrigin = process.env.CORS_ORIGIN;
  const allowedList = configuredOrigin
    ? configuredOrigin.split(',').map((item) => item.trim()).filter(Boolean)
    : [];

  const allowOrigin = (originOrReq, cb) => {
    const origin =
      typeof originOrReq === 'string'
        ? originOrReq
        : (originOrReq && originOrReq.headers && originOrReq.headers.origin) || '';
    if (!origin) return cb(null, true);
    if (allowedList.length === 0 || configuredOrigin === '*') return cb(null, true);
    if (allowedList.includes(origin)) return cb(null, true);
    if (origin.endsWith('.vercel.app')) return cb(null, true);
    return cb(null, false);
  };

  return {
    origin: allowedList.length === 0 || configuredOrigin === '*' ? true : allowOrigin,
    credentials: true,
  };
}

const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
});

function requireAdminJwt(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Missing admin token' });
  }

  try {
    req.admin = verifyAdminToken(token);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = {
  helmet,
  cors,
  apiLimiter,
  createCorsOptions,
  requireAdminJwt,
};
