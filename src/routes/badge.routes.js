const express = require('express');
const router = express.Router();
const badgeController = require('../controllers/badge.controller');
const { verifyToken, requireRoles } = require('../middlewares/auth.middleware');

// Validación de credencial para escáneres (abierto o con token)
router.post('/verify', badgeController.verifyBadgeToken);

// Consulta y regeneración de credencial (protegido)
router.get('/employee/:employeeId', verifyToken, badgeController.getBadgeByEmployeeId);
router.post('/employee/:employeeId/regenerate', verifyToken, requireRoles('ADMIN', 'HR'), badgeController.regenerateBadge);

module.exports = router;
