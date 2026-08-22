const express = require('express');
const router = express.Router();
const signatureController = require('../controllers/signature.controller');
const { verifyToken, requireRoles } = require('../middlewares/auth.middleware');

// Envío de documento a firma electrónica (Transaccional)
router.post('/send', verifyToken, signatureController.sendDocumentForSignature);
router.post('/enviar', verifyToken, signatureController.sendDocumentForSignature);

// Reintentar despacho de documentos fallidos
router.post('/retry', verifyToken, requireRoles('ADMIN', 'HR'), signatureController.retryFailedSignatures);

// Listar documentos de un trabajador específico
router.get('/worker/:workerId', verifyToken, signatureController.getWorkerDocuments);
router.get('/trabajador/:workerId', verifyToken, signatureController.getWorkerDocuments);

// Listar todos los documentos de firma (Administrativo)
router.get('/all', verifyToken, requireRoles('ADMIN', 'HR', 'AUDITOR'), signatureController.getAllDocuments);
router.get('/', verifyToken, signatureController.getAllDocuments);

// Webhook para eventos desde el portal de firmas (abierto o validado con secret)
router.post('/webhook', signatureController.handleSignatureWebhook);

module.exports = router;
