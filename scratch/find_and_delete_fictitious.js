const db = require('../database/database');

console.log('--- BUSCANDO TODOS LOS TRABAJADORES FICTICIOS EN ASISTENCIA.DB ---');

// Listar todos los empleados y ver cuáles son ficticios
const all = db.prepare(`
  SELECT e.id, e.employee_code, e.document_number, e.first_name, e.last_name, e.email, p.name as position_name, d.name as department_name
  FROM employees e
  LEFT JOIN positions p ON e.position_id = p.id
  LEFT JOIN departments d ON e.department_id = d.id
  ORDER BY e.id ASC
`).all();

const fictitious = all.filter(e => {
  const email = (e.email || '').toLowerCase();
  const dni = e.document_number || '';
  const first = (e.first_name || '').toLowerCase();
  const last = (e.last_name || '').toLowerCase();
  const dept = (e.department_name || '').toLowerCase();
  
  return email.includes('globaltech') || 
         email.includes('test') ||
         dept.includes('tecnolog') ||
         dni === '70984512' || // Camila Lucia Navarro
         dni === '45982341' || // Carlos Alberto Mendoza
         dni === '71234567' ||
         dni === '43218765' ||
         dni === '12345678' ||
         dni === '87654321' ||
         first.includes('camila lucia') ||
         (first.includes('carlos alberto') && last.includes('mendoza quispe')) ||
         first.includes('laura beatriz') ||
         first.includes('ana maria') ||
         first.includes('roberto carlos');
});

console.log(`Encontrados ${fictitious.length} trabajadores ficticios:`);
fictitious.forEach(f => {
  console.log(`❌ [ID: ${f.id}] DNI: ${f.document_number} | ${f.first_name} ${f.last_name} | Email: ${f.email} | Dept: ${f.department_name}`);
});

// Eliminar de base de datos local
if (fictitious.length > 0) {
  const ids = fictitious.map(f => f.id);
  const deleteStmt = db.prepare(`DELETE FROM employees WHERE id IN (${ids.join(',')})`);
  const delInfo = deleteStmt.run();
  console.log(`✅ Eliminados ${delInfo.changes} registros ficticios de la base de datos.`);
}

// Checkpoint WAL
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

const remaining = db.prepare(`
  SELECT count(*) as total, 
         sum(case when status = 'ACTIVE' then 1 else 0 end) as active,
         sum(case when status = 'INACTIVE' then 1 else 0 end) as inactive
  FROM employees
`).get();

console.log('\n--- ESTADO FINAL LIMPIO ---');
console.log(`Total Personal Real DALUPEZMAR: ${remaining.total}`);
console.log(`Activos: ${remaining.active}`);
console.log(`Bajas: ${remaining.inactive}`);
