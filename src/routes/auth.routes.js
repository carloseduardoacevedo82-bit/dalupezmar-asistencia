const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken, requireRoles } = require('../middlewares/auth.middleware');

router.post('/login', authController.login);
router.get('/profile', verifyToken, authController.getProfile);
router.post('/register', verifyToken, requireRoles('ADMIN'), authController.registerUser);

module.exports = router;
