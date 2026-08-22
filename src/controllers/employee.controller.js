const db = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { generateSecureQrToken, generateBarcodeValue } = require('../utils/badgeGenerator');
const { getPeruDateString } = require('../utils/timeCalculations');

/**
 * Listar empleados con filtros dinámicos y paginación (Async PostgreSQL)
 */
const getEmployees = async (req, res) => {
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
    let pIdx = 1;

    if (search) {
      query += ` AND (
        e.first_name ILIKE $${pIdx} OR 
        e.last_name ILIKE $${pIdx} OR 
        e.document_number ILIKE $${pIdx} OR 
        e.employee_code ILIKE $${pIdx}
      )`;
      params.push(`%${search}%`);
      pIdx++;
    }

    if (department_id) {
      query += ` AND e.department_id = $${pIdx}`;
      params.push(Number(department_id));
      pIdx++;
    }

    if (branch_id) {
      query += ` AND e.branch_id = $${pIdx}`;
      params.push(Number(branch_id));
      pIdx++;
    }

    if (status) {
      query += ` AND e.status = $${pIdx}`;
      params.push(status);
      pIdx++;
    }

    if (work_mode) {
      query += ` AND e.work_mode = $${pIdx}`;
      params.push(work_mode);
      pIdx++;
    }

    query += ` ORDER BY e.first_name ASC, e.last_name ASC`;

    const result = await db.query(query, params);

    return successResponse(res, 'Lista de empleados recuperada.', result.rows);
  } catch (error) {
    console.error('Error al obtener empleados:', error);
    return errorResponse(res, 'Error al recuperar la lista de empleados.', error.message);
  }
};

/**
 * Obtener detalle de un empleado por ID o Código
 */
const getEmployeeById = async (req, res) => {
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
      WHERE e.id = $1 OR e.employee_code = $2 OR e.document_number = $2
    `;

    const numId = isNaN(Number(id)) ? 0 : Number(id);
    const result = await db.query(query, [numId, String(id).trim()]);
    const employee = result.rows[0];

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
const createEmployee = async (req, res) => {
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
      template_theme = 'DALUPEZMAR_OFFICIAL'
    } = req.body;

    if (!document_number || !first_name || !last_name || !branch_id || !department_id || !position_id || !shift_id) {
      return errorResponse(res, 'Faltan campos obligatorios para registrar al empleado.', null, 400);
    }

    // Verificar unicidad de documento
    const existingDoc = await db.query('SELECT id FROM employees WHERE document_number = $1', [document_number.trim()]);
    if (existingDoc.rows.length > 0) {
      return errorResponse(res, 'Ya existe un empleado registrado con este número de documento.', null, 409);
    }

    // Generar código de empleado si no fue provisto
    let finalEmpCode = employee_code ? employee_code.trim().toUpperCase() : null;
    if (!finalEmpCode) {
      const countRes = await db.query('SELECT COUNT(*) as total FROM employees');
      const count = parseInt(countRes.rows[0].total, 10);
      finalEmpCode = `EMP-${1000 + count + 1}`;
    }

    const photoUrl = req.file ? `/uploads/photos/${req.file.filename}` : '/uploads/photos/default-avatar.png';

    // Insertar empleado y emitir credencial dentro de transacción
    const createdInfo = await db.transaction(async (client) => {
      const insertEmpRes = await client.query(`
        INSERT INTO employees (
          employee_code, document_type, document_number, first_name, last_name,
          email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
          birth_date, hire_date, branch_id, department_id, position_id, shift_id,
          photo_url, work_mode, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'ACTIVE')
        RETURNING id, employee_code, document_number;
      `, [
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
      ]);

      const newEmp = insertEmpRes.rows[0];
      const newEmpId = newEmp.id;

      // Emisión automática de fotocheck/credencial activa
      const qrHash = generateSecureQrToken(newEmpId, finalEmpCode);
      const barcodeVal = generateBarcodeValue(document_number);
      const badgeCode = `BADGE-${finalEmpCode}`;
      const today = getPeruDateString();
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 2);
      const expiryStr = getPeruDateString(expiry);

      await client.query(`
        INSERT INTO badges (
          employee_id, badge_code, qr_token_hash, barcode_value,
          issue_date, expiration_date, status, template_theme
        ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7)
      `, [newEmpId, badgeCode, qrHash, barcodeVal, today, expiryStr, template_theme]);

      return {
        id: newEmpId,
        employee_code: finalEmpCode,
        badge_code: badgeCode,
        qr_token_hash: qrHash
      };
    });

    return successResponse(res, 'Empleado registrado y fotocheck emitido correctamente.', createdInfo, 201);
  } catch (error) {
    console.error('Error al crear empleado:', error);
    return errorResponse(res, 'Error al registrar el empleado.', error.message);
  }
};

/**
 * Actualizar datos de un empleado
 */
const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const existingRes = await db.query('SELECT * FROM employees WHERE id = $1', [id]);
    const existing = existingRes.rows[0];

    if (!existing) {
      return errorResponse(res, 'Empleado no encontrado.', null, 404);
    }

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
      const existingPos = await db.query('SELECT id FROM positions WHERE UPPER(name) = UPPER($1)', [posNameClean]);
      if (existingPos.rows.length > 0) {
        finalPositionId = existingPos.rows[0].id;
      } else {
        const insertPos = await db.query(
          'INSERT INTO positions (department_id, name, description) VALUES ($1, $2, $3) RETURNING id',
          [Number(department_id) || 1, posNameClean, posNameClean]
        );
        finalPositionId = insertPos.rows[0].id;
      }
    }

    let photoUrl = existing.photo_url;
    if (req.file) {
      photoUrl = `/uploads/photos/${req.file.filename}`;
    }

    await db.transaction(async (client) => {
      await client.query(`
        UPDATE employees SET
          document_type = $1, first_name = $2, last_name = $3, document_number = $4, email = $5, phone = $6,
          emergency_contact_name = $7, emergency_contact_phone = $8, blood_type = $9,
          birth_date = $10, branch_id = $11, department_id = $12, position_id = $13,
          shift_id = $14, photo_url = $15, work_mode = $16, status = $17,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $18
      `, [
        document_type, first_name, last_name, document_number, email, phone,
        emergency_contact_name, emergency_contact_phone, blood_type,
        birth_date, Number(branch_id), Number(department_id), Number(finalPositionId),
        Number(shift_id), photoUrl, work_mode, status, id
      ]);

      // Actualizar código de barras y estado en badge
      if (document_number) {
        const barcodeVal = generateBarcodeValue(document_number);
        await client.query("UPDATE badges SET barcode_value = $1 WHERE employee_id = $2", [barcodeVal, id]);
      }
      if (status) {
        const badgeStatus = (status === 'INACTIVE' || status === 'SUSPENDED' || status === 'BAJA') ? 'REVOKED' : 'ACTIVE';
        await client.query("UPDATE badges SET status = $1 WHERE employee_id = $2", [badgeStatus, id]);
      }
    });

    return successResponse(res, 'Empleado actualizado exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar empleado.', error.message);
  }
};

/**
 * Obtener catálogos maestros (sedes, departamentos, cargos, turnos)
 */
const getCatalogs = async (req, res) => {
  try {
    const branches = await db.query("SELECT * FROM branches WHERE is_active = 1 ORDER BY CASE WHEN UPPER(name) LIKE '%PLANTA%' THEN 0 ELSE 1 END, name ASC");
    const departments = await db.query("SELECT * FROM departments WHERE is_active = 1 ORDER BY CASE WHEN UPPER(name) LIKE '%PRODUCCI%' THEN 0 ELSE 1 END, name ASC");
    const positions = await db.query("SELECT * FROM positions WHERE is_active = 1 ORDER BY CASE WHEN UPPER(name) LIKE '%OPERARIO%' THEN 0 WHEN UPPER(name) LIKE '%TROQUELADO%' THEN 1 WHEN UPPER(name) LIKE '%AREA EXTERIOR%' THEN 2 WHEN UPPER(name) LIKE '%SUPERVIS%' THEN 3 ELSE 4 END, name ASC");
    const shifts = await db.query('SELECT * FROM shifts WHERE is_active = 1 ORDER BY name ASC');

    return successResponse(res, 'Catálogos del sistema.', {
      branches: branches.rows,
      departments: departments.rows,
      positions: positions.rows,
      shifts: shifts.rows
    });
  } catch (error) {
    return errorResponse(res, 'Error al recuperar catálogos.', error.message);
  }
};

/**
 * Obtener listado de Sedes y Geocercas GPS
 */
const getBranches = async (req, res) => {
  try {
    const branches = await db.query("SELECT * FROM branches ORDER BY id ASC");
    return successResponse(res, 'Sedes obtenidas.', branches.rows);
  } catch (error) {
    return errorResponse(res, 'Error al obtener sedes.', error.message);
  }
};

/**
 * Actualizar Geocerca GPS y datos de una Sede de Marcación
 */
const updateBranchGeofence = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address, latitude, longitude, radius_meters } = req.body;

    const existingRes = await db.query('SELECT * FROM branches WHERE id = $1', [id]);
    const existing = existingRes.rows[0];
    if (!existing) {
      return errorResponse(res, 'Sede no encontrada.', null, 404);
    }

    await db.query(`
      UPDATE branches SET
        name = $1,
        address = $2,
        latitude = $3,
        longitude = $4,
        radius_meters = $5
      WHERE id = $6
    `, [
      name || existing.name,
      address || existing.address,
      latitude !== undefined ? latitude : existing.latitude,
      longitude !== undefined ? longitude : existing.longitude,
      radius_meters !== undefined ? Number(radius_meters) : existing.radius_meters,
      id
    ]);

    return successResponse(res, 'Sede y Geocerca GPS actualizadas exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar sede.', error.message);
  }
};

/**
 * Asignar sitio / sede de marcación autorizada a un trabajador
 */
const assignEmployeeBranch = async (req, res) => {
  try {
    const { id } = req.params;
    const { branch_id } = req.body;

    if (!branch_id) {
      return errorResponse(res, 'ID de sede requerido.', null, 400);
    }

    await db.query('UPDATE employees SET branch_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [Number(branch_id), id]);

    return successResponse(res, 'Sitio de marcación asignado al colaborador con éxito.');
  } catch (error) {
    return errorResponse(res, 'Error al asignar sede.', error.message);
  }
};

/**
 * Eliminar definitivamente a un colaborador y sus registros dependientes
 */
const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const existingRes = await db.query('SELECT * FROM employees WHERE id = $1', [id]);
    const existing = existingRes.rows[0];
    if (!existing) {
      return errorResponse(res, 'Empleado no encontrado.', null, 404);
    }

    await db.transaction(async (client) => {
      await client.query('DELETE FROM badges WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM attendance_logs WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM attendances WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM justifications WHERE employee_id = $1', [id]);
      await client.query('DELETE FROM documentos_firma WHERE trabajador_id = $1', [id]);
      await client.query('DELETE FROM employees WHERE id = $1', [id]);
    });

    return successResponse(res, `Colaborador ${existing.first_name} ${existing.last_name} eliminado permanentemente.`);
  } catch (error) {
    return errorResponse(res, 'Error al eliminar colaborador.', error.message);
  }
};

module.exports = {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getCatalogs,
  getBranches,
  updateBranchGeofence,
  assignEmployeeBranch
};
