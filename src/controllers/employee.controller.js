const db = require('../../database/database');
const { forceCheckpoint } = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { generateSecureQrToken, generateBarcodeValue } = require('../utils/badgeGenerator');
const { getPeruDateString } = require('../utils/timeCalculations');

/**
 * Listar empleados con filtros dinámicos y paginación
 */
const getEmployees = (req, res) => {
  try {
    const { search, department_id, branch_id, status, work_mode } = req.query;

    let query = `
      SELECT 
        e.*,
        b.name as branch_name,
        d.name as department_name,
        p.name as position_name,
        s.name as shift_name,
        s.entry_time as shift_entry_time,
        s.exit_time as shift_exit_time,
        bg.badge_code,
        bg.qr_token_hash,
        bg.barcode_value,
        bg.status as badge_status,
        bg.template_theme
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      LEFT JOIN badges bg ON e.id = bg.employee_id AND bg.status = 'ACTIVE'
      WHERE 1=1
    `;

    const params = [];

    if (search) {
      query += ` AND (e.first_name LIKE ? OR e.last_name LIKE ? OR e.document_number LIKE ? OR e.employee_code LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (department_id) {
      query += ` AND e.department_id = ?`;
      params.push(department_id);
    }

    if (branch_id) {
      query += ` AND e.branch_id = ?`;
      params.push(branch_id);
    }

    if (status) {
      query += ` AND e.status = ?`;
      params.push(status);
    }

    if (work_mode) {
      query += ` AND e.work_mode = ?`;
      params.push(work_mode);
    }

    query += ` ORDER BY e.first_name COLLATE NOCASE ASC, e.last_name COLLATE NOCASE ASC`;

    const employees = db.prepare(query).all(...params);

    return successResponse(res, 'Lista de empleados recuperada.', employees);
  } catch (error) {
    console.error('Error al obtener empleados:', error);
    return errorResponse(res, 'Error al recuperar la lista de empleados.', error.message);
  }
};

/**
 * Obtener detalle de un empleado por ID o Código
 */
const getEmployeeById = (req, res) => {
  try {
    const { id } = req.params;

    const query = `
      SELECT 
        e.*,
        b.name as branch_name,
        b.address as branch_address,
        b.latitude as branch_lat,
        b.longitude as branch_lng,
        b.radius_meters as branch_radius,
        d.name as department_name,
        p.name as position_name,
        s.name as shift_name,
        s.entry_time as shift_entry_time,
        s.exit_time as shift_exit_time,
        s.tolerance_minutes as shift_tolerance,
        s.lunch_start as shift_lunch_start,
        s.lunch_end as shift_lunch_end,
        bg.id as badge_id,
        bg.badge_code,
        bg.qr_token_hash,
        bg.barcode_value,
        bg.status as badge_status,
        bg.template_theme,
        bg.issue_date as badge_issue_date,
        bg.expiration_date as badge_expiration_date
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      LEFT JOIN badges bg ON e.id = bg.employee_id AND bg.status = 'ACTIVE'
      WHERE e.id = ? OR e.employee_code = ? OR e.document_number = ?
    `;

    const employee = db.prepare(query).get(id, id, id);

    if (!employee) {
      return errorResponse(res, 'Empleado no encontrado.', null, 404);
    }

    return successResponse(res, 'Detalle del empleado.', employee);
  } catch (error) {
    return errorResponse(res, 'Error al consultar empleado.', error.message);
  }
};

/**
 * Registrar nuevo empleado y emitir fotocheck automático
 */
const createEmployee = (req, res) => {
  try {
    const {
      employee_code,
      document_type = 'DNI',
      document_number,
      first_name,
      last_name,
      email,
      phone,
      emergency_contact_name,
      emergency_contact_phone,
      blood_type = 'O+',
      birth_date,
      hire_date = new Date().toISOString().split('T')[0],
      branch_id,
      department_id,
      position_id,
      shift_id,
      work_mode = 'PRESENTIAL',
      template_theme = 'CORPORATE_BLUE'
    } = req.body;

    if (!document_number || !first_name || !last_name || !branch_id || !department_id || !position_id || !shift_id) {
      return errorResponse(res, 'Faltan campos obligatorios para registrar al empleado.', null, 400);
    }

    // Verificar unicidad de documento
    const existingDoc = db.prepare('SELECT id FROM employees WHERE document_number = ?').get(document_number.trim());
    if (existingDoc) {
      return errorResponse(res, 'Ya existe un empleado registrado con este número de documento.', null, 409);
    }

    // Generar código de empleado si no fue provisto
    let finalEmpCode = employee_code ? employee_code.trim().toUpperCase() : null;
    if (!finalEmpCode) {
      const count = db.prepare('SELECT COUNT(*) as total FROM employees').get().total;
      finalEmpCode = `EMP-${1000 + count + 1}`;
    }

    const photoUrl = req.file ? `/uploads/photos/${req.file.filename}` : '/uploads/photos/default-avatar.png';

    // Insertar empleado
    const insertEmp = db.prepare(`
      INSERT INTO employees (
        employee_code, document_type, document_number, first_name, last_name,
        email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
        birth_date, hire_date, branch_id, department_id, position_id, shift_id,
        photo_url, work_mode, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `);

    const result = insertEmp.run(
      finalEmpCode,
      document_type,
      document_number.trim(),
      first_name.trim(),
      last_name.trim(),
      email ? email.trim() : null,
      phone ? phone.trim() : null,
      emergency_contact_name ? emergency_contact_name.trim() : null,
      emergency_contact_phone ? emergency_contact_phone.trim() : null,
      blood_type,
      birth_date || null,
      hire_date,
      Number(branch_id),
      Number(department_id),
      Number(position_id),
      Number(shift_id),
      photoUrl,
      work_mode
    );

    const newEmpId = result.lastInsertRowid;

    // Emisión automática de fotocheck/credencial activa
    const qrHash = generateSecureQrToken(newEmpId, finalEmpCode);
    const barcodeVal = generateBarcodeValue(document_number);
    const badgeCode = `BADGE-${finalEmpCode}`;
    const today = getPeruDateString();
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 2);
    const expiryStr = getPeruDateString(expiry);

    db.prepare(`
      INSERT INTO badges (
        employee_id, badge_code, qr_token_hash, barcode_value,
        issue_date, expiration_date, status, template_theme
      ) VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `).run(newEmpId, badgeCode, qrHash, barcodeVal, today, expiryStr, template_theme);

    forceCheckpoint('PASSIVE');

    return successResponse(res, 'Empleado registrado y fotocheck emitido correctamente.', {
      id: newEmpId,
      employee_code: finalEmpCode,
      badge_code: badgeCode,
      qr_token_hash: qrHash
    }, 201);
  } catch (error) {
    console.error('Error al crear empleado:', error);
    return errorResponse(res, 'Error al registrar el empleado.', error.message);
  }
};

/**
 * Actualizar datos de un empleado
 */
const updateEmployee = (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM employees WHERE id = ?').get(id);

    const {
      document_type = existing.document_type || 'DNI',
      first_name = existing.first_name,
      last_name = existing.last_name,
      document_number = existing.document_number,
      email = existing.email,
      phone = existing.phone,
      emergency_contact_name = existing.emergency_contact_name,
      emergency_contact_phone = existing.emergency_contact_phone,
      blood_type = existing.blood_type,
      birth_date = existing.birth_date,
      branch_id = existing.branch_id,
      department_id = existing.department_id,
      position_id = existing.position_id,
      shift_id = existing.shift_id,
      work_mode = existing.work_mode,
      status = existing.status
    } = req.body;

    let finalPositionId = Number(position_id) || existing.position_id;
    if (req.body.position_name) {
      const posNameClean = req.body.position_name.trim();
      const existingPos = db.prepare('SELECT id FROM positions WHERE UPPER(name) = ?').get(posNameClean.toUpperCase());
      if (existingPos) {
        finalPositionId = existingPos.id;
      } else {
        const insertPos = db.prepare('INSERT INTO positions (department_id, name, description) VALUES (?, ?, ?)').run(Number(department_id) || 1, posNameClean, posNameClean);
        finalPositionId = insertPos.lastInsertRowid;
      }
    }

    let photoUrl = existing.photo_url;
    if (req.file) {
      photoUrl = `/uploads/photos/${req.file.filename}`;
    }

    db.prepare(`
      UPDATE employees SET
        document_type = ?, first_name = ?, last_name = ?, document_number = ?, email = ?, phone = ?,
        emergency_contact_name = ?, emergency_contact_phone = ?, blood_type = ?,
        birth_date = ?, branch_id = ?, department_id = ?, position_id = ?,
        shift_id = ?, photo_url = ?, work_mode = ?, status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      document_type, first_name, last_name, document_number, email, phone,
      emergency_contact_name, emergency_contact_phone, blood_type,
      birth_date, Number(branch_id), Number(department_id), Number(finalPositionId),
      Number(shift_id), photoUrl, work_mode, status, id
    );

    // Actualizar código de barras y estado en badge
    if (document_number) {
      const barcodeVal = generateBarcodeValue(document_number);
      db.prepare("UPDATE badges SET barcode_value = ? WHERE employee_id = ?").run(barcodeVal, id);
    }
    if (status) {
      const badgeStatus = (status === 'INACTIVE' || status === 'SUSPENDED' || status === 'BAJA') ? 'INACTIVE' : 'ACTIVE';
      db.prepare("UPDATE badges SET status = ? WHERE employee_id = ?").run(badgeStatus, id);
    }

    forceCheckpoint('TRUNCATE');

    return successResponse(res, 'Empleado actualizado exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar empleado.', error.message);
  }
};

/**
 * Obtener catálogos maestros (sedes, departamentos, cargos, turnos)
 */
const getCatalogs = (req, res) => {
  try {
    const branches = db.prepare("SELECT * FROM branches WHERE is_active = 1 ORDER BY CASE WHEN UPPER(name) LIKE '%PECEPE%' THEN 0 ELSE 1 END, name ASC").all();
    const departments = db.prepare("SELECT * FROM departments WHERE is_active = 1 ORDER BY CASE WHEN UPPER(name) LIKE '%TROQUELADO%' THEN 0 WHEN UPPER(name) LIKE '%EXTERIOR%' OR UPPER(name) LIKE '%EXTERNA%' THEN 1 WHEN UPPER(name) LIKE '%PRODUCCI%' THEN 2 ELSE 3 END, name ASC").all();
    const positions = db.prepare("SELECT * FROM positions WHERE is_active = 1 ORDER BY CASE WHEN UPPER(name) LIKE '%OPERARIO DE PRODUCCI%' THEN 0 WHEN UPPER(name) LIKE '%TROQUELADO%' THEN 1 WHEN UPPER(name) LIKE '%AREA EXTERIOR%' THEN 2 WHEN UPPER(name) LIKE '%SUPERVIS%' THEN 3 ELSE 4 END, name ASC").all();
    const shifts = db.prepare('SELECT * FROM shifts WHERE is_active = 1 ORDER BY name ASC').all();

    return successResponse(res, 'Catálogos del sistema.', {
      branches,
      departments,
      positions,
      shifts
    });
  } catch (error) {
    return errorResponse(res, 'Error al recuperar catálogos.', error.message);
  }
};

/**
 * Obtener listado de Sedes y Geocercas GPS
 */
const getBranches = (req, res) => {
  try {
    const branches = db.prepare("SELECT * FROM branches ORDER BY id ASC").all();
    return successResponse(res, 'Sedes obtenidas.', branches);
  } catch (error) {
    return errorResponse(res, 'Error al obtener sedes.', error.message);
  }
};

/**
 * Actualizar Geocerca GPS y datos de una Sede de Marcación
 */
const updateBranchGeofence = (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, latitude, longitude, radius_meters } = req.body;

    const existing = db.prepare('SELECT * FROM branches WHERE id = ?').get(id);
    if (!existing) {
      return errorResponse(res, 'Sede no encontrada.', null, 404);
    }

    db.prepare(`
      UPDATE branches SET
        name = ?,
        address = ?,
        latitude = ?,
        longitude = ?,
        radius_meters = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      address || existing.address,
      latitude !== undefined ? latitude : existing.latitude,
      longitude !== undefined ? longitude : existing.longitude,
      radius_meters !== undefined ? Number(radius_meters) : existing.radius_meters,
      id
    );

    return successResponse(res, 'Sede y Geocerca GPS actualizadas exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar sede.', error.message);
  }
};

/**
 * Asignar sitio / sede de marcación autorizada a un trabajador
 */
const assignEmployeeBranch = (req, res) => {
  try {
    const { id } = req.params;
    const { branch_id } = req.body;

    if (!branch_id) {
      return errorResponse(res, 'ID de sede requerido.', null, 400);
    }

    db.prepare('UPDATE employees SET branch_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(Number(branch_id), id);

    return successResponse(res, 'Sitio de marcación asignado al colaborador con éxito.');
  } catch (error) {
    return errorResponse(res, 'Error al asignar sede.', error.message);
  }
};

module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  getCatalogs,
  getBranches,
  updateBranchGeofence,
  assignEmployeeBranch
};
