const db = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { generateSecureQrToken, generateBarcodeValue } = require('../utils/badgeGenerator');
const { getPeruDateString } = require('../utils/timeCalculations');

/**
 * Endpoint de interoperabilidad para consultar tareo y asistencias desde ERP externo (Async PostgreSQL)
 */
const exportAttendanceForERP = async (req, res) => {
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
      WHERE a.attendance_date BETWEEN $1 AND $2
    `;

    const params = [start_date, end_date];
    let pIdx = 3;

    if (department_code) {
      query += ` AND d.code = $${pIdx}`;
      params.push(department_code);
      pIdx++;
    }

    if (branch_code) {
      query += ` AND b.code = $${pIdx}`;
      params.push(branch_code);
      pIdx++;
    }

    query += ` ORDER BY a.attendance_date ASC, e.employee_code ASC`;

    const recordsRes = await db.query(query, params);

    return successResponse(res, `Se encontraron ${recordsRes.rows.length} registros para el período solicitado.`, {
      total_records: recordsRes.rows.length,
      period: { start_date, end_date },
      items: recordsRes.rows
    });
  } catch (error) {
    return errorResponse(res, 'Error al exportar asistencias para ERP.', error.message);
  }
};

/**
 * Sincronizar (Upsert) altas y modificaciones de empleados desde sistemas externos
 */
const syncEmployeesFromERP = async (req, res) => {
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

    for (const item of employees) {
      try {
        if (!item.document_number || !item.first_name || !item.last_name) {
          results.errors.push({ doc: item.document_number, error: 'Campos requeridos incompletos.' });
          continue;
        }

        const docNum = String(item.document_number).trim();

        // Buscar claves foráneas o usar default
        const branchRes = await db.query('SELECT id FROM branches WHERE code = $1 OR id = $2 LIMIT 1', [item.branch_code || 'SED-01', Number(item.branch_id) || 1]);
        const deptRes = await db.query('SELECT id FROM departments WHERE code = $1 OR id = $2 LIMIT 1', [item.department_code || 'DEP-PROD', Number(item.department_id) || 5]);
        const posRes = await db.query('SELECT id FROM positions WHERE name = $1 OR id = $2 LIMIT 1', [item.position_name || 'Operario Produccion', Number(item.position_id) || 5]);
        const shiftRes = await db.query('SELECT id FROM shifts WHERE code = $1 OR id = $2 LIMIT 1', [item.shift_code || 'TUR-JRN-01', Number(item.shift_id) || 1]);

        const branchId = branchRes.rows[0]?.id || 1;
        const deptId = deptRes.rows[0]?.id || 5;
        const posId = posRes.rows[0]?.id || 5;
        const shiftId = shiftRes.rows[0]?.id || 1;

        const existingRes = await db.query('SELECT id, employee_code FROM employees WHERE document_number = $1', [docNum]);
        const existing = existingRes.rows[0];

        if (existing) {
          await db.query(`
            UPDATE employees SET
              first_name = $1, last_name = $2, email = COALESCE($3, email), phone = COALESCE($4, phone),
              branch_id = $5, department_id = $6, position_id = $7, shift_id = $8,
              work_mode = COALESCE($9, work_mode), status = COALESCE($10, status),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
          `, [
            item.first_name.trim(),
            item.last_name.trim(),
            item.email || null,
            item.phone || null,
            branchId,
            deptId,
            posId,
            shiftId,
            item.work_mode || null,
            item.status || null,
            existing.id
          ]);
          results.updated++;
        } else {
          let code = item.employee_code;
          if (!code) {
            const countRes = await db.query('SELECT COUNT(*) as c FROM employees');
            code = `EMP-${1000 + parseInt(countRes.rows[0].c, 10) + 1}`;
          }

          const insertResult = await db.transaction(async (client) => {
            const empInsert = await client.query(`
              INSERT INTO employees (
                employee_code, document_type, document_number, first_name, last_name,
                email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
                hire_date, branch_id, department_id, position_id, shift_id, photo_url, work_mode, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
              RETURNING id;
            `, [
              code,
              item.document_type || 'DNI',
              docNum,
              item.first_name.trim(),
              item.last_name.trim(),
              item.email || null,
              item.phone || null,
              item.emergency_contact_name || null,
              item.emergency_contact_phone || null,
              item.blood_type || 'O+',
              item.hire_date || getPeruDateString(),
              branchId,
              deptId,
              posId,
              shiftId,
              item.photo_url || '/uploads/photos/default-avatar.png',
              item.work_mode || 'PRESENTIAL',
              item.status || 'ACTIVE'
            ]);

            const newId = empInsert.rows[0].id;
            const qrHash = generateSecureQrToken(newId, code);
            const barcodeVal = generateBarcodeValue(docNum);
            const today = getPeruDateString();
            const expiry = new Date();
            expiry.setFullYear(expiry.getFullYear() + 2);
            const expiryStr = getPeruDateString(expiry);

            await client.query(`
              INSERT INTO badges (
                employee_id, badge_code, qr_token_hash, barcode_value,
                issue_date, expiration_date, status, template_theme
              ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', 'DALUPEZMAR_OFFICIAL')
            `, [newId, `BADGE-${code}`, qrHash, barcodeVal, today, expiryStr]);

            return newId;
          });

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

/**
 * Endpoint para sincronización directa de colaboradores con EPP Control y otros sistemas
 */
const getEmployeesRoster = async (req, res) => {
  try {
    const employeesRes = await db.query(`
      SELECT 
        e.id,
        e.employee_code,
        e.document_type,
        e.document_number,
        e.first_name,
        e.last_name,
        e.status,
        e.blood_type,
        e.emergency_contact_phone,
        e.hire_date,
        d.name as department_name,
        p.name as position_name,
        b.name as branch_name,
        bg.badge_code,
        bg.barcode_value,
        bg.qr_token_hash
      FROM employees e
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN badges bg ON e.id = bg.employee_id AND bg.status = 'ACTIVE'
      ORDER BY e.last_name ASC
    `);

    return successResponse(res, 'Padrón oficial de colaboradores obtenido con éxito.', employeesRes.rows);
  } catch (error) {
    return errorResponse(res, 'Error al obtener padrón de colaboradores.', error.message, 500);
  }
};

module.exports = {
  exportAttendanceForERP,
  syncEmployeesFromERP,
  getEmployeesRoster
};
