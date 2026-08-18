const db = require('../database/database');

const query = `
  SELECT 
    e.id, 
    e.document_number, 
    e.first_name, 
    e.last_name, 
    p.name as position_name, 
    d.name as department_name, 
    e.status,
    e.photo_url,
    e.created_at
  FROM employees e
  LEFT JOIN positions p ON e.position_id = p.id
  LEFT JOIN departments d ON e.department_id = d.id
  ORDER BY e.id ASC
`;

const rows = db.prepare(query).all();
console.log('TOTAL EMPLEADOS EN DB:', rows.length);
console.log('--- RESUMEN POR ESTADO ---');
const active = rows.filter(r => r.status === 'ACTIVE');
const inactive = rows.filter(r => r.status === 'INACTIVE');
console.log('Activos:', active.length);
console.log('Inactivos / Bajas:', inactive.length);

console.log('\n--- LISTA DE TRABAJADORES DADOS DE BAJA (INACTIVOS) ---');
inactive.forEach(r => {
  console.log(`[ID: ${r.id}] DNI: ${r.document_number} | ${r.first_name} ${r.last_name} | Puesto: ${r.position_name}`);
});

console.log('\n--- VERIFICAR REGISTROS CREADOS COMO PRUEBA ---');
const testKeywords = ['test', 'prueba', 'demo', 'ejemplo', 'juan perez', 'maria gomez'];
const testRows = rows.filter(r => {
  const full = `${r.first_name} ${r.last_name} ${r.document_number}`.toLowerCase();
  return testKeywords.some(kw => full.includes(kw));
});
console.log('Posibles registros de prueba encontrados:', testRows.length);
testRows.forEach(r => console.log(`[TEST ID: ${r.id}] DNI: ${r.document_number} | ${r.first_name} ${r.last_name}`));

