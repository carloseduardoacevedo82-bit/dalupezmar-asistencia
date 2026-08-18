const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyToken, requireRoles } = require('../middlewares/auth.middleware');

router.post('/login', authController.login);
router.post('/worker-login', authController.workerLogin);
router.get('/profile', verifyToken, authController.getProfile);
router.post('/register', verifyToken, requireRoles('ADMIN'), authController.registerUser);

// Gestión de usuarios y credenciales (Solo ADMIN)
router.get('/users', verifyToken, requireRoles('ADMIN'), authController.getAllUsers);
router.put('/users/:id', verifyToken, requireRoles('ADMIN'), authController.updateUser);
router.delete('/users/:id', verifyToken, requireRoles('ADMIN'), authController.deleteUser);

module.exports = router;
