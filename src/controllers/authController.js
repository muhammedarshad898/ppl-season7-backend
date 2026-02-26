const { verifyAdminPassword } = require('../models/Config');
const { signAdminToken } = require('../services/authService');

async function verifyPassword(req, res) {
  const ok = await verifyAdminPassword(req.body.password);
  return res.json({ ok });
}

async function login(req, res) {
  const ok = await verifyAdminPassword(req.body.password);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signAdminToken();
  return res.json({ token });
}

module.exports = {
  verifyPassword,
  login,
};
