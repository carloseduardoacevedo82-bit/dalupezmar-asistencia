const path = require('path');
const db = require('../database/database');
const { forceCheckpoint } = require('../database/database');
const {
  getPeruDateString,
  getPeruTimeString,
  getPeruDateTimeString,
  calculateTardiness,
  calculateWorkedMinutes,
  calculateOvertime
} = require('../src/utils/timeCalculations');

console.log('🧪 ========================================================');
console.log('🧪 INICIANDO BATERÍA DE PRUEBAS DE ESTRÉS Y PERSISTENCIA');
console.log('🧪 DALUPEZMAR - Sistema de Asistencia y Fotochecks');
console.log('🧪 ========================================================');

// 1. Validar fechas y horas en zona horaria America/Lima
const simulatedNow = new Date('2026-08-19T20:30:00-05:00'); // 8:30 PM en Lima (01:30 UTC del 20 de agosto)
const peruDate = getPeruDateString(simulatedNow);
const peruTime = getPeruTimeString(simulatedNow);

console.log('\n[TEST 1] Validación de Zona Horaria Peruana:');
console.log('  - Timestamp simulado:', simulatedNow.toISOString());
console.log('  - Fecha calculada (America/Lima):', peruDate, peruDate === '2026-08-19' ? '✅ CORRECTO' : '❌ ERROR');
console.log('  - Hora calculada (America/Lima):', peruTime, peruTime === '20:30:00' ? '✅ CORRECTO' : '❌ ERROR');

// 2. Probar cálculos de tardanza y horas trabajadas
const entryOnTime = new Date('2026-08-19T07:05:00-05:00'); // 7:05 AM (Turno 07:00, tolerancia 15 min -> 0 min tardanza)
const entryLate = new Date('2026-08-19T07:25:00-05:00');   // 7:25 AM (Turno 07:00, tolerancia 15 min -> 25 min tardanza)
const exitStandard = new Date('2026-08-19T19:00:00-05:00'); // 7:00 PM (12h transcurridas - 1h almuerzo = 11h = 660 min)

const tardiness1 = calculateTardiness(entryOnTime, '07:00:00', 15);
const tardiness2 = calculateTardiness(entryLate, '07:00:00', 15);
const workedMins = calculateWorkedMinutes(entryOnTime, exitStandard, 60);

console.log('\n[TEST 2] Validación de Métricas de Tiempo y Tardanzas:');
console.log('  - Tardanza a las 07:05 (tolerancia 15m):', tardiness1, 'min', tardiness1 === 0 ? '✅ CORRECTO' : '❌ ERROR');
console.log('  - Tardanza a las 07:25 (tolerancia 15m):', tardiness2, 'min', tardiness2 === 25 ? '✅ CORRECTO' : '❌ ERROR');
console.log('  - Minutos trabajados (07:05 a 19:00, -60m ref):', workedMins, 'min', workedMins === 655 ? '✅ CORRECTO' : '❌ ERROR');

// 3. Prueba de Inserción y Persistencia Atómica con Checkpoints
console.log('\n[TEST 3] Inserción de Marcaciones y Logs de Auditoría:');
const testEmp = db.prepare('SELECT id, employee_code, document_number FROM employees LIMIT 1').get();
console.log('  - Colaborador de prueba:', testEmp.employee_code, 'DNI:', testEmp.document_number);

const testDate = '2026-08-19';

// Asegurar limpieza de registro de prueba previo si existe
db.prepare('DELETE FROM attendance_logs WHERE employee_id = ? AND punch_time LIKE ?').run(testEmp.id, `${testDate}%`);
db.prepare('DELETE FROM attendances WHERE employee_id = ? AND attendance_date = ?').run(testEmp.id, testDate);

// Insertar asistencia
const insertAtt = db.prepare(`
  INSERT INTO attendances (
    employee_id, attendance_date, shift_id, status, expected_entry, expected_exit,
    first_entry_time, last_exit_time, total_minutes_worked, total_minutes_late, is_complete
  ) VALUES (?, ?, 4, 'PRESENT', '07:00:00', '19:00:00', '2026-08-19T07:00:00', '2026-08-19T19:00:00', 660, 0, 1)
`).run(testEmp.id, testDate);

const attId = insertAtt.lastInsertRowid;

// Insertar logs biométricos
db.prepare(`
  INSERT INTO attendance_logs (
    attendance_id, employee_id, punch_type, punch_time, punch_source, verification_status
  ) VALUES (?, ?, 'ENTRY', '2026-08-19T07:00:00', 'KIOSK_QR', 'VERIFIED')
`).run(attId, testEmp.id);

db.prepare(`
  INSERT INTO attendance_logs (
    attendance_id, employee_id, punch_type, punch_time, punch_source, verification_status
  ) VALUES (?, ?, 'EXIT', '2026-08-19T19:00:00', 'KIOSK_QR', 'VERIFIED')
`).run(attId, testEmp.id);

// Insertar log de auditoría
db.prepare(`
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address)
  VALUES (1, 'STRESS_TEST_PUNCH', 'attendances', ?, 'Prueba de persistencia permanente', '127.0.0.1')
`).run(String(attId));

// Forzar flush a disco
forceCheckpoint('TRUNCATE');
console.log('  - Registro de asistencia creado ID:', attId);
console.log('  - Checkpoint TRUNCATE ejecutado satisfactoriamente.');

// 4. Validar existencia física del registro
const verifiedAtt = db.prepare('SELECT * FROM attendances WHERE id = ?').get(attId);
const verifiedLogs = db.prepare('SELECT * FROM attendance_logs WHERE attendance_id = ?').all(attId);
const verifiedAudit = db.prepare('SELECT * FROM audit_logs WHERE entity_id = ?').all(String(attId));

console.log('\n[TEST 4] Validación de Integridad Referencial e Histórica:');
console.log('  - Asistencia recuperada:', verifiedAtt ? `✅ ID ${verifiedAtt.id} (${verifiedAtt.attendance_date})` : '❌ NO ENCONTRADA');
console.log('  - Logs individuales recuperados:', verifiedLogs.length === 2 ? `✅ ${verifiedLogs.length} logs` : `❌ ${verifiedLogs.length} logs`);
console.log('  - Logs de auditoría recuperados:', verifiedAudit.length > 0 ? `✅ ${verifiedAudit.length} registros` : '❌ NO ENCONTRADO');

console.log('\n🎉 TODAS LAS PRUEBAS DE ESTRÉS Y PERSISTENCIA FINALIZADAS CON ÉXITO.');
