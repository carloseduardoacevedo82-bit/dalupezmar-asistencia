const db = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { generateSecureQrToken, generateBarcodeValue } = require('../utils/badgeGenerator');

/**
 * Endpoint de interoperabilidad para consultar tareo y asistencias desde ERP externo
 */
const exportAttendanceForERP = (req, res) => {
  try {
    const { start_date, end_date, department_code, branch_code } = req.query;

    if (!start_date || !end_date) {
      return errorResponse(res, 'Los parámetros start_date y end_date (YYYY-MM-DD) son obligatorios.', null, 400);
    }

    let query = `
      SELECT 
        a.id as attendance_id,
        a.attendance_date,
        a.status,
        a.expected_entry,
        a.expected_exit,
        a.first_entry_time,
        a.lunch_start_time,
        a.lunch_end_time,
        a.last_exit_time,
        a.total_minutes_worked,
        ROUND(a.total_minutes_worked / 60.0, 2) as total_hours_worked,
        a.total_minutes_late,
        a.total_minutes_overtime,
        ROUND(a.total_minutes_overtime / 60.0, 2) as total_overtime_hours,
        a.is_complete,
        e.employee_code,
        e.document_type,
        e.document_number,
        e.first_name,
        e.last_name,
        d.code as department_code,
        d.name as department_name,
        p.name as position_name,
        b.code as branch_code,
        b.name as branch_name,
        s.code as shift_code
      FROM attendances a
      INNER JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN shifts s ON a.shift_id = s.id
      WHERE a.attendance_date BETWEEN ? AND ?
    `;

    const params = [start_date, end_date];

    if (department_code) {
      query += ` AND d.code = ?`;
      params.push(department_code);
    }

    if (branch_code) {
      query += ` AND b.code = ?`;
      params.push(branch_code);
    }

    query += ` ORDER BY a.attendance_date ASC, e.employee_code ASC`;

    const records = db.prepare(query).all(...params);

    return successResponse(res, `Se encontraron ${records.length} registros para el período solicitado.`, {
      total_records: records.length,
      period: { start_date, end_date },
      items: records
    });
  } catch (error) {
    return errorResponse(res, 'Error al exportar asistencias para ERP.', error.message);
  }
};

/**
 * Sincronizar (Upsert) altas y modificaciones de empleados desde sistemas externos
 */
const syncEmployeesFromERP = (req, res) => {
  try {
    const { employees } = req.body;

    if (!Array.isArray(employees) || employees.length === 0) {
      return errorResponse(res, 'Debe enviar un arreglo de empleados en la propiedad "employees".', null, 400);
    }

    const results = {
      created: 0,
      updated: 0,
      errors: []
    };

    const findBranch = db.prepare('SELECT id FROM branches WHERE code = ? OR id = ? LIMIT 1');
    const findDept = db.prepare('SELECT id FROM departments WHERE code = ? OR id = ? LIMIT 1');
    const findPos = db.prepare('SELECT id FROM positions WHERE name = ? OR id = ? LIMIT 1');
    const findShift = db.prepare('SELECT id FROM shifts WHERE code = ? OR id = ? LIMIT 1');

    for (const item of employees) {
      try {
        if (!item.document_number || !item.first_name || !item.last_name) {
          results.errors.push({ doc: item.document_number, error: 'Campos requeridos incompletos.' });
          continue;
        }

        const branch = findBranch.get(item.branch_code || 1, item.branch_id || 1) || { id: 1 };
        const dept = findDept.get(item.department_code || 'DEP-TI', item.department_id || 1) || { id: 1 };
        const pos = findPos.get(item.position_name || 'Desarrollador Full Stack', item.position_id || 1) || { id: 1 };
        const shift = findShift.get(item.shift_code || 'TUR-ADM', item.shift_id || 1) || { id: 1 };

        const existing = db.prepare('SELECT id, employee_code FROM employees WHERE document_number = ?').get(item.document_number.trim());

        if (existing) {
          // Actualizar
          db.prepare(`
            UPDATE employees SET
              first_name = ?, last_name = ?, email = ?, phone = ?,
              branch_id = ?, department_id = ?, position_id = ?, shift_id = ?,
              work_mode = COALESCE(?, work_mode), status = COALESCE(?, status),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            item.first_name.trim(),
            item.last_name.trim(),
            item.email || null,
            item.phone || null,
            branch.id,
            dept.id,
            pos.id,
            shift.id,
            item.work_mode || null,
            item.status || null,
            existing.id
          );
          results.updated++;
        } else {
          // Crear nuevo
          let code = item.employee_code || `EMP-${1000 + db.prepare('SELECT COUNT(*) as c FROM employees').get().c + 1}`;
          const insertResult = db.prepare(`
            INSERT INTO employees (
              employee_code, document_type, document_number, first_name, last_name,
              email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
              hire_date, branch_id, department_id, position_id, shift_id, photo_url, work_mode, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            code,
            item.document_type || 'DNI',
            item.document_number.trim(),
            item.first_name.trim(),
            item.last_name.trim(),
            item.email || null,
            item.phone || null,
            item.emergency_contact_name || null,
            item.emergency_contact_phone || null,
            item.blood_type || 'O+',
            item.hire_date || new Date().toISOString().split('T')[0],
            branch.id,
            dept.id,
            pos.id,
            shift.id,
            item.photo_url || '/uploads/photos/default-avatar.png',
            item.work_mode || 'PRESENTIAL',
            item.status || 'ACTIVE'
          );

          // Emitir fotocheck automático
          const newId = insertResult.lastInsertRowid;
          const qrHash = generateSecureQrToken(newId, code);
          const barcodeVal = generateBarcodeValue(item.document_number);
          const today = new Date().toISOString().split('T')[0];
          const expiry = new Date();
          expiry.setFullYear(expiry.getFullYear() + 2);

          db.prepare(`
            INSERT INTO badges (
              employee_id, badge_code, qr_token_hash, barcode_value,
              issue_date, expiration_date, status, template_theme
            ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 'CORPORATE_BLUE')
          `).run(newId, `BADGE-${code}`, qrHash, barcodeVal, today, expiry.toISOString().split('T')[0]);

          results.created++;
        }
      } catch (err) {
        results.errors.push({ doc: item.document_number, error: err.message });
      }
    }

    return successResponse(res, 'Sincronización procesada con éxito.', results);
  } catch (error) {
    return errorResponse(res, 'Error en sincronización masiva.', error.message);
  }
};

module.exports = {
  exportAttendanceForERP,
  syncEmployeesFromERP
};
