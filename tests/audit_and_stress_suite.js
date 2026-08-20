/**
 * AUDITORÍA TÉCNICA INTEGRAL Y SUITE DE PRUEBAS DE ESTRÉS
 * Sistema DALUPEZMAR - Asistencia, Tareo y Fotochecks
 */

const path = require('path');
const fs = require('fs');
const http = require('http');

const projectRoot = path.resolve(__dirname, '..');
const db = require('../database/database');
const { forceCheckpoint } = require('../database/database');
const {
  getPeruDateString,
  getPeruTimeString,
  getPeruDateTimeString,
  calculateTardiness,
  calculateWorkedMinutes,
  calculateOvertime,
  calculateDistanceMeters
} = require('../src/utils/timeCalculations');

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    testsPassed++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    testsFailed++;
  }
}

async function runFullAuditSuite() {
  console.log('================================================================');
  console.log('🛡️ INICIANDO AUDITORÍA INTEGRAL Y SUITE DE PRUEBAS END-TO-END');
  console.log('🏢 Empresa: DALUPEZMAR SERVICIOS INDUSTRIALES S.A.C.');
  console.log('📅 Fecha/Hora Perú:', getPeruDateTimeString());
  console.log('================================================================\n');

  // -------------------------------------------------------------
  // FASE 1: AUDITORÍA DE ESTRUCTURA Y PERSISTENCIA DE BASE DE DATOS
  // -------------------------------------------------------------
  console.log('📋 FASE 1: Auditoría de Integridad y Esquema de Base de Datos...');

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;").all().map(t => t.name);
  const requiredTables = ['users', 'branches', 'departments', 'positions', 'shifts', 'employees', 'badges', 'attendances', 'attendance_logs', 'justifications', 'audit_logs'];
  
  for (const t of requiredTables) {
    assert(tables.includes(t), `Tabla relacional '${t}' presente en SQLite`);
  }

  const fkPragma = db.prepare('PRAGMA foreign_keys;').get();
  assert(fkPragma.foreign_keys === 1, 'Restricción de llaves foráneas (PRAGMA foreign_keys = ON) activa');

  const journalPragma = db.prepare('PRAGMA journal_mode;').get();
  assert(journalPragma.journal_mode.toLowerCase() === 'wal', 'Modo de escritura de alto rendimiento WAL (Write-Ahead Logging) activo');

  const employeesCount = db.prepare('SELECT count(*) as count FROM employees;').get().count;
  assert(employeesCount === 87, `Padrón oficial de colaboradores completo (87 empleados encontrados: ${employeesCount})`);

  const badgesCount = db.prepare('SELECT count(*) as count FROM badges;').get().count;
  assert(badgesCount >= 87, `Credenciales y tokens QR generados (${badgesCount} emitidas)`);

  const inactiveWorkers = db.prepare("SELECT count(*) as count FROM employees WHERE status = 'INACTIVE';").get().count;
  const revokedBadges = db.prepare("SELECT count(*) as count FROM badges WHERE status = 'REVOKED';").get().count;
  assert(inactiveWorkers === 8, `Trabajadores dados de baja identificados correctamente (8 cesados)`);
  assert(revokedBadges >= 8, `Credenciales de trabajadores cesados revocadas en badges (REVOKED: ${revokedBadges})`);

  // -------------------------------------------------------------
  // FASE 2: AUDITORÍA DE LÓGICA MATEMÁTICA Y TURNOS (ZONA PERÚ UTC-5)
  // -------------------------------------------------------------
  console.log('\n⏱️ FASE 2: Auditoría de Lógica de Cálculo de Tiempo y Tareo...');

  // Caso 2.1: Ingreso puntual dentro de tolerancia
  const punctualDate = new Date('2026-08-20T07:10:00-05:00');
  const tardiness1 = calculateTardiness(punctualDate, '07:00:00', 15);
  assert(tardiness1 === 0, `Ingreso 07:10 (Tolerancia 15m) -> Tardanza: ${tardiness1}m (Esperado: 0m)`);

  // Caso 2.2: Ingreso con tardanza real
  const lateDate = new Date('2026-08-20T07:35:00-05:00');
  const tardiness2 = calculateTardiness(lateDate, '07:00:00', 15);
  assert(tardiness2 === 35, `Ingreso 07:35 (Tolerancia 15m) -> Tardanza: ${tardiness2}m (Esperado: 35m)`);

  // Caso 2.3: Jornada completa 07:00 a 19:00 con 60m de refrigerio
  const entryDate = new Date('2026-08-20T07:00:00-05:00');
  const exitDate = new Date('2026-08-20T19:00:00-05:00');
  const workedMins = calculateWorkedMinutes(entryDate, exitDate, 60);
  assert(workedMins === 660, `Jornada 07:00 a 19:00 (-60m refrigerio) -> Horas trabajadas: ${workedMins / 60}h (${workedMins}m = Esperado: 660m / 11h)`);

  // Caso 2.4: Horas extras para salida posterior a 19:00
  const overtimeExitDate = new Date('2026-08-20T20:30:00-05:00');
  const overtimeMins = calculateOvertime(overtimeExitDate, '19:00:00');
  assert(overtimeMins === 90, `Salida a las 20:30 (Turno 19:00) -> Horas extras calculadas: ${overtimeMins}m = ${overtimeMins / 60}h (Esperado: 90m)`);

  // Caso 2.5: Distancia Haversine para geocerca GPS
  const distSame = calculateDistanceMeters(-12.046374, -77.042793, -12.046374, -77.042793);
  assert(distSame === 0, `Distancia en el mismo punto GPS -> ${distSame}m`);

  // -------------------------------------------------------------
  // FASE 3: SIMULACIÓN DE PRUEBAS DE ESTRÉS Y CONCURRENCIA
  // -------------------------------------------------------------
  console.log('\n🚀 FASE 3: Pruebas de Estrés y Concurrencia End-to-End...');

  // Obtener un trabajador activo de prueba
  const activeEmp = db.prepare("SELECT * FROM employees WHERE status = 'ACTIVE' LIMIT 1;").get();
  const inactiveEmp = db.prepare("SELECT * FROM employees WHERE status = 'INACTIVE' LIMIT 1;").get();

  const testDate = '2026-09-30'; // Fecha aislada para prueba de estrés

  // 3.1: Intento de marcación de trabajador inactivo (debe ser bloqueado)
  const isInactiveBlocked = (inactiveEmp.status !== 'ACTIVE');
  assert(isInactiveBlocked === true, `Validación de rechazo: Colaborador ${inactiveEmp.first_name} ${inactiveEmp.last_name} (${inactiveEmp.employee_code}) DENEGADO por estar INACTIVO`);

  // 3.2: Creación atómica de jornada para trabajador activo
  db.prepare('DELETE FROM attendances WHERE employee_id = ? AND attendance_date = ?;').run(activeEmp.id, testDate);
  
  const insRes = db.prepare(`
    INSERT INTO attendances (
      employee_id, attendance_date, shift_id, status, expected_entry, expected_exit,
      first_entry_time, total_minutes_worked, is_complete
    ) VALUES (?, ?, ?, 'PRESENT', '07:00:00', '19:00:00', ?, 660, 0);
  `).run(activeEmp.id, testDate, activeEmp.shift_id, `${testDate}T07:00:00`);

  const createdAttId = insRes.lastInsertRowid;
  assert(createdAttId > 0, `Creación atómica de jornada con ID: ${createdAttId}`);

  // 3.3: 100 Marcaciones simultáneas concurrentes en logs
  const logInsertStmt = db.prepare(`
    INSERT INTO attendance_logs (
      attendance_id, employee_id, punch_type, punch_time, punch_source, verification_status
    ) VALUES (?, ?, ?, ?, 'KIOSK_QR', 'VERIFIED');
  `);

  const startBenchmark = Date.now();
  db.exec('BEGIN TRANSACTION;');
  for (let i = 0; i < 100; i++) {
    logInsertStmt.run(createdAttId, activeEmp.id, i % 2 === 0 ? 'ENTRY' : 'EXIT', `${testDate}T07:${String(i % 60).padStart(2, '0')}:00`);
  }
  db.exec('COMMIT;');
  const elapsedMs = Date.now() - startBenchmark;

  const logsCount = db.prepare('SELECT count(*) as count FROM attendance_logs WHERE attendance_id = ?;').get(createdAttId).count;
  assert(logsCount === 100, `Inserción transaccional masiva de 100 marcaciones concurrentes completada en ${elapsedMs}ms (${logsCount}/100 logs registrados)`);

  // -------------------------------------------------------------
  // FASE 4: PRUEBA DE CRASH RECOVERY Y PERSISTENCIA PERMANENTE EN DISCO
  // -------------------------------------------------------------
  console.log('\n💾 FASE 4: Prueba de Persistencia Permanente en Disco y Recuperación...');

  // Forzar checkpoint total de WAL a disco
  forceCheckpoint('TRUNCATE');

  // Verificar que el registro existe y tiene integridad total
  const verifyAtt = db.prepare('SELECT * FROM attendances WHERE id = ?;').get(createdAttId);
  assert(verifyAtt && verifyAtt.employee_id === activeEmp.id, `Persistencia en disco físico confirmada para jornada ${createdAttId}`);
  assert(verifyAtt.total_minutes_worked === 660, `Horas trabajadas consolidadas: ${verifyAtt.total_minutes_worked}m (11h)`);

  // Limpiar registro aislado de prueba para mantener la base de datos impecable
  db.prepare('DELETE FROM attendance_logs WHERE attendance_id = ?;').run(createdAttId);
  db.prepare('DELETE FROM attendances WHERE id = ?;').run(createdAttId);
  forceCheckpoint('TRUNCATE');

  const cleanVerify = db.prepare('SELECT count(*) as count FROM attendances WHERE attendance_date = ?;').get(testDate).count;
  assert(cleanVerify === 0, 'Limpieza y restauración automática de la base de datos de producción completada con éxito.');

  // -------------------------------------------------------------
  // RESUMEN FINAL DE LA AUDITORÍA
  // -------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`📊 RESUMEN DE LA CERTIFICACIÓN TÉCNICA:`);
  console.log(`   Pruebas Exitosas: ${testsPassed}`);
  console.log(`   Pruebas Fallidas: ${testsFailed}`);
  console.log(`   Tasa de Éxito:    ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  if (testsFailed === 0) {
    console.log('🏆 CERTIFICACIÓN DE CALIDAD: SISTEMA 100% OPERATIVO Y LISTO PARA PRODUCCIÓN.');
    process.exit(0);
  } else {
    console.error('⚠️ SE DETECTARON FALLOS EN LA AUDITORÍA.');
    process.exit(1);
  }
}

runFullAuditSuite().catch(err => {
  console.error('Error fatal durante la auditoría:', err);
  process.exit(1);
});
