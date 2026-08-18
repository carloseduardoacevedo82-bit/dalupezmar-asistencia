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
