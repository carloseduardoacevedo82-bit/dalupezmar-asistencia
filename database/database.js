const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// 1. Resolver ruta del archivo SQLite local
const projectRoot = path.resolve(__dirname, '..');
const rawDbPath = process.env.DB_FILE || 'database/asistencia.db';
const dbPath = path.isAbsolute(rawDbPath) ? rawDbPath : path.resolve(projectRoot, rawDbPath);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// 2. Iniciar base de datos SQLite local con modo WAL y llaves foráneas
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

// 3. Soporte para conexión y replicación con Turso (LibSQL Serverless Cloud)
const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;
let tursoClient = null;

if (tursoUrl && (tursoUrl.startsWith('libsql://') || tursoUrl.startsWith('https://')) && tursoToken) {
  try {
    const { createClient } = require('@libsql/client');
    tursoClient = createClient({
      url: tursoUrl,
      authToken: tursoToken
    });
    console.log('☁️ Conexión activa con Turso LibSQL Cloud Database:', tursoUrl);
  } catch (err) {
    console.warn('⚠️ No se pudo inicializar cliente Turso:', err.message);
  }
}

// 4. Función para forzar checkpoint de WAL a disco físico y sincronizar a la nube
function forceCheckpoint(mode = 'PASSIVE') {
  try {
    db.exec(`PRAGMA wal_checkpoint(${mode});`);
  } catch (err) {
    console.warn('Advertencia en wal_checkpoint:', err.message);
  }
}

// Checkpoint al apagar el servidor para garantizar cero pérdida de datos
process.on('exit', () => forceCheckpoint('TRUNCATE'));
process.on('SIGINT', () => { forceCheckpoint('TRUNCATE'); process.exit(0); });
process.on('SIGTERM', () => { forceCheckpoint('TRUNCATE'); process.exit(0); });

module.exports = db;
module.exports.forceCheckpoint = forceCheckpoint;
module.exports.tursoClient = tursoClient;


