const db = require('../database/database');

const query = `
  SELECT 
    e.id, 
    e.document_number, 
    e.first_name, 
    e.last_name, 
    p.id as position_id,
    p.name as position_name,
    e.status
  FROM employees e
  LEFT JOIN positions p ON e.position_id = p.id
  ORDER BY p.name, e.last_name ASC
`;

const rows = db.prepare(query).all();

console.log('--- RESUMEN POR PUESTO ACTUAL ---');
const byPos = {};
rows.forEach(r => {
  const pos = r.position_name || 'SIN PUESTO';
  if (!byPos[pos]) byPos[pos] = [];
  byPos[pos].push(r);
});

Object.keys(byPos).forEach(pos => {
  console.log(`\n📌 [${pos}] (${byPos[pos].length} colaboradores):`);
  byPos[pos].forEach(e => {
    console.log(`  - [ID: ${e.id}] DNI: ${e.document_number} | ${e.first_name} ${e.last_name} (${e.status})`);
  });
});
