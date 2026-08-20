/**
 * MÓDULO DE SINCRONIZACIÓN Y PERSISTENCIA BIDIRECCIONAL CON SUPABASE
 * DALUPEZMAR - Asistencia, Tareo y Fotochecks
 */

require('dotenv').config();
const { Pool } = require('pg');

const rawUrl = process.env.DATABASE_URL || 'postgresql://postgres.vsqqvpejgmamcwqpdzze:Dalupezmar2026!@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

let pgPool = null;

if (rawUrl && (rawUrl.startsWith('postgresql://') || rawUrl.startsWith('postgres://'))) {
  pgPool = new Pool({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000
  });
  console.log('☁️ [Supabase] Pool de conexión activo hacia la nube (PostgreSQL).');
}

/**
 * Sincroniza los datos de Supabase hacia la base de datos local SQLite al iniciar el servidor
 */
async function syncFromSupabase(db) {
  if (!pgPool) return;

  try {
    console.log('🔄 [Supabase] Sincronizando datos desde la nube...');
    const client = await pgPool.connect();

    try {
      // 1. Sincronizar empleados desde Supabase
      const empsRes = await client.query('SELECT * FROM employees ORDER BY id ASC;');
      if (empsRes.rows.length > 0) {
        const insertOrUpdate = db.prepare(`
          INSERT INTO employees (
            id, employee_code, document_type, document_number, first_name, last_name,
            email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
            birth_date, hire_date, branch_id, department_id, position_id, shift_id,
            photo_url, work_mode, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(document_number) DO UPDATE SET
            employee_code = excluded.employee_code,
            first_name = excluded.first_name,
            last_name = excluded.last_name,
            status = excluded.status,
            department_id = excluded.department_id,
            position_id = excluded.position_id,
            shift_id = excluded.shift_id;
        `);

        for (const e of empsRes.rows) {
          insertOrUpdate.run(
            e.id, e.employee_code, e.document_type || 'DNI', e.document_number, e.first_name, e.last_name,
            e.email, e.phone, e.emergency_contact_name, e.emergency_contact_phone, e.blood_type,
            e.birth_date ? String(e.birth_date).substring(0, 10) : null,
            e.hire_date ? String(e.hire_date).substring(0, 10) : '2024-01-01',
            e.branch_id || 1, e.department_id || 1, e.position_id || 1, e.shift_id || 1,
            e.photo_url, e.work_mode || 'PRESENTIAL', e.status || 'ACTIVE'
          );
        }
        console.log(`   ✅ [Supabase] ${empsRes.rows.length} colaboradores sincronizados desde la nube.`);
      }

      // 2. Sincronizar badges desde Supabase
      const badgesRes = await client.query('SELECT * FROM badges ORDER BY id ASC;');
      if (badgesRes.rows.length > 0) {
        const insertBadge = db.prepare(`
          INSERT INTO badges (
            id, employee_id, badge_code, qr_token_hash, barcode_value,
            issue_date, expiration_date, status, template_theme, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(badge_code) DO UPDATE SET
            qr_token_hash = excluded.qr_token_hash,
            barcode_value = excluded.barcode_value,
            status = excluded.status;
        `);

        for (const b of badgesRes.rows) {
          insertBadge.run(
            b.id, b.employee_id, b.badge_code, b.qr_token_hash, b.barcode_value,
            b.issue_date ? String(b.issue_date).substring(0, 10) : '2026-01-01',
            b.expiration_date ? String(b.expiration_date).substring(0, 10) : '2028-12-31',
            b.status || 'ACTIVE', b.template_theme || 'CORPORATE_BLUE', b.notes
          );
        }
      }

      // 3. Sincronizar asistencias del día / recientes
      const attsRes = await client.query('SELECT * FROM attendances ORDER BY id ASC;');
      if (attsRes.rows.length > 0) {
        const insertAtt = db.prepare(`
          INSERT INTO attendances (
            id, employee_id, attendance_date, shift_id, status,
            expected_entry, expected_exit, first_entry_time, lunch_start_time,
            lunch_end_time, last_exit_time, total_minutes_worked, total_minutes_late,
            total_minutes_overtime, is_complete, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(employee_id, attendance_date) DO UPDATE SET
            first_entry_time = excluded.first_entry_time,
            last_exit_time = excluded.last_exit_time,
            status = excluded.status,
            total_minutes_worked = excluded.total_minutes_worked;
        `);

        for (const a of attsRes.rows) {
          insertAtt.run(
            a.id, a.employee_id,
            a.attendance_date ? String(a.attendance_date).substring(0, 10) : '2026-08-19',
            a.shift_id || 1, a.status || 'PRESENT', a.expected_entry || '07:00:00', a.expected_exit || '19:00:00',
            a.first_entry_time, a.lunch_start_time, a.lunch_end_time, a.last_exit_time,
            a.total_minutes_worked || 0, a.total_minutes_late || 0, a.total_minutes_overtime || 0,
            a.is_complete || 0, a.notes
          );
        }
      }

      db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      console.log('✅ [Supabase] Sincronización nube -> local finalizada.');
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('⚠️ [Supabase] Error en sincronización inicial:', err.message);
  }
}

/**
 * Guarda en segundo plano un colaborador nuevo o actualizado en Supabase
 */
function saveEmployeeToSupabase(emp) {
  if (!pgPool) return;
  pgPool.query(`
    INSERT INTO employees (
      id, employee_code, document_type, document_number, first_name, last_name,
      email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
      birth_date, hire_date, branch_id, department_id, position_id, shift_id,
      photo_url, work_mode, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
    ON CONFLICT (document_number) DO UPDATE SET
      employee_code = EXCLUDED.employee_code,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      status = EXCLUDED.status,
      department_id = EXCLUDED.department_id,
      position_id = EXCLUDED.position_id,
      shift_id = EXCLUDED.shift_id,
      photo_url = EXCLUDED.photo_url;
  `, [
    emp.id, emp.employee_code, emp.document_type || 'DNI', emp.document_number, emp.first_name, emp.last_name,
    emp.email, emp.phone, emp.emergency_contact_name, emp.emergency_contact_phone, emp.blood_type,
    emp.birth_date, emp.hire_date, emp.branch_id || 1, emp.department_id || 1, emp.position_id || 1, emp.shift_id || 1,
    emp.photo_url, emp.work_mode, emp.status
  ]).catch(e => console.warn('[Supabase Sync Error emp]:', e.message));
}

/**
 * Guarda en segundo plano una marcación o jornada en Supabase
 */
function saveAttendanceToSupabase(att) {
  if (!pgPool) return;
  pgPool.query(`
    INSERT INTO attendances (
      id, employee_id, attendance_date, shift_id, status,
      expected_entry, expected_exit, first_entry_time, lunch_start_time,
      lunch_end_time, last_exit_time, total_minutes_worked, total_minutes_late,
      total_minutes_overtime, is_complete, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (employee_id, attendance_date) DO UPDATE SET
      first_entry_time = EXCLUDED.first_entry_time,
      lunch_start_time = EXCLUDED.lunch_start_time,
      lunch_end_time = EXCLUDED.lunch_end_time,
      last_exit_time = EXCLUDED.last_exit_time,
      total_minutes_worked = EXCLUDED.total_minutes_worked,
      total_minutes_late = EXCLUDED.total_minutes_late,
      total_minutes_overtime = EXCLUDED.total_minutes_overtime,
      status = EXCLUDED.status,
      is_complete = EXCLUDED.is_complete;
  `, [
    att.id, att.employee_id, att.attendance_date, att.shift_id || 1, att.status,
    att.expected_entry || '07:00:00', att.expected_exit || '19:00:00',
    att.first_entry_time, att.lunch_start_time, att.lunch_end_time, att.last_exit_time,
    att.total_minutes_worked || 0, att.total_minutes_late || 0, att.total_minutes_overtime || 0,
    att.is_complete || 0, att.notes || null
  ]).catch(e => console.warn('[Supabase Sync Error att]:', e.message));
}

/**
 * Guarda un log individual en Supabase
 */
function saveLogToSupabase(log) {
  if (!pgPool) return;
  pgPool.query(`
    INSERT INTO attendance_logs (
      attendance_id, employee_id, punch_type, punch_time, punch_source,
      latitude, longitude, is_within_geofence, device_info, ip_address, raw_token, verification_status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
  `, [
    log.attendance_id, log.employee_id, log.punch_type, log.punch_time, log.punch_source,
    log.latitude || null, log.longitude || null, log.is_within_geofence !== undefined ? log.is_within_geofence : 1,
    log.device_info || null, log.ip_address || null, log.raw_token || null, log.verification_status || 'VERIFIED'
  ]).catch(e => console.warn('[Supabase Sync Error log]:', e.message));
}

/**
 * Elimina un empleado en Supabase
 */
function deleteEmployeeFromSupabase(empId) {
  if (!pgPool) return;
  pgPool.query('DELETE FROM employees WHERE id = $1;', [empId]).catch(e => console.warn('[Supabase Sync Delete]:', e.message));
}

module.exports = {
  pgPool,
  syncFromSupabase,
  saveEmployeeToSupabase,
  saveAttendanceToSupabase,
  saveLogToSupabase,
  deleteEmployeeFromSupabase
};
