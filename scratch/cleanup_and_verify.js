const db = require('../database/database');

// 1. Eliminar cualquier registro de prueba residual
const deleteDemo = db.prepare(`
  DELETE FROM employees 
  WHERE document_number IN ('12345678', '87654321', '11223344', '55667788', '10000001', '10000002')
     OR first_name LIKE '%Demo%' 
     OR last_name LIKE '%Prueba%'
     OR email LIKE '%test@%'
`);
const resDemo = deleteDemo.run();
console.log('Registros de prueba eliminados:', resDemo.changes);

// 2. Lista oficial de Bajas confirmadas por el usuario:
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

// 3. Asegurar estado INACTIVE para las bajas
const updateBaja = db.prepare("UPDATE employees SET status = 'INACTIVE' WHERE document_number = ?");
let bajasCount = 0;
for (const dni of bajasDnis) {
  const info = updateBaja.run(dni);
  if (info.changes > 0) bajasCount++;
}
console.log(`Bajas confirmadas y aplicadas: ${bajasCount}/${bajasDnis.length}`);

// 4. Consolidar WAL a base de datos
db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

// 5. Reporte final
const total = db.prepare('SELECT count(*) as count FROM employees').get().count;
const active = db.prepare("SELECT count(*) as count FROM employees WHERE status = 'ACTIVE'").get().count;
const inactive = db.prepare("SELECT count(*) as count FROM employees WHERE status = 'INACTIVE'").get().count;
const withPhotos = db.prepare("SELECT count(*) as count FROM employees WHERE photo_url IS NOT NULL AND photo_url != '' AND photo_url != '/uploads/photos/default-avatar.png'").get().count;

console.log('\n=============================================');
console.log('📊 REPORTE DE AUDITORÍA FINAL DE PERSONAL:');
console.log(`Total Personal Registrado: ${total}`);
console.log(`Personal Activo (Carpeta Activos): ${active}`);
console.log(`Personal de Baja (Carpeta Bajas): ${inactive}`);
console.log(`Colaboradores con Fotos Reales: ${withPhotos}`);
console.log('=============================================');
