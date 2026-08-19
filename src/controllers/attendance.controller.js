const db = require('../../database/database');
const { forceCheckpoint } = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const {
  getPeruDateString,
  getPeruTimeString,
  getPeruDateTimeString,
  calculateTardiness,
  calculateWorkedMinutes,
  calculateOvertime,
  calculateDistanceMeters
} = require('../utils/timeCalculations');

/**
 * Función auxiliar para registrar acciones en la tabla audit_logs
 */
function recordAuditLog(userId, action, entityType, entityId, details, ipAddress) {
  try {
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId || null,
      action,
      entityType,
      String(entityId || ''),
      typeof details === 'object' ? JSON.stringify(details) : String(details || ''),
      ipAddress || '127.0.0.1'
    );
  } catch (err) {
    console.warn('Advertencia al registrar auditoría:', err.message);
  }
}

/**
 * Buscador universal y ultra-flexible de colaboradores para cualquier tipo de token:
 * Soporta: QR delantero con hash, QR trasero con DNI, Código de barras Code128, DNI numérico, Código DAL-XXXX, URLs o JSON
 */
function findEmployeeByAnyToken(rawToken) {
  if (!rawToken) return null;
  const clean = String(rawToken).trim();

  const baseSelect = `
    SELECT 
      e.id as employee_id,
      e.employee_code,
      e.first_name,
      e.last_name,
      e.document_number,
      e.photo_url,
      e.status as employee_status,
      e.work_mode,
      e.branch_id,
      e.shift_id,
      d.name as department_name,
      p.name as position_name,
      b.name as branch_name,
      b.latitude as branch_lat,
      b.longitude as branch_lng,
      b.radius_meters as branch_radius,
      s.name as shift_name,
      s.entry_time as shift_entry_time,
      s.exit_time as shift_exit_time,
      s.lunch_start as shift_lunch_start,
      s.lunch_end as shift_lunch_end,
      s.tolerance_minutes as shift_tolerance,
      s.lunch_duration_minutes
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN positions p ON e.position_id = p.id
    LEFT JOIN branches b ON e.branch_id = b.id
    LEFT JOIN shifts s ON e.shift_id = s.id
  `;

  // 1. Búsqueda directa por DNI o Código de Empleado
  let emp = db.prepare(`${baseSelect} WHERE e.document_number = ? OR e.employee_code = ? OR e.id = ?`).get(clean, clean, Number(clean) || 0);
  if (emp) return emp;

  // 2. Búsqueda por token QR registrado en tabla badges o código de barras
  const badge = db.prepare('SELECT employee_id FROM badges WHERE qr_token_hash = ? OR barcode_value = ? OR badge_code = ? ORDER BY id DESC LIMIT 1').get(clean, clean, clean);
  if (badge) {
    emp = db.prepare(`${baseSelect} WHERE e.id = ?`).get(badge.employee_id);
    if (emp) return emp;
  }

  // 3. Token con prefijo oficial AGY_SEC_QR_DAL-XXXX_DNI
  if (clean.includes('AGY_SEC_QR_')) {
    const cleanSub = clean.replace('AGY_SEC_QR_', '');
    const parts = cleanSub.split('_');
    for (const p of parts) {
      if (p) {
        emp = db.prepare(`${baseSelect} WHERE e.document_number = ? OR e.employee_code = ?`).get(p, p);
        if (emp) return emp;
      }
    }
  }

  // 4. Búsqueda si contiene secuencia de 8 a 9 dígitos (DNI / Carnet) en cualquier parte del texto
  const docMatches = clean.match(/\d{8,9}/g);
  if (docMatches) {
    for (const doc of docMatches) {
      emp = db.prepare(`${baseSelect} WHERE e.document_number = ?`).get(doc);
      if (emp) return emp;
    }
  }

  // 5. Búsqueda por código de formato DAL-XXXX o DALXXXX o EMP-XXXX
  const codeMatch = clean.match(/(DAL|EMP)[-_]?\d{3,5}/i);
  if (codeMatch) {
    const rawCode = codeMatch[0].toUpperCase();
    const formatted = rawCode.includes('-') ? rawCode : rawCode.replace(/(DAL|EMP)/, '$1-');
    emp = db.prepare(`${baseSelect} WHERE UPPER(e.employee_code) = ? OR UPPER(e.employee_code) = ?`).get(rawCode, formatted);
    if (emp) return emp;
  }

  // 6. Búsqueda si contiene parámetro URL (?id= o ?dni=)
  const urlIdMatch = clean.match(/[?&](?:id|dni|code)=([^&]+)/i);
  if (urlIdMatch && urlIdMatch[1]) {
    const val = decodeURIComponent(urlIdMatch[1]).trim();
    emp = db.prepare(`${baseSelect} WHERE e.document_number = ? OR e.employee_code = ?`).get(val, val);
    if (emp) return emp;
  }

  return null;
}

/**
 * Registro inteligente de marcación de asistencia (Kiosco QR, Lector de Barras o Web Remota)
 * Persistencia atómica blindada con auditoría y zona horaria de Perú (America/Lima)
 */
const punch = (req, res) => {
  try {
    const {
      token,
      punch_type, // 'ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT' o 'AUTO'
      punch_source = 'KIOSK_QR',
      latitude,
      longitude,
      device_info,
      notes
    } = req.body;

    if (!token) {
      return errorResponse(res, 'Token, código QR o documento requerido para marcar asistencia.', null, 400);
    }

    const raw = String(token).trim();

    // 1. Identificar al colaborador con el buscador universal
    const emp = findEmployeeByAnyToken(raw);

    if (!emp) {
      return errorResponse(res, `Código o QR no reconocido (${raw}). No se encontró trabajador asociado en el sistema.`, null, 404);
    }

    if (emp.employee_status !== 'ACTIVE') {
      recordAuditLog(
        1,
        'PUNCH_BLOCKED_INACTIVE_WORKER',
        'employees',
        emp.employee_id,
        `Intento de marcación bloqueado para trabajador inactivo/de baja: ${emp.first_name} ${emp.last_name} (${emp.employee_code} - DNI: ${emp.document_number})`,
        req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1'
      );

      return errorResponse(res, `⛔ TRABAJADOR INACTIVO O DE BAJA (${emp.first_name} ${emp.last_name} - ${emp.employee_code}). Marcación de asistencia denegada. No se registra en el aplicativo.`, {
        is_inactive: true,
        employee: {
          id: emp.employee_id,
          code: emp.employee_code,
          name: `${emp.first_name} ${emp.last_name}`,
          status: emp.employee_status,
          photo_url: emp.photo_url,
          position: emp.position_name,
          department: emp.department_name
        }
      }, 403);
    }

    // 2. Validación de Geocerca GPS (si aplica para marcación remota/móvil)
    let isWithinGeofence = 1;
    let distanceToBranch = null;

    if (latitude && longitude && emp.branch_lat && emp.branch_lng && emp.work_mode !== 'REMOTE') {
      distanceToBranch = calculateDistanceMeters(
        Number(latitude),
        Number(longitude),
        Number(emp.branch_lat),
        Number(emp.branch_lng)
      );
      if (distanceToBranch > (emp.branch_radius || 500)) {
        isWithinGeofence = 0;
      }
    }

    // 3. Obtener o inicializar la jornada consolidada con hora exacta de Perú (America/Lima)
    const now = new Date();
    const todayStr = getPeruDateString(now);
    const nowIso = getPeruDateTimeString(now);
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    let attendance = db.prepare('SELECT * FROM attendances WHERE employee_id = ? AND attendance_date = ?').get(emp.employee_id, todayStr);

    const defaultShiftExit = emp.shift_exit_time || '19:00:00';
    const defaultShiftEntry = emp.shift_entry_time || '07:00:00';

    if (!attendance) {
      // Si el punch solicitado es salida y no hay registro hoy, verificar si hay jornada abierta de ayer
      if (punch_type === 'EXIT' || punch_type === 'LUNCH_END') {
        const yesterdayAttendance = db.prepare(`
          SELECT * FROM attendances 
          WHERE employee_id = ? AND last_exit_time IS NULL AND attendance_date >= date(?, '-1 day')
          ORDER BY attendance_date DESC LIMIT 1
        `).get(emp.employee_id, todayStr);

        if (yesterdayAttendance) {
          attendance = yesterdayAttendance;
        }
      }

      if (!attendance) {
        // Crear registro diario inicial
        const insertAtt = db.prepare(`
          INSERT INTO attendances (
            employee_id, attendance_date, shift_id, status,
            expected_entry, expected_exit
          ) VALUES (?, ?, ?, 'PRESENT', ?, ?)
        `);

        const resultAtt = insertAtt.run(
          emp.employee_id,
          todayStr,
          emp.shift_id || 4,
          defaultShiftEntry,
          defaultShiftExit
        );

        attendance = db.prepare('SELECT * FROM attendances WHERE id = ?').get(resultAtt.lastInsertRowid);
      }
    }

    // 4. Determinar tipo de marcación inteligente
    let resolvedType = punch_type;

    if (!resolvedType || resolvedType === 'AUTO') {
      if (!attendance.first_entry_time) {
        resolvedType = 'ENTRY';
      } else if (!attendance.lunch_start_time) {
        resolvedType = 'LUNCH_START';
      } else if (!attendance.lunch_end_time) {
        resolvedType = 'LUNCH_END';
      } else {
        resolvedType = 'EXIT';
      }
    }

    // 5. Procesar foto selfie de verificación si fue enviada
    let selfieUrl = null;
    if (req.body.photo_selfie && req.body.photo_selfie.startsWith('data:image')) {
      try {
        const base64Data = req.body.photo_selfie.replace(/^data:image\/\w+;base64,/, '');
        const filename = `selfie-${Date.now()}-${emp.employee_id}.jpg`;
        const fs = require('fs');
        const path = require('path');
        const savePath = path.join(__dirname, '../../public/uploads/photos', filename);
        fs.writeFileSync(savePath, Buffer.from(base64Data, 'base64'));
        selfieUrl = `/uploads/photos/${filename}`;
      } catch (err) {
        console.warn('Error al guardar foto selfie:', err.message);
      }
    }

    // 6. Insertar log individual de marcación con GPS
    const insertLog = db.prepare(`
      INSERT INTO attendance_logs (
        attendance_id, employee_id, punch_type, punch_time, punch_source,
        latitude, longitude, is_within_geofence, device_info, ip_address, raw_token, verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'VERIFIED')
    `);

    insertLog.run(
      attendance.id,
      emp.employee_id,
      resolvedType,
      nowIso,
      punch_source,
      latitude || null,
      longitude || null,
      isWithinGeofence,
      selfieUrl ? `${device_info || 'Móvil'} | Selfie: ${selfieUrl}` : (device_info || null),
      ip,
      raw
    );

    // 7. Actualizar la jornada diaria y calcular tardanzas / horas trabajadas
    let updatedStatus = attendance.status;
    let tardinessMinutes = attendance.total_minutes_late || 0;
    let workedMinutes = attendance.total_minutes_worked || 0;
    let overtimeMinutes = attendance.total_minutes_overtime || 0;
    let firstEntry = attendance.first_entry_time;
    let lunchStart = attendance.lunch_start_time;
    let lunchEnd = attendance.lunch_end_time;
    let lastExit = attendance.last_exit_time;
    let isComplete = attendance.is_complete;

    if (resolvedType === 'ENTRY') {
      firstEntry = nowIso;
      // Calcular tardanza según tolerancia del turno en hora local de Perú
      tardinessMinutes = calculateTardiness(now, defaultShiftEntry, emp.shift_tolerance || 15);
      updatedStatus = tardinessMinutes > 0 ? 'LATE' : 'PRESENT';
      
      // Cálculo proyectado de jornada operativa de 07:00 a 19:00 (11 horas estándar)
      workedMinutes = 660;
    } else if (resolvedType === 'LUNCH_START') {
      lunchStart = nowIso;
    } else if (resolvedType === 'LUNCH_END') {
      lunchEnd = nowIso;
    } else if (resolvedType === 'EXIT') {
      lastExit = nowIso;
      if (firstEntry) {
        workedMinutes = calculateWorkedMinutes(firstEntry, nowIso, emp.lunch_duration_minutes || 60);
        overtimeMinutes = calculateOvertime(now, defaultShiftExit);
        isComplete = 1;
      }
    }

    db.prepare(`
      UPDATE attendances SET
        status = ?,
        first_entry_time = ?,
        lunch_start_time = ?,
        lunch_end_time = ?,
        last_exit_time = ?,
        total_minutes_worked = ?,
        total_minutes_late = ?,
        total_minutes_overtime = ?,
        is_complete = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      updatedStatus,
      firstEntry,
      lunchStart,
      lunchEnd,
      lastExit,
      workedMinutes,
      tardinessMinutes,
      overtimeMinutes,
      isComplete,
      attendance.id
    );

    // 8. Registro en Auditoría para protección histórica permanente
    recordAuditLog(
      null,
      `PUNCH_${resolvedType}`,
      'attendances',
      attendance.id,
      {
        employee_id: emp.employee_id,
        code: emp.employee_code,
        doc: emp.document_number,
        punch_type: resolvedType,
        source: punch_source,
        tardiness_minutes: tardinessMinutes,
        worked_minutes: workedMinutes,
        time: nowIso
      },
      ip
    );

    // 9. Forzar asentamiento en disco físico
    forceCheckpoint('PASSIVE');

    // 10. Mensaje personalizado de respuesta
    const punchNames = {
      ENTRY: 'Entrada Registrada',
      LUNCH_START: 'Inicio de Refrigerio',
      LUNCH_END: 'Fin de Refrigerio',
      EXIT: 'Salida Registrada'
    };

    let msg = `¡${punchNames[resolvedType] || 'Marcación'} confirmada!`;
    if (resolvedType === 'ENTRY' && tardinessMinutes > 0) {
      msg += ` (Tardanza: ${tardinessMinutes} min)`;
    } else if (resolvedType === 'ENTRY') {
      msg += ' (Puntual)';
    }

    if (isWithinGeofence === 0 && distanceToBranch) {
      msg += ` ⚠️ Fuera de sede asignada (${distanceToBranch}m de distancia).`;
    }

    return successResponse(res, msg, {
      employee: {
        id: emp.employee_id,
        code: emp.employee_code,
        name: `${emp.first_name} ${emp.last_name}`,
        department: emp.department_name,
        position: emp.position_name,
        photo_url: emp.photo_url,
        work_mode: emp.work_mode,
        branch_name: emp.branch_name || 'Planta PECEPE S.A.C.'
      },
      punch: {
        type: resolvedType,
        time: nowIso,
        source: punch_source,
        tardiness_minutes: tardinessMinutes,
        is_within_geofence: isWithinGeofence === 1,
        distance_meters: distanceToBranch,
        latitude,
        longitude,
        selfie_url: selfieUrl
      }
    });
  } catch (error) {
    console.error('Error en marcación de asistencia:', error);
    return errorResponse(res, 'Error al procesar la marcación de asistencia.', error.message);
  }
};

/**
 * Modificar horario y estado de una marcación/asistencia con auditoría
 */
const updateAttendanceRecord = (req, res) => {
  try {
    const { id } = req.params;
    const { first_entry_time, lunch_start_time, lunch_end_time, last_exit_time, status, total_minutes_worked } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    const existing = db.prepare('SELECT * FROM attendances WHERE id = ?').get(id);
    if (!existing) {
      return errorResponse(res, 'Registro de asistencia no encontrado.', null, 404);
    }

    let calculatedWorked = total_minutes_worked;
    if (calculatedWorked === undefined || calculatedWorked === null) {
      if (first_entry_time && last_exit_time) {
        calculatedWorked = calculateWorkedMinutes(first_entry_time, last_exit_time, 60);
      } else if (first_entry_time) {
        calculatedWorked = 660; // 11 horas estándar hasta las 19:00
      } else {
        calculatedWorked = 0;
      }
    }

    db.prepare(`
      UPDATE attendances SET
        first_entry_time = ?,
        lunch_start_time = ?,
        lunch_end_time = ?,
        last_exit_time = ?,
        status = ?,
        total_minutes_worked = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      first_entry_time || existing.first_entry_time,
      lunch_start_time || existing.lunch_start_time,
      lunch_end_time || existing.lunch_end_time,
      last_exit_time || existing.last_exit_time,
      status || existing.status,
      calculatedWorked,
      id
    );

    recordAuditLog(
      req.user?.id || 1,
      'ATTENDANCE_UPDATE',
      'attendances',
      id,
      { before: existing, after: req.body },
      ip
    );

    forceCheckpoint('PASSIVE');

    return successResponse(res, 'Registro de asistencia actualizado exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar asistencia.', error.message);
  }
};

/**
 * Eliminar una marcación/asistencia errónea con auditoría
 */
const deleteAttendanceRecord = (req, res) => {
  try {
    const { id } = req.params;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    const existing = db.prepare('SELECT * FROM attendances WHERE id = ?').get(id);
    if (!existing) {
      return errorResponse(res, 'Registro de asistencia no encontrado.', null, 404);
    }

    db.prepare('DELETE FROM attendance_logs WHERE attendance_id = ?').run(id);
    db.prepare('DELETE FROM attendances WHERE id = ?').run(id);

    recordAuditLog(
      req.user?.id || 1,
      'ATTENDANCE_DELETE',
      'attendances',
      id,
      { deleted_record: existing },
      ip
    );

    forceCheckpoint('PASSIVE');

    return successResponse(res, 'Marcación eliminada exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al eliminar marcación.', error.message);
  }
};

/**
 * Registrar asistencia manual para un trabajador (Supervisor / Administrador)
 */
const createManualAttendance = (req, res) => {
  try {
    const { employee_id, attendance_date, first_entry_time, last_exit_time, status = 'PRESENT' } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    if (!employee_id || !attendance_date) {
      return errorResponse(res, 'ID de empleado y fecha requeridos.', null, 400);
    }

    const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employee_id);
    if (!emp) {
      return errorResponse(res, 'Trabajador no encontrado.', null, 404);
    }

    let calculatedWorked = 660; // 11 horas hasta las 19:00
    if (first_entry_time && last_exit_time) {
      calculatedWorked = calculateWorkedMinutes(first_entry_time, last_exit_time, 60);
    }

    const existing = db.prepare('SELECT id FROM attendances WHERE employee_id = ? AND attendance_date = ?').get(employee_id, attendance_date);

    let attId;
    if (existing) {
      db.prepare(`
        UPDATE attendances SET
          first_entry_time = ?,
          last_exit_time = ?,
          status = ?,
          total_minutes_worked = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(first_entry_time, last_exit_time, status, calculatedWorked, existing.id);

      attId = existing.id;
    } else {
      const resIns = db.prepare(`
        INSERT INTO attendances (
          employee_id, attendance_date, shift_id, status,
          expected_entry, expected_exit, first_entry_time, last_exit_time, total_minutes_worked, is_complete
        ) VALUES (?, ?, ?, ?, '07:00:00', '19:00:00', ?, ?, ?, 1)
      `).run(employee_id, attendance_date, emp.shift_id || 4, status, first_entry_time, last_exit_time, calculatedWorked);

      attId = resIns.lastInsertRowid;
    }

    recordAuditLog(
      req.user?.id || 1,
      'MANUAL_ATTENDANCE_SAVE',
      'attendances',
      attId,
      { employee_id, attendance_date, first_entry_time, last_exit_time, status },
      ip
    );

    forceCheckpoint('PASSIVE');

    return successResponse(res, 'Asistencia manual registrada exitosamente.', { id: attId }, 201);
  } catch (error) {
    return errorResponse(res, 'Error al crear asistencia manual.', error.message);
  }
};

/**
 * Obtener las marcaciones en vivo del día actual (para Kiosco y Dashboard)
 */
const getTodayLogs = (req, res) => {
  try {
    const today = getPeruDateString(new Date());

    const logs = db.prepare(`
      SELECT 
        l.id,
        l.punch_type,
        l.punch_time,
        l.punch_source,
        l.is_within_geofence,
        e.id as employee_id,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.photo_url,
        d.name as department_name,
        p.name as position_name,
        b.name as branch_name
      FROM attendance_logs l
      INNER JOIN employees e ON l.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN branches b ON e.branch_id = b.id
      WHERE substr(l.punch_time, 1, 10) = ? OR DATE(l.punch_time) = ?
      ORDER BY l.punch_time DESC
      LIMIT 100
    `).all(today, today);

    return successResponse(res, 'Marcaciones de hoy recuperadas.', logs);
  } catch (error) {
    return errorResponse(res, 'Error al consultar marcaciones del día.', error.message);
  }
};

/**
 * Reporte de asistencia con filtros por rango de fechas, trabajador, departamento y estado
 */
const getAttendanceReport = (req, res) => {
  try {
    const { start_date, end_date, employee_id, department_id, status } = req.query;

    let query = `
      SELECT 
        a.*,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.document_number,
        e.photo_url,
        e.work_mode,
        d.name as department_name,
        p.name as position_name,
        b.name as branch_name,
        s.name as shift_name
      FROM attendances a
      INNER JOIN employees e ON a.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN shifts s ON a.shift_id = s.id
      WHERE 1=1
    `;

    const params = [];

    if (start_date) {
      query += ` AND a.attendance_date >= ?`;
      params.push(start_date);
    }

    if (end_date) {
      query += ` AND a.attendance_date <= ?`;
      params.push(end_date);
    }

    if (employee_id) {
      query += ` AND a.employee_id = ?`;
      params.push(employee_id);
    }

    if (department_id) {
      query += ` AND e.department_id = ?`;
      params.push(department_id);
    }

    if (status) {
      query += ` AND a.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY a.attendance_date DESC, e.last_name ASC`;

    const records = db.prepare(query).all(...params);

    return successResponse(res, 'Reporte de asistencia generado.', records);
  } catch (error) {
    return errorResponse(res, 'Error al generar reporte de asistencia.', error.message);
  }
};

/**
 * Justificaciones y Regularizaciones (Solicitar / Listar / Aprobar / Rechazar)
 */
const getJustifications = (req, res) => {
  try {
    const { status } = req.query;
    let query = `
      SELECT 
        j.*,
        e.employee_code,
        e.first_name,
        e.last_name,
        d.name as department_name,
        u.full_name as reviewer_name
      FROM justifications j
      INNER JOIN employees e ON j.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN users u ON j.reviewed_by = u.id
      WHERE 1=1
    `;
    const params = [];
    if (status) {
      query += ` AND j.status = ?`;
      params.push(status);
    }
    query += ` ORDER BY j.id DESC`;

    const list = db.prepare(query).all(...params);
    return successResponse(res, 'Lista de justificaciones.', list);
  } catch (error) {
    return errorResponse(res, 'Error al obtener justificaciones.', error.message);
  }
};

const createJustification = (req, res) => {
  try {
    const { employee_id, attendance_id, reason_type, start_date, end_date, description } = req.body;

    if (!employee_id || !reason_type || !start_date || !end_date || !description) {
      return errorResponse(res, 'Campos obligatorios incompletos.', null, 400);
    }

    const docUrl = req.file ? `/uploads/photos/${req.file.filename}` : null;

    const result = db.prepare(`
      INSERT INTO justifications (
        employee_id, attendance_id, reason_type, start_date, end_date,
        description, document_url, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING')
    `).run(employee_id, attendance_id || null, reason_type, start_date, end_date, description.trim(), docUrl);

    forceCheckpoint('PASSIVE');

    return successResponse(res, 'Solicitud de justificación enviada.', { id: result.lastInsertRowid }, 201);
  } catch (error) {
    return errorResponse(res, 'Error al registrar justificación.', error.message);
  }
};

const reviewJustification = (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewer_comment } = req.body; // 'APPROVED' o 'REJECTED'

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return errorResponse(res, 'Estado no válido. Debe ser APPROVED o REJECTED.', null, 400);
    }

    const justif = db.prepare('SELECT * FROM justifications WHERE id = ?').get(id);
    if (!justif) {
      return errorResponse(res, 'Justificación no encontrada.', null, 404);
    }

    db.prepare(`
      UPDATE justifications SET
        status = ?,
        reviewed_by = ?,
        reviewed_at = CURRENT_TIMESTAMP,
        reviewer_comment = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, req.user?.id || 1, reviewer_comment || null, id);

    // Si fue aprobada y tenía una asistencia ligada, actualizar el estado de la asistencia a 'JUSTIFIED'
    if (status === 'APPROVED' && justif.attendance_id) {
      db.prepare("UPDATE attendances SET status = 'JUSTIFIED' WHERE id = ?").run(justif.attendance_id);
    }

    forceCheckpoint('PASSIVE');

    return successResponse(res, `Justificación ${status === 'APPROVED' ? 'aprobada' : 'rechazada'} exitosamente.`);
  } catch (error) {
    return errorResponse(res, 'Error al revisar justificación.', error.message);
  }
};

module.exports = {
  punch,
  getTodayLogs,
  getAttendanceReport,
  updateAttendanceRecord,
  deleteAttendanceRecord,
  createManualAttendance,
  getJustifications,
  createJustification,
  reviewJustification
};

