const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./database');

async function init() {
  console.log('🚀 Inicializando esquema de base de datos relacional...');
  
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schemaSql);
  console.log('✅ Tablas e índices creados satisfactoriamente.');

  const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf-8');
  db.exec(seedSql);
  console.log('✅ Datos iniciales (sedes, departamentos, cargos, turnos, empleados) insertados.');

  // Actualizar contraseñas por defecto con hash bcrypt válido ('admin123')
  const defaultHash = bcrypt.hashSync('admin123', 10);
  const updateUsers = db.prepare('UPDATE users SET password_hash = ?');
  updateUsers.run(defaultHash);

  console.log('✅ Usuarios administrativos configurados con contraseña por defecto: "admin123".');
  console.log('🎉 Migración completada con éxito.');
}

if (require.main === module) {
  init().catch(err => {
    console.error('❌ Error al inicializar la base de datos:', err);
    process.exit(1);
  });
}

module.exports = init;
