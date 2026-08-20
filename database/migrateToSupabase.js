/**
 * SCRIPT OFICIAL DE MIGRACIÓN A SUPABASE (POSTGRESQL CLOUD)
 * DALUPEZMAR - Asistencia, Tareo y Fotochecks
 */

require('dotenv').config();
const { Client } = require('pg');
const localDb = require('./database');

const SUPABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.vsqqvpejgmamcwqpdzze:Dalupezmar2026!@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

async function migrate() {
  console.log('===========================================================');
  console.log('🚀 INICIANDO MIGRACIÓN AUTOMÁTICA DALUPEZMAR A SUPABASE');
  console.log('🌐 Host: aws-0-us-east-1.pooler.supabase.com (PostgreSQL)');
  console.log('===========================================================\n');

  const client = new Client({
    connectionString: SUPABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado exitosamente a la base de datos de Supabase.\n');

    // 1. Crear Tablas en PostgreSQL
    console.log('1️⃣ Creando tablas y restricciones en PostgreSQL...');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        email VARCHAR(100) UNIQUE,
        role VARCHAR(20) NOT NULL DEFAULT 'HR',
        is_active INTEGER NOT NULL DEFAULT 1,
        last_login TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS branches (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        address VARCHAR(255) NOT NULL,
        latitude NUMERIC(10, 8),
        longitude NUMERIC(11, 8),
        radius_meters INTEGER NOT NULL DEFAULT 150,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        code VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS positions (
        id SERIAL PRIMARY KEY,
        department_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS shifts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(80) NOT NULL,
        code VARCHAR(20) NOT NULL UNIQUE,
        entry_time VARCHAR(20) NOT NULL,
        exit_time VARCHAR(20) NOT NULL,
        lunch_start VARCHAR(20),
        lunch_end VARCHAR(20),
        tolerance_minutes INTEGER NOT NULL DEFAULT 15,
        lunch_duration_minutes INTEGER NOT NULL DEFAULT 60,
        is_flexible INTEGER NOT NULL DEFAULT 0,
        work_days VARCHAR(30) NOT NULL DEFAULT '1,2,3,4,5',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        employee_code VARCHAR(20) NOT NULL UNIQUE,
        document_type VARCHAR(10) NOT NULL DEFAULT 'DNI',
        document_number VARCHAR(20) NOT NULL UNIQUE,
        first_name VARCHAR(80) NOT NULL,
        last_name VARCHAR(80) NOT NULL,
        email VARCHAR(100),
        phone VARCHAR(30),
        emergency_contact_name VARCHAR(120),
        emergency_contact_phone VARCHAR(30),
        blood_type VARCHAR(10),
        birth_date DATE,
        hire_date DATE NOT NULL,
        branch_id INTEGER NOT NULL DEFAULT 1,
        department_id INTEGER NOT NULL DEFAULT 1,
        position_id INTEGER NOT NULL DEFAULT 1,
        shift_id INTEGER NOT NULL DEFAULT 1,
        photo_url VARCHAR(255),
        work_mode VARCHAR(20) NOT NULL DEFAULT 'PRESENTIAL',
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS badges (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        badge_code VARCHAR(50) NOT NULL UNIQUE,
        qr_token_hash VARCHAR(255) NOT NULL,
        barcode_value VARCHAR(50) NOT NULL,
        issue_date DATE NOT NULL,
        expiration_date DATE,
        status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
        template_theme VARCHAR(30) NOT NULL DEFAULT 'CORPORATE_BLUE',
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS attendances (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        attendance_date DATE NOT NULL,
        shift_id INTEGER NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PRESENT',
        expected_entry VARCHAR(20) NOT NULL,
        expected_exit VARCHAR(20) NOT NULL,
        first_entry_time VARCHAR(50),
        lunch_start_time VARCHAR(50),
        lunch_end_time VARCHAR(50),
        last_exit_time VARCHAR(50),
        total_minutes_worked INTEGER NOT NULL DEFAULT 0,
        total_minutes_late INTEGER NOT NULL DEFAULT 0,
        total_minutes_overtime INTEGER NOT NULL DEFAULT 0,
        is_complete INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (employee_id, attendance_date)
      );

      CREATE TABLE IF NOT EXISTS attendance_logs (
        id SERIAL PRIMARY KEY,
        attendance_id INTEGER,
        employee_id INTEGER NOT NULL,
        punch_type VARCHAR(20) NOT NULL,
        punch_time VARCHAR(50) NOT NULL,
        punch_source VARCHAR(20) NOT NULL DEFAULT 'KIOSK_QR',
        latitude NUMERIC(10, 8),
        longitude NUMERIC(11, 8),
        is_within_geofence INTEGER DEFAULT 1,
        device_info VARCHAR(255),
        ip_address VARCHAR(45),
        raw_token VARCHAR(255),
        verification_status VARCHAR(20) NOT NULL DEFAULT 'VERIFIED',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS justifications (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        attendance_id INTEGER,
        reason_type VARCHAR(30) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        description TEXT NOT NULL,
        document_url VARCHAR(255),
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        reviewed_by INTEGER,
        reviewed_at TIMESTAMP,
        reviewer_comment TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        action VARCHAR(50) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(50),
        details TEXT,
        ip_address VARCHAR(45),
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('   ✅ Tablas creadas con éxito.');

    // 2. Migrar Sedes
    const branches = localDb.prepare('SELECT * FROM branches').all();
    console.log(`2️⃣ Migrando ${branches.length} Sedes...`);
    for (const b of branches) {
      await client.query(`
        INSERT INTO branches (id, code, name, address, latitude, longitude, radius_meters, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude;
      `, [b.id, b.code, b.name, b.address, b.latitude, b.longitude, b.radius_meters, b.is_active]);
    }

    // 3. Migrar Departamentos
    const departments = localDb.prepare('SELECT * FROM departments').all();
    console.log(`3️⃣ Migrando ${departments.length} Departamentos...`);
    for (const d of departments) {
      await client.query(`
        INSERT INTO departments (id, code, name, description, is_active)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
      `, [d.id, d.code, d.name, d.description, d.is_active]);
    }

    // 4. Migrar Cargos
    const positions = localDb.prepare('SELECT * FROM positions').all();
    console.log(`4️⃣ Migrando ${positions.length} Cargos...`);
    for (const p of positions) {
      await client.query(`
        INSERT INTO positions (id, department_id, name, description, is_active)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, department_id = EXCLUDED.department_id;
      `, [p.id, p.department_id, p.name, p.description, p.is_active]);
    }

    // 5. Migrar Turnos
    const shifts = localDb.prepare('SELECT * FROM shifts').all();
    console.log(`5️⃣ Migrando ${shifts.length} Turnos...`);
    for (const s of shifts) {
      await client.query(`
        INSERT INTO shifts (id, name, code, entry_time, exit_time, lunch_start, lunch_end, tolerance_minutes, lunch_duration_minutes, is_flexible, work_days, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (code) DO UPDATE SET entry_time = EXCLUDED.entry_time, exit_time = EXCLUDED.exit_time, tolerance_minutes = EXCLUDED.tolerance_minutes;
      `, [s.id, s.name, s.code, s.entry_time, s.exit_time, s.lunch_start, s.lunch_end, s.tolerance_minutes, s.lunch_duration_minutes, s.is_flexible, s.work_days, s.is_active]);
    }

    // 6. Migrar Usuarios
    const users = localDb.prepare('SELECT * FROM users').all();
    console.log(`6️⃣ Migrando ${users.length} Usuarios...`);
    for (const u of users) {
      await client.query(`
        INSERT INTO users (id, username, password_hash, full_name, email, role, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (username) DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash;
      `, [u.id, u.username, u.password_hash, u.full_name, u.email, u.role, u.is_active]);
    }

    // 7. Migrar 87 Empleados Oficiales
    const employees = localDb.prepare('SELECT * FROM employees').all();
    console.log(`7️⃣ Migrando ${employees.length} Colaboradores DALUPEZMAR a Supabase...`);
    for (const e of employees) {
      await client.query(`
        INSERT INTO employees (
          id, employee_code, document_type, document_number, first_name, last_name,
          email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
          birth_date, hire_date, branch_id, department_id, position_id, shift_id,
          photo_url, work_mode, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (document_number) DO UPDATE SET
          employee_code = EXCLUDED.employee_code,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          status = EXCLUDED.status,
          department_id = EXCLUDED.department_id,
          position_id = EXCLUDED.position_id,
          shift_id = EXCLUDED.shift_id;
      `, [
        e.id, e.employee_code, e.document_type, e.document_number, e.first_name, e.last_name,
        e.email, e.phone, e.emergency_contact_name, e.emergency_contact_phone, e.blood_type,
        e.birth_date, e.hire_date, e.branch_id || 1, e.department_id || 1, e.position_id || 1, e.shift_id || 1,
        e.photo_url, e.work_mode, e.status
      ]);
    }

    // 8. Migrar Credenciales / Badges
    const badges = localDb.prepare('SELECT * FROM badges').all();
    console.log(`8️⃣ Migrando ${badges.length} Credenciales y Tokens QR a Supabase...`);
    for (const bg of badges) {
      await client.query(`
        INSERT INTO badges (
          id, employee_id, badge_code, qr_token_hash, barcode_value,
          issue_date, expiration_date, status, template_theme, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (badge_code) DO UPDATE SET
          qr_token_hash = EXCLUDED.qr_token_hash,
          barcode_value = EXCLUDED.barcode_value,
          status = EXCLUDED.status;
      `, [
        bg.id, bg.employee_id, bg.badge_code, bg.qr_token_hash, bg.barcode_value,
        bg.issue_date, bg.expiration_date, bg.status, bg.template_theme, bg.notes
      ]);
    }

    // Ajustar secuencias de IDs en PostgreSQL
    await client.query(`SELECT setval('employees_id_seq', (SELECT MAX(id) FROM employees));`);
    await client.query(`SELECT setval('badges_id_seq', (SELECT MAX(id) FROM badges));`);
    await client.query(`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));`);
    await client.query(`SELECT setval('branches_id_seq', (SELECT MAX(id) FROM branches));`);
    await client.query(`SELECT setval('departments_id_seq', (SELECT MAX(id) FROM departments));`);
    await client.query(`SELECT setval('positions_id_seq', (SELECT MAX(id) FROM positions));`);
    await client.query(`SELECT setval('shifts_id_seq', (SELECT MAX(id) FROM shifts));`);

    // 9. Verificación de Integridad
    console.log('\n9️⃣ Verificando consistencia en Supabase Cloud...');
    const empRes = await client.query('SELECT count(*) as total FROM employees;');
    const countTotal = empRes.rows[0].total;

    const badgeRes = await client.query('SELECT count(*) as total FROM badges;');
    const countBadges = badgeRes.rows[0].total;

    const inactiveRes = await client.query("SELECT count(*) as total FROM employees WHERE status = 'INACTIVE';");
    const countInactive = inactiveRes.rows[0].total;

    console.log('===========================================================');
    console.log(`🎉 MIGRACIÓN A SUPABASE COMPLETADA CON ÉXITO:`);
    console.log(`   Colaboradores en Supabase: ${countTotal} / 87`);
    console.log(`   Credenciales en Supabase:  ${countBadges} / 87`);
    console.log(`   Trabajadores de Baja:      ${countInactive} / 8 (Revocados)`);
    console.log('===========================================================');

    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error durante la migración a Supabase:', err);
    await client.end();
    process.exit(1);
  }
}

migrate();
