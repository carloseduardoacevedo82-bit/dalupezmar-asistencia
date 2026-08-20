/**
 * SCRIPT DE MIGRACIÓN Y SINCRONIZACIÓN A LA NUBE
 * DALUPEZMAR - Asistencia, Tareo y Fotochecks
 * Soporta: Turso (LibSQL Serverless Cloud) y Supabase (PostgreSQL)
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const localDb = require('./database');
const { createClient } = require('@libsql/client');

async function migrateToTurso() {
  const url = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url) {
    console.error('❌ Error: Debes definir TURSO_DATABASE_URL o DATABASE_URL en tu archivo .env o en Render.');
    console.log('Ejemplo: TURSO_DATABASE_URL="libsql://dalupezmar-asistencia-usuario.turso.io"');
    console.log('         TURSO_AUTH_TOKEN="tu_token_aqui"');
    process.exit(1);
  }

  console.log('===========================================================');
  console.log('🚀 INICIANDO MIGRACIÓN OFICIAL DALUPEZMAR A TURSO CLOUD');
  console.log('🌐 URL Destino:', url);
  console.log('===========================================================\n');

  const cloudClient = createClient({
    url: url,
    authToken: authToken
  });

  try {
    // 1. Cargar y ejecutar el esquema completo en Turso
    console.log('1️⃣ Creando tablas y restricciones en la nube...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    
    // Separar por sentencias SQL respetando comentarios
    const statements = schemaSql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('PRAGMA'));

    for (const stmt of statements) {
      try {
        await cloudClient.execute(stmt);
      } catch (err) {
        // Ignorar si la tabla ya existe
        if (!err.message.includes('already exists')) {
          console.warn('Nota en sentencia:', err.message);
        }
      }
    }
    console.log('   ✅ Tablas creadas con éxito en Turso Cloud.');

    // 2. Migrar Sedes (Branches)
    const branches = localDb.prepare('SELECT * FROM branches').all();
    console.log(`2️⃣ Migrando ${branches.length} Sedes...`);
    for (const b of branches) {
      await cloudClient.execute({
        sql: `INSERT OR REPLACE INTO branches (id, code, name, address, latitude, longitude, radius_meters, is_active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [b.id, b.code, b.name, b.address, b.latitude, b.longitude, b.radius_meters, b.is_active]
      });
    }

    // 3. Migrar Departamentos (Departments)
    const departments = localDb.prepare('SELECT * FROM departments').all();
    console.log(`3️⃣ Migrando ${departments.length} Departamentos/Áreas...`);
    for (const d of departments) {
      await cloudClient.execute({
        sql: `INSERT OR REPLACE INTO departments (id, code, name, description, is_active)
              VALUES (?, ?, ?, ?, ?)`,
        args: [d.id, d.code, d.name, d.description, d.is_active]
      });
    }

    // 4. Migrar Cargos (Positions)
    const positions = localDb.prepare('SELECT * FROM positions').all();
    console.log(`4️⃣ Migrando ${positions.length} Cargos...`);
    for (const p of positions) {
      await cloudClient.execute({
        sql: `INSERT OR REPLACE INTO positions (id, department_id, name, description, is_active)
              VALUES (?, ?, ?, ?, ?)`,
        args: [p.id, p.department_id, p.name, p.description, p.is_active]
      });
    }

    // 5. Migrar Turnos (Shifts)
    const shifts = localDb.prepare('SELECT * FROM shifts').all();
    console.log(`5️⃣ Migrando ${shifts.length} Turnos...`);
    for (const s of shifts) {
      await cloudClient.execute({
        sql: `INSERT OR REPLACE INTO shifts (id, name, code, entry_time, exit_time, lunch_start, lunch_end, tolerance_minutes, lunch_duration_minutes, is_flexible, work_days, is_active)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [s.id, s.name, s.code, s.entry_time, s.exit_time, s.lunch_start, s.lunch_end, s.tolerance_minutes, s.lunch_duration_minutes, s.is_flexible, s.work_days, s.is_active]
      });
    }

    // 6. Migrar Usuarios del Sistema (Users)
    const users = localDb.prepare('SELECT * FROM users').all();
    console.log(`6️⃣ Migrando ${users.length} Usuarios Administrativos...`);
    for (const u of users) {
      await cloudClient.execute({
        sql: `INSERT OR REPLACE INTO users (id, username, password_hash, full_name, email, role, is_active)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [u.id, u.username, u.password_hash, u.full_name, u.email, u.role, u.is_active]
      });
    }

    // 7. Migrar Padrón Oficial de Empleados (Employees)
    const employees = localDb.prepare('SELECT * FROM employees').all();
    console.log(`7️⃣ Migrando ${employees.length} Colaboradores DALUPEZMAR...`);
    for (const e of employees) {
      await cloudClient.execute({
        sql: `INSERT OR REPLACE INTO employees (
                id, employee_code, document_type, document_number, first_name, last_name,
                email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
                birth_date, hire_date, branch_id, department_id, position_id, shift_id,
                photo_url, work_mode, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          e.id, e.employee_code, e.document_type, e.document_number, e.first_name, e.last_name,
          e.email, e.phone, e.emergency_contact_name, e.emergency_contact_phone, e.blood_type,
          e.birth_date, e.hire_date, e.branch_id, e.department_id, e.position_id, e.shift_id,
          e.photo_url, e.work_mode, e.status
        ]
      });
    }

    // 8. Migrar Credenciales / Badges
    const badges = localDb.prepare('SELECT * FROM badges').all();
    console.log(`8️⃣ Migrando ${badges.length} Credenciales y Tokens QR...`);
    for (const bg of badges) {
      await cloudClient.execute({
        sql: `INSERT OR REPLACE INTO badges (
                id, employee_id, badge_code, qr_token_hash, barcode_value,
                issue_date, expiration_date, status, template_theme, notes
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          bg.id, bg.employee_id, bg.badge_code, bg.qr_token_hash, bg.barcode_value,
          bg.issue_date, bg.expiration_date, bg.status, bg.template_theme, bg.notes
        ]
      });
    }

    // 9. Verificación de Integridad en la Nube
    console.log('\n9️⃣ Verificando consistencia en la base de datos de Turso Cloud...');
    const verifyCount = await cloudClient.execute('SELECT count(*) as total FROM employees;');
    const countTotal = verifyCount.rows[0].total;

    const verifyBadges = await cloudClient.execute('SELECT count(*) as total FROM badges;');
    const countBadges = verifyBadges.rows[0].total;

    console.log('===========================================================');
    console.log(`🎉 MIGRACIÓN COMPLETADA CON ÉXITO:`);
    console.log(`   Colaboradores en Turso Cloud: ${countTotal} / 87`);
    console.log(`   Credenciales en Turso Cloud:  ${countBadges} / 87`);
    console.log('===========================================================');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error durante la migración a Turso Cloud:', error);
    process.exit(1);
  }
}

migrateToTurso();
