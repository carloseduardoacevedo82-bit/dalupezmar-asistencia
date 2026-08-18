const db = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { generateSecureQrToken, generateBarcodeValue } = require('../utils/badgeGenerator');

/**
 * Obtener credencial activa de un empleado para renderizado de fotocheck
 */
const getBadgeByEmployeeId = (req, res) => {
  try {
    const { employeeId } = req.params;

    const query = `
      SELECT 
        bg.*,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.document_type,
        e.document_number,
        e.blood_type,
        e.emergency_contact_name,
        e.emergency_contact_phone,
        e.photo_url,
        e.work_mode,
        e.status as employee_status,
        d.name as department_name,
        p.name as position_name,
        b.name as branch_name,
        b.address as branch_address
      FROM badges bg
      INNER JOIN employees e ON bg.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE bg.employee_id = ? AND bg.status = 'ACTIVE'
      ORDER BY bg.id DESC LIMIT 1
    `;

    const badge = db.prepare(query).get(employeeId);

    if (!badge) {
      return errorResponse(res, 'No se encontró un fotocheck activo para este trabajador.', null, 404);
    }

    return successResponse(res, 'Fotocheck recuperado exitosamente.', badge);
  } catch (error) {
    return errorResponse(res, 'Error al consultar el fotocheck.', error.message);
  }
};

/**
 * Regenerar o emitir un nuevo fotocheck (anula anteriores)
 */
const regenerateBadge = (req, res) => {
  try {
    const { employeeId } = req.params;
    const { template_theme = 'CORPORATE_BLUE', expiration_years = 2 } = req.body;

    const emp = db.prepare('SELECT id, employee_code, document_number, status FROM employees WHERE id = ?').get(employeeId);

    if (!emp) {
      return errorResponse(res, 'Empleado no encontrado.', null, 404);
    }

    if (emp.status !== 'ACTIVE') {
      return errorResponse(res, 'No se puede emitir fotocheck para un empleado inactivo.', null, 400);
    }

    // Revocar credenciales activas anteriores
    db.prepare("UPDATE badges SET status = 'REVOKED' WHERE employee_id = ? AND status = 'ACTIVE'").run(employeeId);

    // Generar nuevo token seguro y código
    const qrHash = generateSecureQrToken(emp.id, emp.employee_code);
    const barcodeVal = generateBarcodeValue(emp.document_number);
    const badgeCode = `BADGE-${emp.employee_code}-${Date.now().toString().slice(-4)}`;
    
    const today = new Date().toISOString().split('T')[0];
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + Number(expiration_years));
    const expiryStr = expiry.toISOString().split('T')[0];

    const insertResult = db.prepare(`
      INSERT INTO badges (
        employee_id, badge_code, qr_token_hash, barcode_value,
        issue_date, expiration_date, status, template_theme
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `).run(emp.id, badgeCode, qrHash, barcodeVal, today, expiryStr, template_theme);

    return successResponse(res, 'Fotocheck regenerado exitosamente.', {
      badge_id: insertResult.lastInsertRowid,
      badge_code: badgeCode,
      qr_token_hash: qrHash,
      barcode_value: barcodeVal,
      template_theme
    }, 201);
  } catch (error) {
    return errorResponse(res, 'Error al regenerar el fotocheck.', error.message);
  }
};

/**
 * Verificar validez de un código QR o código de barras escaneado
 */
const verifyBadgeToken = (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return errorResponse(res, 'Token o código no proporcionado.', null, 400);
    }

    const trimmed = token.trim();

    // Buscar coincidencia por qr_token_hash, barcode_value, badge_code o employee_code/document_number
    const query = `
      SELECT 
        bg.*,
        e.id as employee_id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.document_number,
        e.photo_url,
        e.status as employee_status,
        e.work_mode,
        e.shift_id,
        d.name as department_name,
        p.name as position_name,
        b.name as branch_name,
        s.name as shift_name,
        s.entry_time as shift_entry_time,
        s.exit_time as shift_exit_time,
        s.tolerance_minutes as shift_tolerance
      FROM badges bg
      INNER JOIN employees e ON bg.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE (bg.qr_token_hash = ? OR bg.barcode_value = ? OR bg.badge_code = ? OR e.document_number = ? OR e.employee_code = ?)
        AND bg.status = 'ACTIVE'
      ORDER BY bg.id DESC LIMIT 1
    `;

    const badgeInfo = db.prepare(query).get(trimmed, trimmed, trimmed, trimmed, trimmed);

    if (!badgeInfo) {
      return errorResponse(res, 'Credencial inválida, revocada o no encontrada.', null, 404);
    }

    if (badgeInfo.employee_status !== 'ACTIVE') {
      return errorResponse(res, `El trabajador se encuentra en estado: ${badgeInfo.employee_status}. Acceso denegado.`, null, 403);
    }

    return successResponse(res, 'Credencial válida verificada.', badgeInfo);
  } catch (error) {
    return errorResponse(res, 'Error al verificar credencial.', error.message);
  }
};

module.exports = {
  getBadgeByEmployeeId,
  regenerateBadge,
  verifyBadgeToken
};
