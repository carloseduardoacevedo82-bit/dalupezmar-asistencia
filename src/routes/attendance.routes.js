const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { verifyToken, requireRoles } = require('../middlewares/auth.middleware');
const { uploadPhoto } = require('../middlewares/upload.middleware');

// Marcación rápida (Kiosco / QR / Remoto)
router.post('/punch', attendanceController.punch);

// Marcaciones del día en vivo (para pantalla de Kiosco y Dashboard)
router.get('/today-logs', attendanceController.getTodayLogs);

// Reporte histórico de asistencia (protegido)
router.get('/report', verifyToken, attendanceController.getAttendanceReport);

// Administración y modificación de asistencias
router.put('/records/:id', verifyToken, requireRoles('ADMIN', 'HR'), attendanceController.updateAttendanceRecord);
router.delete('/records/:id', verifyToken, requireRoles('ADMIN', 'HR'), attendanceController.deleteAttendanceRecord);
router.post('/manual-record', verifyToken, requireRoles('ADMIN', 'HR'), attendanceController.createManualAttendance);

// Justificaciones
router.get('/justifications', verifyToken, attendanceController.getJustifications);
router.post('/justifications', uploadPhoto.single('document'), attendanceController.createJustification);
router.put('/justifications/:id/review', verifyToken, requireRoles('ADMIN', 'HR'), attendanceController.reviewJustification);

module.exports = router;
