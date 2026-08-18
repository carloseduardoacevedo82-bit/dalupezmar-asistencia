const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employee.controller');
const { verifyToken, requireRoles } = require('../middlewares/auth.middleware');
const { uploadPhoto } = require('../middlewares/upload.middleware');

router.get('/catalogs', verifyToken, employeeController.getCatalogs);
router.get('/', verifyToken, employeeController.getEmployees);
router.get('/:id', verifyToken, employeeController.getEmployeeById);
router.post('/', verifyToken, requireRoles('ADMIN', 'HR'), uploadPhoto.single('photo'), employeeController.createEmployee);
router.put('/:id', verifyToken, requireRoles('ADMIN', 'HR'), uploadPhoto.single('photo'), employeeController.updateEmployee);

module.exports = router;
