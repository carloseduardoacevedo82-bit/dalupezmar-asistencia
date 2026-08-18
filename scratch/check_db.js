const db = require('../database/database');
const empCount = db.prepare('SELECT count(*) as count FROM employees').get();
const activeCount = db.prepare("SELECT count(*) as count FROM employees WHERE status = 'ACTIVE'").get();
const positions = db.prepare('SELECT id, name FROM positions').all();
const photosCount = db.prepare("SELECT count(*) as count FROM employees WHERE photo_url IS NOT NULL AND photo_url != '' AND photo_url != '/uploads/photos/default-avatar.png'").get();

console.log('--- REPORTE DE BASE DE DATOS LOCAL ---');
console.log('Total Empleados:', empCount.count);
console.log('Empleados Activos:', activeCount.count);
console.log('Empleados con Fotos reales cargadas:', photosCount.count);
console.log('Total Puestos:', positions.length);
console.log('Puestos encontrados:', positions.map(p => p.name).join(', '));
