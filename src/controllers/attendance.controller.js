const db = require('../../database/database');
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
async function recordAuditLog(userId, action, entityType, entityId, details, ipAddress) {
  try {
    await db.query(`
      INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      userId || null,
      action,
      entityType,
      String(entityId || ''),
      typeof details === 'object' ? JSON.stringify(details) : String(details || ''),
      ipAddress || '127.0.0.1'
    ]);
  } catch (err) {
    console.warn('Advertencia al registrar auditoría:', err.message);
  }
}

/**
 * Buscador universal y ultra-flexible de colaboradores para cualquier tipo de token (Async PostgreSQL):
 * Soporta: QR delantero con hash, QR trasero con DNI, Código de barras Code128, DNI numérico, Código DAL-XXXX, URLs o JSON
 */
/**
 * Buscador universal y ultra-flexible de colaboradores para cualquier tipo de token (Async PostgreSQL):
 * Soporta: QR delantero con hash, QR trasero con DNI, Código de barras Code128, DNI numérico, Código DAL-XXXX, URLs, JSON o nombres
 */
async function findEmployeeByAnyToken(rawToken) {
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

  // 1. Búsqueda directa por DNI exacto, Código de Empleado exacto o ID numérico
  const numClean = isNaN(Number(clean)) ? 0 : Number(clean);
  let empRes = await db.query(
    `${baseSelect} WHERE e.document_number = $1 OR UPPER(e.employee_code) = UPPER($1) OR (e.id = $2 AND $2 > 0)`,
    [clean, numClean]
  );
  if (empRes.rows.length > 0) return empRes.rows[0];

  // 2. Búsqueda por token QR registrado en tabla badges o código de barras
  const badgeRes = await db.query(
    'SELECT employee_id FROM badges WHERE qr_token_hash = $1 OR barcode_value = $1 OR badge_code = $1 ORDER BY id DESC LIMIT 1',
    [clean]
  );
  if (badgeRes.rows.length > 0) {
    empRes = await db.query(`${baseSelect} WHERE e.id = $1`, [badgeRes.rows[0].employee_id]);
    if (empRes.rows.length > 0) return empRes.rows[0];
  }

  // 3. Token con prefijo oficial AGY_SEC_QR_DAL-XXXX_DNI
  if (clean.includes('AGY_SEC_QR_')) {
    const cleanSub = clean.replace('AGY_SEC_QR_', '');
    const parts = cleanSub.split('_');
    for (const p of parts) {
      if (p) {
        empRes = await db.query(`${baseSelect} WHERE e.document_number = $1 OR UPPER(e.employee_code) = UPPER($1)`, [p]);
        if (empRes.rows.length > 0) return empRes.rows[0];
      }
    }
  }

  // 4. Búsqueda si contiene secuencia de 8 a 9 dígitos (DNI / Carnet de Extranjería)
  const docMatches = clean.match(/\d{8,9}/g);
  if (docMatches) {
    for (const doc of docMatches) {
      empRes = await db.query(`${baseSelect} WHERE e.document_number = $1`, [doc]);
      if (empRes.rows.length > 0) return empRes.rows[0];
    }
  }

  // 5. Búsqueda si contiene parámetro URL (?id=, ?dni=, ?code=, ?emp=, ?worker=)
  const urlParamMatch = clean.match(/[?&](?:id|dni|code|emp|worker)=([^&#]+)/i);
  if (urlParamMatch && urlParamMatch[1]) {
    const val = decodeURIComponent(urlParamMatch[1]).trim();
    const valNum = isNaN(Number(val)) ? 0 : Number(val);
    empRes = await db.query(
      `${baseSelect} WHERE e.document_number = $1 OR UPPER(e.employee_code) = UPPER($1) OR (e.id = $2 AND $2 > 0)`,
      [val, valNum]
    );
    if (empRes.rows.length > 0) return empRes.rows[0];
  }

  // 6. Búsqueda por código de formato DAL-XXXX, DALXXXX, EMP-XXXX o EMPXXXX
  const codeMatch = clean.match(/(DAL|EMP)[-_]?\d{3,5}/i);
  if (codeMatch) {
    const rawCode = codeMatch[0].toUpperCase();
    const formatted = rawCode.includes('-') ? rawCode : rawCode.replace(/(DAL|EMP)/, '$1-');
    empRes = await db.query(
      `${baseSelect} WHERE UPPER(e.employee_code) = $1 OR UPPER(e.employee_code) = $2`,
      [rawCode, formatted]
    );
    if (empRes.rows.length > 0) return empRes.rows[0];
  }

  // 7. Búsqueda por objeto JSON escaneado (ej. {"dni":"61267077"} o {"id":85})
  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const parsed = JSON.parse(clean);
      const targetDoc = parsed.dni || parsed.document_number || parsed.documento;
      const targetCode = parsed.code || parsed.employee_code || parsed.codigo;
      const targetId = Number(parsed.id || parsed.employee_id || 0);

      if (targetDoc || targetCode || targetId) {
        empRes = await db.query(
          `${baseSelect} WHERE e.document_number = $1 OR UPPER(e.employee_code) = UPPER($2) OR (e.id = $3 AND $3 > 0)`,
          [String(targetDoc || ''), String(targetCode || ''), targetId]
        );
        if (empRes.rows.length > 0) return empRes.rows[0];
      }
    } catch (e) {}
  }

  // 8. Búsqueda por Nombres y Apellidos completos o parciales
  if (clean.length >= 5 && !clean.includes('http') && !clean.includes('{')) {
    const cleanUpper = clean.toUpperCase();
    empRes = await db.query(`
      ${baseSelect}
      WHERE UPPER(CONCAT(e.first_name, ' ', e.last_name)) LIKE $1
         OR UPPER(CONCAT(e.last_name, ' ', e.first_name)) LIKE $1
         OR UPPER(e.first_name) LIKE $1
         OR UPPER(e.last_name) LIKE $1
      ORDER BY e.id ASC LIMIT 1
    `, [`%${cleanUpper}%`]);
    if (empRes.rows.length > 0) return empRes.rows[0];
  }

  return null;
}

/**
 * Registro inteligente de marcación de asistencia (Kiosco QR, Lector de Barras o Web Remota)
 * Persistencia atómica directa en PostgreSQL con auditoría y zona horaria de Perú (America/Lima)
 */
const punch = async (req, res) => {
  try {
    const {
      token,
      punch_type,
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
    const emp = await findEmployeeByAnyToken(raw);

    if (!emp) {
      return errorResponse(res, `Código o QR no reconocido (${raw}). No se encontró trabajador asociado en el sistema.`, null, 404);
    }

    if (emp.employee_status !== 'ACTIVE') {
      await recordAuditLog(
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

    // 2. Validación Estricta de Geocerca GPS para Marcación Móvil / Web
    let isWithinGeofence = 1;
    let distanceToBranch = null;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    const hasGpsCoordinates = latitude !== undefined && latitude !== null && String(latitude).trim() !== '' &&
                              longitude !== undefined && longitude !== null && String(longitude).trim() !== '';

    // Si la marcación viene del portal web móvil y el colaborador tiene sede física con coordenadas
    if (punch_source === 'REMOTE_WEB' && emp.branch_lat && emp.branch_lng && Number(emp.branch_lat) !== 0) {
      if (!hasGpsCoordinates) {
        return errorResponse(res, `⛔ MARCACIÓN BLOQUEADA: No se detectaron coordenadas GPS satelitales.\n\nEs obligatorio encender la ubicación/GPS en tu celular y aceptar los permisos en el navegador para certificar tu presencia en la sede ${emp.branch_name || 'PECEPE S.A.C.'}.`, {
          error_code: 'NO_GPS',
          branch_name: emp.branch_name
        }, 400);
      }

      distanceToBranch = calculateDistanceMeters(
        Number(latitude),
        Number(longitude),
        Number(emp.branch_lat),
        Number(emp.branch_lng)
      );
      const allowedRadius = Number(emp.branch_radius) || 50;

      // SI ESTÁ FUERA DEL RADIO PERMITIDO, SE BLOQUEA / PROHÍBE LA MARCACIÓN TOTALMENTE
      if (distanceToBranch > allowedRadius) {
        await recordAuditLog(
          1,
          'PUNCH_BLOCKED_OUTSIDE_GEOFENCE',
          'attendances',
          emp.employee_id,
          `Marcación bloqueada fuera de geocerca: ${emp.first_name} ${emp.last_name} (${distanceToBranch}m de ${emp.branch_name}, radio permitido: ${allowedRadius}m)`,
          ip
        );

        return errorResponse(res, `⛔ MARCACIÓN DENEGADA POR GEOCERCA:\n\nTe encuentras fuera del área autorizada de tu sede (${emp.branch_name || 'PECEPE S.A.C.'}).\n\nEstás a ${distanceToBranch} metros de distancia (Radio permitido: ${allowedRadius} metros).\n\nDebes estar físicamente dentro de las instalaciones de la planta para poder registrar tu asistencia.`, {
          error_code: 'OUTSIDE_GEOFENCE',
          distance_meters: distanceToBranch,
          allowed_radius: allowedRadius,
          branch_name: emp.branch_name
        }, 403);
      }

      isWithinGeofence = 1;
    }

    // 3. Obtener o inicializar la jornada consolidada con hora exacta de Perú (America/Lima)
    const now = new Date();
    const todayStr = getPeruDateString(now);
    const nowIso = getPeruDateTimeString(now);

    const defaultShiftExit = emp.shift_exit_time || '19:00:00';
    const defaultShiftEntry = emp.shift_entry_time || '07:00:00';

    // 4. Procesar marcación dentro de una transacción atómica en PostgreSQL
    const punchResult = await db.transaction(async (client) => {
      let attRes = await client.query(
        'SELECT * FROM attendances WHERE employee_id = $1 AND attendance_date = $2',
        [emp.employee_id, todayStr]
      );
      let attendance = attRes.rows[0];

      if (!attendance) {
        // Si el punch solicitado es salida y no hay registro hoy, verificar si hay jornada abierta de ayer
        if (punch_type === 'EXIT' || punch_type === 'LUNCH_END') {
          const yesterdayAttRes = await client.query(`
            SELECT * FROM attendances 
            WHERE employee_id = $1 AND last_exit_time IS NULL AND attendance_date >= CURRENT_DATE - INTERVAL '1 day'
            ORDER BY attendance_date DESC LIMIT 1
          `, [emp.employee_id]);

          if (yesterdayAttRes.rows.length > 0) {
            attendance = yesterdayAttRes.rows[0];
          }
        }

        if (!attendance) {
          // Crear o asegurar registro diario inicial
          const insertAttRes = await client.query(`
            INSERT INTO attendances (
              employee_id, attendance_date, shift_id, status,
              expected_entry, expected_exit
            ) VALUES ($1, $2, $3, 'PRESENT', $4, $5)
            ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
              updated_at = CURRENT_TIMESTAMP
            RETURNING *;
          `, [emp.employee_id, todayStr, emp.shift_id || 1, defaultShiftEntry, defaultShiftExit]);

          attendance = insertAttRes.rows[0];
        }
      }

      // Determinar tipo de marcación inteligente
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

      // Procesar selfie si existe y persistir en disco y en PostgreSQL
      let selfieUrl = null;
      if (req.body.photo_selfie && req.body.photo_selfie.startsWith('data:image')) {
        try {
          const base64Data = req.body.photo_selfie.replace(/^data:image\/\w+;base64,/, '');
          const filename = `selfie-${Date.now()}-${emp.employee_id}.jpg`;
          const fs = require('fs');
          const path = require('path');
          const photosDir = path.join(__dirname, '../../public/uploads/photos');
          if (!fs.existsSync(photosDir)) {
            fs.mkdirSync(photosDir, { recursive: true });
          }
          const savePath = path.join(photosDir, filename);
          const buffer = Buffer.from(base64Data, 'base64');
          fs.writeFileSync(savePath, buffer);
          selfieUrl = `/uploads/photos/${filename}`;

          // Respaldo permanente en PostgreSQL para que no se borre en reinicios de Render
          try {
            await client.query(`
              INSERT INTO employee_photos (employee_id, filename, mime_type, photo_data)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (filename) DO UPDATE SET photo_data = EXCLUDED.photo_data;
            `, [emp.employee_id, filename, 'image/jpeg', buffer]);
          } catch (dbPhotoErr) {
            console.warn('⚠️ No se pudo guardar selfie en BD:', dbPhotoErr.message);
          }
        } catch (err) {
          console.warn('Error al guardar foto selfie:', err.message);
        }
      }

      // Insertar log individual de marcación
      await client.query(`
        INSERT INTO attendance_logs (
          attendance_id, employee_id, punch_type, punch_time, punch_source,
          latitude, longitude, is_within_geofence, device_info, ip_address, raw_token, verification_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'VERIFIED');
      `, [
        attendance.id,
        emp.employee_id,
        resolvedType,
        nowIso,
        punch_source,
        latitude ? Number(latitude) : null,
        longitude ? Number(longitude) : null,
        isWithinGeofence,
        selfieUrl ? `${device_info || 'Móvil'} | Selfie: ${selfieUrl}` : (device_info || null),
        ip,
        raw
      ]);

      // Actualizar la jornada consolidada
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
        tardinessMinutes = calculateTardiness(now, defaultShiftEntry, emp.shift_tolerance || 15);
        updatedStatus = tardinessMinutes > 0 ? 'LATE' : 'PRESENT';
        workedMinutes = 660; // 11 horas estándar
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

      await client.query(`
        UPDATE attendances SET
          status = $1,
          first_entry_time = $2,
          lunch_start_time = $3,
          lunch_end_time = $4,
          last_exit_time = $5,
          total_minutes_worked = $6,
          total_minutes_late = $7,
          total_minutes_overtime = $8,
          is_complete = $9,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $10;
      `, [
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
      ]);

      return {
        resolvedType,
        tardinessMinutes,
        workedMinutes,
        attendanceId: attendance.id,
        selfieUrl
      };
    });

    // Registro de auditoría
    await recordAuditLog(
      null,
      `PUNCH_${punchResult.resolvedType}`,
      'attendances',
      punchResult.attendanceId,
      {
        employee_id: emp.employee_id,
        code: emp.employee_code,
        doc: emp.document_number,
        punch_type: punchResult.resolvedType,
        source: punch_source,
        tardiness_minutes: punchResult.tardinessMinutes,
        worked_minutes: punchResult.workedMinutes,
        time: nowIso
      },
      ip
    );

    // Mensaje de respuesta amigable
    const punchNames = {
      ENTRY: 'Entrada Registrada',
      LUNCH_START: 'Inicio de Refrigerio',
      LUNCH_END: 'Fin de Refrigerio',
      EXIT: 'Salida Registrada'
    };

    let msg = `¡${punchNames[punchResult.resolvedType] || 'Marcación'} confirmada!`;
    if (punchResult.resolvedType === 'ENTRY' && punchResult.tardinessMinutes > 0) {
      msg += ` (Tardanza: ${punchResult.tardinessMinutes} min)`;
    } else if (punchResult.resolvedType === 'ENTRY') {
      msg += ' (Puntual)';
    }

    if (isWithinGeofence === 0 && distanceToBranch !== null) {
      msg += ` ⚠️ Fuera de sede asignada (${distanceToBranch}m de distancia).`;
    } else if (isWithinGeofence === 0 && !hasGpsCoordinates && punch_source === 'REMOTE_WEB') {
      msg += ' ⚠️ Marcación sin coordenadas GPS.';
    } else if (isWithinGeofence === 1 && distanceToBranch !== null) {
      msg += ` ✅ En sede asignada (${distanceToBranch}m).`;
    }

    return successResponse(res, msg, {
      employee: {
        id: emp.employee_id,
        code: emp.employee_code,
        document_number: emp.document_number,
        name: `${emp.first_name} ${emp.last_name}`,
        department: emp.department_name,
        position: emp.position_name,
        photo_url: emp.photo_url,
        work_mode: emp.work_mode,
        branch_name: emp.branch_name || 'DALUPEZMAR Planta Principal'
      },
      punch: {
        type: punchResult.resolvedType,
        time: nowIso,
        source: punch_source,
        tardiness_minutes: punchResult.tardinessMinutes,
        is_within_geofence: isWithinGeofence === 1,
        distance_meters: distanceToBranch,
        latitude,
        longitude,
        selfie_url: punchResult.selfieUrl
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
const updateAttendanceRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const { first_entry_time, lunch_start_time, lunch_end_time, last_exit_time, status, total_minutes_worked } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    const existingRes = await db.query('SELECT * FROM attendances WHERE id = $1', [id]);
    const existing = existingRes.rows[0];
    if (!existing) {
      return errorResponse(res, 'Registro de asistencia no encontrado.', null, 404);
    }

    let calculatedWorked = total_minutes_worked;
    if (calculatedWorked === undefined || calculatedWorked === null) {
      if (first_entry_time && last_exit_time) {
        calculatedWorked = calculateWorkedMinutes(first_entry_time, last_exit_time, 60);
      } else if (first_entry_time) {
        calculatedWorked = 660; // 11 horas estándar
      } else {
        calculatedWorked = 0;
      }
    }

    await db.query(`
      UPDATE attendances SET
        first_entry_time = $1,
        lunch_start_time = $2,
        lunch_end_time = $3,
        last_exit_time = $4,
        status = $5,
        total_minutes_worked = $6,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
    `, [
      first_entry_time || existing.first_entry_time,
      lunch_start_time || existing.lunch_start_time,
      lunch_end_time || existing.lunch_end_time,
      last_exit_time || existing.last_exit_time,
      status || existing.status,
      calculatedWorked,
      id
    ]);

    await recordAuditLog(
      req.user?.id || 1,
      'ATTENDANCE_UPDATE',
      'attendances',
      id,
      { before: existing, after: req.body },
      ip
    );

    return successResponse(res, 'Registro de asistencia actualizado exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar asistencia.', error.message);
  }
};

/**
 * Eliminar una marcación/asistencia errónea con auditoría
 */
const deleteAttendanceRecord = async (req, res) => {
  try {
    const { id } = req.params;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    const existingRes = await db.query('SELECT * FROM attendances WHERE id = $1', [id]);
    const existing = existingRes.rows[0];
    if (!existing) {
      return errorResponse(res, 'Registro de asistencia no encontrado.', null, 404);
    }

    await db.transaction(async (client) => {
      await client.query('DELETE FROM attendance_logs WHERE attendance_id = $1', [id]);
      await client.query('DELETE FROM attendances WHERE id = $1', [id]);
    });

    await recordAuditLog(
      req.user?.id || 1,
      'ATTENDANCE_DELETE',
      'attendances',
      id,
      { deleted_record: existing },
      ip
    );

    return successResponse(res, 'Marcación eliminada exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al eliminar marcación.', error.message);
  }
};

/**
 * Registrar asistencia manual para un trabajador (Supervisor / Administrador)
 */
const createManualAttendance = async (req, res) => {
  try {
    const { employee_id, attendance_date, first_entry_time, last_exit_time, status = 'PRESENT' } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';

    if (!employee_id || !attendance_date) {
      return errorResponse(res, 'ID de empleado y fecha requeridos.', null, 400);
    }

    const empRes = await db.query('SELECT * FROM employees WHERE id = $1', [employee_id]);
    const emp = empRes.rows[0];
    if (!emp) {
      return errorResponse(res, 'Trabajador no encontrado.', null, 404);
    }

    let calculatedWorked = 660; // 11 horas hasta las 19:00
    if (first_entry_time && last_exit_time) {
      calculatedWorked = calculateWorkedMinutes(first_entry_time, last_exit_time, 60);
    }

    const existingRes = await db.query(
      'SELECT id FROM attendances WHERE employee_id = $1 AND attendance_date = $2',
      [employee_id, attendance_date]
    );
    const existing = existingRes.rows[0];

    let attId;
    if (existing) {
      await db.query(`
        UPDATE attendances SET
          first_entry_time = $1,
          last_exit_time = $2,
          status = $3,
          total_minutes_worked = $4,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $5
      `, [first_entry_time, last_exit_time, status, calculatedWorked, existing.id]);

      attId = existing.id;
    } else {
      const resIns = await db.query(`
        INSERT INTO attendances (
          employee_id, attendance_date, shift_id, status,
          expected_entry, expected_exit, first_entry_time, last_exit_time, total_minutes_worked, is_complete
        ) VALUES ($1, $2, $3, $4, '07:00:00', '19:00:00', $5, $6, $7, 1)
        RETURNING id;
      `, [employee_id, attendance_date, emp.shift_id || 1, status, first_entry_time, last_exit_time, calculatedWorked]);

      attId = resIns.rows[0].id;
    }

    await recordAuditLog(
      req.user?.id || 1,
      'MANUAL_ATTENDANCE_SAVE',
      'attendances',
      attId,
      { employee_id, attendance_date, first_entry_time, last_exit_time, status },
      ip
    );

    return successResponse(res, 'Asistencia manual registrada exitosamente.', { id: attId }, 201);
  } catch (error) {
    return errorResponse(res, 'Error al crear asistencia manual.', error.message);
  }
};

/**
 * Obtener las marcaciones en vivo del día actual (para Kiosco y Dashboard)
 */
const getTodayLogs = async (req, res) => {
  try {
    const today = getPeruDateString(new Date());

    const logsRes = await db.query(`
      SELECT 
        l.id,
        l.punch_type,
        l.punch_time,
        l.punch_source,
        l.is_within_geofence,
        l.latitude,
        l.longitude,
        l.device_info,
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
      WHERE l.punch_time LIKE $1 || '%'
      ORDER BY l.punch_time DESC
      LIMIT 100
    `, [today]);

    return successResponse(res, 'Marcaciones de hoy recuperadas.', logsRes.rows);
  } catch (error) {
    return errorResponse(res, 'Error al consultar marcaciones del día.', error.message);
  }
};

/**
 * Reporte de asistencia con filtros por rango de fechas, trabajador, departamento y estado
 */
const getAttendanceReport = async (req, res) => {
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
    let pIdx = 1;

    if (start_date) {
      query += ` AND a.attendance_date >= $${pIdx}`;
      params.push(start_date);
      pIdx++;
    }

    if (end_date) {
      query += ` AND a.attendance_date <= $${pIdx}`;
      params.push(end_date);
      pIdx++;
    }

    if (employee_id) {
      query += ` AND a.employee_id = $${pIdx}`;
      params.push(Number(employee_id));
      pIdx++;
    }

    if (department_id) {
      query += ` AND e.department_id = $${pIdx}`;
      params.push(Number(department_id));
      pIdx++;
    }

    if (status) {
      query += ` AND a.status = $${pIdx}`;
      params.push(status);
      pIdx++;
    }

    query += ` ORDER BY a.attendance_date DESC, e.last_name ASC`;

    const recordsRes = await db.query(query, params);

    return successResponse(res, 'Reporte de asistencia generado.', recordsRes.rows);
  } catch (error) {
    return errorResponse(res, 'Error al generar reporte de asistencia.', error.message);
  }
};

/**
 * Justificaciones y Regularizaciones (Solicitar / Listar / Aprobar / Rechazar)
 */
const getJustifications = async (req, res) => {
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
      query += ` AND j.status = $1`;
      params.push(status);
    }
    query += ` ORDER BY j.id DESC`;

    const listRes = await db.query(query, params);
    return successResponse(res, 'Lista de justificaciones.', listRes.rows);
  } catch (error) {
    return errorResponse(res, 'Error al obtener justificaciones.', error.message);
  }
};

const createJustification = async (req, res) => {
  try {
    const { employee_id, attendance_id, reason_type, start_date, end_date, description } = req.body;

    if (!employee_id || !reason_type || !start_date || !end_date || !description) {
      return errorResponse(res, 'Campos obligatorios incompletos.', null, 400);
    }

    const docUrl = req.file ? `/uploads/photos/${req.file.filename}` : null;

    const result = await db.query(`
      INSERT INTO justifications (
        employee_id, attendance_id, reason_type, start_date, end_date,
        description, document_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING')
      RETURNING id;
    `, [employee_id, attendance_id || null, reason_type, start_date, end_date, description.trim(), docUrl]);

    return successResponse(res, 'Solicitud de justificación enviada.', { id: result.rows[0].id }, 201);
  } catch (error) {
    return errorResponse(res, 'Error al registrar justificación.', error.message);
  }
};

const reviewJustification = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewer_comment } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return errorResponse(res, 'Estado no válido. Debe ser APPROVED o REJECTED.', null, 400);
    }

    const justifRes = await db.query('SELECT * FROM justifications WHERE id = $1', [id]);
    const justif = justifRes.rows[0];
    if (!justif) {
      return errorResponse(res, 'Justificación no encontrada.', null, 404);
    }

    await db.transaction(async (client) => {
      await client.query(`
        UPDATE justifications SET
          status = $1,
          reviewed_by = $2,
          reviewed_at = CURRENT_TIMESTAMP,
          reviewer_comment = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `, [status, req.user?.id || 1, reviewer_comment || null, id]);

      if (status === 'APPROVED' && justif.attendance_id) {
        await client.query("UPDATE attendances SET status = 'JUSTIFIED' WHERE id = $1", [justif.attendance_id]);
      }
    });

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
