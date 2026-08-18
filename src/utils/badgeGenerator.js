const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Genera un token QR seguro e inmutable para el empleado
 * @param {string|number} employeeId 
 * @param {string} employeeCode 
 * @returns {string} Token criptográfico único
 */
function generateSecureQrToken(employeeId, employeeCode) {
  const salt = crypto.randomBytes(16).toString('hex');
  const rawString = `${employeeId}:${employeeCode}:${Date.now()}:${uuidv4()}:${salt}`;
  const hash = crypto.createHash('sha256').update(rawString).digest('hex');
  return `AGY_SEC_QR_${employeeCode}_${hash.substring(0, 32)}`;
}

/**
 * Formatea el código de barras (Code 128) garantizando compatibilidad
 * @param {string} documentNumber 
 * @returns {string}
 */
function generateBarcodeValue(documentNumber) {
  return String(documentNumber).trim().replace(/[^0-9A-Za-z]/g, '');
}

module.exports = {
  generateSecureQrToken,
  generateBarcodeValue
};
