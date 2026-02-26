const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { verifyAdminToken } = require('../services/authService');

function createCorsOptions() {
  const configuredOrigin = process.env.CORS_ORIGIN;
  if (!configuredOrigin || configuredOrigin === '*') {
    return { origin: true, credentials: true };
  }

  const origins = configuredOrigin.split(',').map((item) => item.trim()).filter(Boolean);
  return {
    origin: origins,
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
