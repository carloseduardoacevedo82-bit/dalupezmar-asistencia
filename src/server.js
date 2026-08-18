const http = require('http');
const path = require('path');
const fs = require('fs');
const app = require('./app');
const config = require('./config/config');
const db = require('../database/database');
const initDb = require('../database/initDb');

// Verificar si la base de datos tiene tablas; si no, inicializar automáticamente
try {
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!tableCheck) {
    console.log('⚡ Base de datos no inicializada. Ejecutando migración inicial...');
    initDb();
  }
} catch (err) {
  console.log('⚡ Error al verificar tablas. Ejecutando inicialización...', err.message);
  initDb();
}

// Crear directorios requeridos
const uploadsDir = path.join(__dirname, '../public/uploads/photos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Sincronización y auditoría de personal y bajas oficiales de DALUPEZMAR
try {
  // 1. Eliminar registros de prueba demo residuales
  db.prepare(`
    DELETE FROM employees 
    WHERE document_number IN ('12345678', '87654321', '11223344', '55667788', '10000001', '10000002')
       OR employee_code IN ('ADM-001', 'DEV-002', 'HR-003', 'OPS-004')
       OR first_name LIKE '%Demo%' 
       OR last_name LIKE '%Prueba%'
  `).run();

  // 2. Establecer el estado INACTIVE para los 8 trabajadores dados de baja procesados
  const bajasDnis = [
    '40811097',  // Mirtha Karina Castro Ubaldo
    '60948067',  // Joel Dario Fernandez Bobadilla
    '60592404',  // Rosalinda Ipushima Yahuarcani
    '008165638', // Iliana Lilibeth Ruiz Polanco
    '008706148', // Jesus David Saavedra Diaz
    '75216072',  // Sandy Estefany Sanchez Godoy
    '61296965',  // Reymon Favian Usquiano Olascuaga
    '70581266'   // Karyn Yaricahua Yuyarima
  ];

  const updateBaja = db.prepare("UPDATE employees SET status = 'INACTIVE' WHERE document_number = ?");
  for (const dni of bajasDnis) {
    updateBaja.run(dni);
  }
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
} catch (syncErr) {
  console.log('Nota de sincronización de personal:', syncErr.message);
}

const server = http.createServer(app);

server.listen(config.port, () => {
  console.log('===========================================================');
  console.log(`🚀 SERVIDOR DE ASISTENCIA Y FOTOCHECKS EN LÍNEA`);
  console.log(`🌐 URL Local: http://localhost:${config.port}`);
  console.log(`🏢 Organización: ${config.company.name}`);
  console.log(`🛡️ Entorno: ${config.nodeEnv}`);
  console.log(`⚡ API REST v1: http://localhost:${config.port}/api/v1/health`);
  console.log('===========================================================');
});
