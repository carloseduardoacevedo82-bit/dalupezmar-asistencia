const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Resolver siempre la ruta absoluta del archivo SQLite
const projectRoot = path.resolve(__dirname, '..');
const rawDbPath = process.env.DB_FILE || 'database/asistencia.db';
const dbPath = path.isAbsolute(rawDbPath) ? rawDbPath : path.resolve(projectRoot, rawDbPath);
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Iniciar base de datos nativa con modo WAL, synchronous NORMAL y llaves foráneas
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

// Función para forzar checkpoint de WAL a disco físico permanente
function forceCheckpoint(mode = 'PASSIVE') {
  try {
    db.exec(`PRAGMA wal_checkpoint(${mode});`);
  } catch (err) {
    console.warn('Advertencia en wal_checkpoint:', err.message);
  }
}

// Checkpoint al apagar el servidor para garantizar cero pérdida de transacciones
process.on('exit', () => forceCheckpoint('TRUNCATE'));
process.on('SIGINT', () => { forceCheckpoint('TRUNCATE'); process.exit(0); });
process.on('SIGTERM', () => { forceCheckpoint('TRUNCATE'); process.exit(0); });

module.exports = db;
module.exports.forceCheckpoint = forceCheckpoint;

