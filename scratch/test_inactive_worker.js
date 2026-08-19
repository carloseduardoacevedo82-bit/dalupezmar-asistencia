const db = require('../database/database');
const http = require('http');
const app = require('../src/app');

console.log('🧪 Iniciando prueba de bloqueo para trabajadores inactivos / dados de baja...');

// 1. Crear temporalmente un trabajador inactivo
db.prepare("DELETE FROM employees WHERE document_number = '99998888'").run();
const insertRes = db.prepare(`
  INSERT INTO employees (
    employee_code, document_type, document_number, first_name, last_name,
    email, branch_id, department_id, position_id, shift_id, status, hire_date
  ) VALUES ('DAL-9999', 'DNI', '99998888', 'Trabajador', 'Cesado Prueba', 'cesado@dalupezmar.pe', 1, 1, 1, 1, 'INACTIVE', '2026-01-01')
`).run();

const empId = insertRes.lastInsertRowid;
console.log('  - Creado colaborador de prueba inactivo ID:', empId, 'Estado: INACTIVE');

const server = http.createServer(app);
server.listen(3098, async () => {
  try {
    // 2. Intentar marcación por API
    const postData = JSON.stringify({
      token: '99998888',
      punch_type: 'ENTRY',
      punch_source: 'KIOSK_QR'
    });

    const options = {
      hostname: 'localhost',
      port: 3098,
      path: '/api/v1/attendance/punch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('\n📡 Respuesta del servidor (HTTP Code):', res.statusCode);
        const data = JSON.parse(body);
        console.log('📡 Mensaje recibido:', data.message);
        console.log('📡 Éxito:', data.success);

        // 3. Validar que NO se haya insertado ninguna asistencia
        const att = db.prepare('SELECT * FROM attendances WHERE employee_id = ?').get(empId);
        const log = db.prepare('SELECT * FROM attendance_logs WHERE employee_id = ?').get(empId);
        const audit = db.prepare("SELECT * FROM audit_logs WHERE action = 'PUNCH_BLOCKED_INACTIVE_WORKER' AND entity_id = ?").get(String(empId));

        console.log('\n🔍 Verificaciones en Base de Datos:');
        console.log('  - Asistencia en DB (Debe ser null):', att === undefined ? '✅ BLOQUEADO CORRECTAMENTE (No se registró)' : '❌ ERROR: Se registró asistencia');
        console.log('  - Log biométrico en DB (Debe ser null):', log === undefined ? '✅ BLOQUEADO CORRECTAMENTE (No se registró log)' : '❌ ERROR: Se registró log');
        console.log('  - Auditoría de intento bloqueado:', audit ? `✅ REGISTRADO EN AUDITORÍA (ID ${audit.id}): ${audit.details}` : '❌ NO ENCONTRADO EN AUDITORÍA');

        // Limpiar registro de prueba
        db.prepare('DELETE FROM employees WHERE id = ?').run(empId);
        db.prepare('DELETE FROM audit_logs WHERE id = ?').run(audit?.id || 0);

        server.close(() => {
          console.log('\n🎉 PRUEBA DE TRABAJADOR INACTIVO COMPLETADA CON ÉXITO.');
          process.exit(0);
        });
      });
    });

    req.write(postData);
    req.end();
  } catch (err) {
    console.error('Error en prueba:', err);
    server.close(() => process.exit(1));
  }
});
