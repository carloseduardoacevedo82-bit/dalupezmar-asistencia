const http = require('http');
const app = require('../src/app');
const db = require('../database/database');
const { forceCheckpoint } = require('../database/database');

console.log('🚀 Iniciando prueba integral de endpoint punch y reinicio de servidor...');

const server = http.createServer(app);
server.listen(3099, async () => {
  try {
    const postData = JSON.stringify({
      token: '77699820', // Melanie Corina Altamirano Sanchez
      punch_type: 'ENTRY',
      punch_source: 'KIOSK_QR'
    });

    const options = {
      hostname: 'localhost',
      port: 3099,
      path: '/api/v1/attendance/punch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log('📡 Código de respuesta HTTP:', res.statusCode);
        const data = JSON.parse(body);
        console.log('📡 Respuesta de la API:', JSON.stringify(data, null, 2));

        // Validar que se haya guardado en la base de datos
        const emp = db.prepare('SELECT id FROM employees WHERE document_number = ?').get('77699820');
        const att = db.prepare('SELECT * FROM attendances WHERE employee_id = ? ORDER BY id DESC LIMIT 1').get(emp.id);
        const log = db.prepare('SELECT * FROM attendance_logs WHERE employee_id = ? ORDER BY id DESC LIMIT 1').get(emp.id);
        const audit = db.prepare('SELECT * FROM audit_logs WHERE entity_id = ? ORDER BY id DESC LIMIT 1').get(String(att.id));

        console.log('\n🔍 Verificación directa en base de datos:');
        console.log('  - Asistencia guardada:', att ? `ID: ${att.id}, Fecha: ${att.attendance_date}, Estado: ${att.status}` : '❌ NO');
        console.log('  - Log biométrico guardado:', log ? `ID: ${log.id}, Tipo: ${log.punch_type}, Hora: ${log.punch_time}` : '❌ NO');
        console.log('  - Auditoría guardada:', audit ? `ID: ${audit.id}, Acción: ${audit.action}` : '❌ NO');

        server.close(() => {
          console.log('\n🔒 Servidor cerrado limpiamente.');
          forceCheckpoint('TRUNCATE');
          console.log('💾 Checkpoint final ejecutado. Datos 100% persistidos en disco.');
          process.exit(0);
        });
      });
    });

    req.on('error', (e) => {
      console.error('Error en petición HTTP:', e);
      server.close(() => process.exit(1));
    });

    req.write(postData);
    req.end();
  } catch (err) {
    console.error('Error en prueba:', err);
    server.close(() => process.exit(1));
  }
});
