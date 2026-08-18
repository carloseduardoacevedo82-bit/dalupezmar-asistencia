const db = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { calculateTardiness, calculateWorkedMinutes, calculateOvertime, calculateDistanceMeters } = require('../utils/timeCalculations');

/**
 * Registro inteligente de marcación de asistencia (Kiosco QR, Lector de Barras o Web Remota)
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

    // Extraer identificadores posibles del token escaneado
    // Soporta: QR frontal completo (AGY_SEC_QR_DAL-1002_77699820), DNI (77699820), Código (DAL-1002), o URL
    let extractedDni = raw;
    let extractedCode = raw;

    if (raw.includes('AGY_SEC_QR_')) {
      const parts = raw.replace('AGY_SEC_QR_', '').split('_');
      if (parts.length >= 2) {
        extractedCode = parts[0];
        extractedDni = parts[1];
      } else if (parts.length === 1) {
        extractedDni = parts[0];
      }
    } else if (raw.includes('?id=')) {
      const idMatch = raw.match(/id=([0-9]+)/);
      if (idMatch) extractedCode = idMatch[1];
    } else {
      // Buscar si contiene secuencia de 8 o 9 dígitos (DNI/CEX)
      const numMatch = raw.match(/[0-9]{8,9}/);
      if (numMatch) {
        extractedDni = numMatch[0];
      }
    }

    // 1. Identificar al empleado y su turno activo
    const empQuery = `
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
      LEFT JOIN badges bg ON e.id = bg.employee_id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE (
        bg.qr_token_hash = ? 
        OR bg.barcode_value = ? 
        OR bg.badge_code = ? 
        OR e.document_number = ? 
        OR e.document_number = ?
        OR e.employee_code = ? 
        OR e.employee_code = ?
        OR e.id = ?
        OR ? LIKE '%' || e.document_number || '%'
      )
      ORDER BY e.status ASC, bg.id DESC LIMIT 1
    `;

    const emp = db.prepare(empQuery).get(
      raw, raw, raw, raw, extractedDni, raw, extractedCode, Number(extractedCode) || 0, raw
    );

    if (!emp) {
      return errorResponse(res, `Código no reconocido (${raw}). No se encontró trabajador asociado.`, null, 404);
    }

    if (emp.employee_status !== 'ACTIVE') {
      return errorResponse(res, `Trabajador en estado ${emp.employee_status} (Cesado/Baja). Marcación denegada.`, null, 403);
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

    // 3. Obtener o inicializar la jornada consolidada de hoy
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const nowIso = now.toISOString();

    let attendance = db.prepare('SELECT * FROM attendances WHERE employee_id = ? AND attendance_date = ?').get(emp.employee_id, todayStr);

    const defaultShiftExit = emp.shift_exit_time || '19:00:00';
    const defaultShiftEntry = emp.shift_entry_time || '07:00:00';

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
        emp.shift_id,
        defaultShiftEntry,
        defaultShiftExit
      );

      attendance = db.prepare('SELECT * FROM attendances WHERE id = ?').get(resultAtt.lastInsertRowid);
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

    // 5. Insertar log individual de marcación con GPS
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
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
      device_info || null,
      ip,
      raw
    );

    // 6. Actualizar la jornada diaria y calcular tardanzas / horas trabajadas hasta las 19:00
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
      // Calcular tardanza según tolerancia del turno
      tardinessMinutes = calculateTardiness(now, defaultShiftEntry, emp.shift_tolerance || 15);
      updatedStatus = tardinessMinutes > 0 ? 'LATE' : 'PRESENT';
      
      // Cálculo proyectado de jornada operativa de 07:00 a 19:00 (11 horas efectivas descontando 1h refrigerio)
      workedMinutes = 660; // 11 horas estándar hasta las 19:00
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

    // Formatear mensaje descriptivo
    const typeNames = {
      ENTRY: 'Entrada Registrada',
      LUNCH_START: 'Inicio de Refrigerio',
      LUNCH_END: 'Fin de Refrigerio',
      EXIT: 'Salida Registrada'
    };

    let msg = `¡${typeNames[resolvedType] || resolvedType} confirmada!`;
    if (resolvedType === 'ENTRY' && tardinessMinutes > 0) {
      msg += ` (Tardanza: ${tardinessMinutes} min)`;
    }

    return successResponse(res, msg, {
      employee: {
        id: emp.employee_id,
        code: emp.employee_code,
        name: `${emp.first_name} ${emp.last_name}`,
        department: emp.department_name,
        position: emp.position_name,
        photo_url: emp.photo_url,
        work_mode: emp.work_mode
      },
      punch: {
        type: resolvedType,
        time: nowIso,
        source: punch_source,
        tardiness_minutes: tardinessMinutes,
        is_within_geofence: isWithinGeofence === 1,
        distance_meters: distanceToBranch,
        latitude: latitude || null,
        longitude: longitude || null
      }
    });
  } catch (error) {
    console.error('Error en marcación de asistencia:', error);
    return errorResponse(res, 'Error al procesar la marcación de asistencia.', error.message);
  }
};

/**
 * Modificar horario y estado de una marcación/asistencia
 */
const updateAttendanceRecord = (req, res) => {
  try {
    const { id } = req.params;
    const { first_entry_time, lunch_start_time, lunch_end_time, last_exit_time, status, total_minutes_worked } = req.body;

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

    return successResponse(res, 'Registro de asistencia actualizado exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar asistencia.', error.message);
  }
};

/**
 * Eliminar una marcación/asistencia errónea
 */
const deleteAttendanceRecord = (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM attendances WHERE id = ?').get(id);
    if (!existing) {
      return errorResponse(res, 'Registro de asistencia no encontrado.', null, 404);
    }

    db.prepare('DELETE FROM attendance_logs WHERE attendance_id = ?').run(id);
    db.prepare('DELETE FROM attendances WHERE id = ?').run(id);

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

      return successResponse(res, 'Asistencia manual actualizada para el colaborador.', { id: existing.id });
    } else {
      const resIns = db.prepare(`
        INSERT INTO attendances (
          employee_id, attendance_date, shift_id, status,
          expected_entry, expected_exit, first_entry_time, last_exit_time, total_minutes_worked, is_complete
        ) VALUES (?, ?, ?, ?, '07:00:00', '19:00:00', ?, ?, ?, 1)
      `).run(employee_id, attendance_date, emp.shift_id || 4, status, first_entry_time, last_exit_time, calculatedWorked);

      return successResponse(res, 'Asistencia manual registrada exitosamente.', { id: resIns.lastInsertRowid }, 201);
    }
  } catch (error) {
    return errorResponse(res, 'Error al crear asistencia manual.', error.message);
  }
};

/**
 * Obtener las marcaciones en vivo del día actual (para Kiosco y Dashboard)
 */
const getTodayLogs = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

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
      WHERE DATE(l.punch_time) = ?
      ORDER BY l.punch_time DESC
      LIMIT 100
    `).all(today);

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
    `).run(status, req.user.id, reviewer_comment || null, id);

    // Si fue aprobada y tenía una asistencia ligada, actualizar el estado de la asistencia a 'JUSTIFIED'
    if (status === 'APPROVED' && justif.attendance_id) {
      db.prepare("UPDATE attendances SET status = 'JUSTIFIED' WHERE id = ?").run(justif.attendance_id);
    }

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
