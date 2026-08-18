const db = require('../database/database');

db.prepare(`
  UPDATE shifts 
  SET entry_time = '07:00:00', exit_time = '19:00:00'
  WHERE id IN (1, 2, 4) OR name LIKE '%Producc%' OR name LIKE '%Operat%'
`).run();

db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

console.log('--- TURNOS ACTUALIZADOS A JORNADA 07:00 - 19:00 ---');
const shifts = db.prepare('SELECT id, name, entry_time, exit_time FROM shifts').all();
console.log(shifts);
