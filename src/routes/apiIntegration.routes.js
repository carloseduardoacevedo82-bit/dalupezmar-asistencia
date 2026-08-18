const express = require('express');
const router = express.Router();
const apiIntegrationController = require('../controllers/apiIntegration.controller');
const { verifyApiKey } = require('../middlewares/apiKey.middleware');

// Rutas protegidas por X-API-KEY para ERP, Sistemas de Planillas y Recursos Humanos
router.use(verifyApiKey);

router.get('/attendances', apiIntegrationController.exportAttendanceForERP);
router.post('/employees/sync', apiIntegrationController.syncEmployeesFromERP);

module.exports = router;
