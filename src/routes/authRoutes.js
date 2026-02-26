const express = require('express');
const { verifyPassword, login } = require('../controllers/authController');

const router = express.Router();

router.post('/admin/verify-password', verifyPassword);
router.post('/admin/login', login);

module.exports = router;
