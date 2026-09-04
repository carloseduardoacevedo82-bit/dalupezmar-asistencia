/**
 * ============================================================================
 * INICIALIZADOR Y MIGRACIONES DE BASE DE DATOS POSTGRESQL (DALUPEZMAR)
 * ============================================================================
 * Ejecuta el esquema DDL y la sincronización de catálogos y personal en la nube.
 */

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./database');
const { generateSecureQrToken, generateBarcodeValue } = require('../src/utils/badgeGenerator');

const dalupezmarWorkers = [
  { apellidos: 'Acevedo Mendoza', nombres: 'Carlos Eduardo', dni: '005704276', cargo: 'SUPERVISOR GENERAL', area: 'Producción' },
  { apellidos: 'Agüero Paredes', nombres: 'Lucia Juana', dni: '20569691', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Apagueño Panaifo', nombres: 'Richard', dni: '78706411', cargo: 'AREA EXTERIOR', area: 'Producción' },
  { apellidos: 'Arangure Mendez', nombres: 'Wilker Armando', dni: '008622740', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Arevalo Henderson', nombres: 'Charly Arnold', dni: '43046174', cargo: 'AREA EXTERIOR', area: 'Producción' },
  { apellidos: 'Arimuya Tamani', nombres: 'Deiby Javier', dni: '74927639', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Armas Muena', nombres: 'Segundo Angel', dni: '77478525', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción' },
  { apellidos: 'Arotinco Godoy', nombres: 'Andy Gustavo', dni: '76110226', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Asipali Rubio', nombres: 'Jairo Samuel', dni: '61660649', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Bautista Lupuche', nombres: 'Jose', dni: '41859381', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción' },
  { apellidos: 'Brito Neiva', nombres: 'Egliannys Yarismar', dni: '006153301', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Cahuaza Muena', nombres: 'Dempster', dni: '63401773', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción' },
  { apellidos: 'Cahuaza Vasquez', nombres: 'Edwin', dni: '80424858', cargo: 'AREA EXTERIOR', area: 'Producción' },
  { apellidos: 'Cardenas Bejarano', nombres: 'Mariana Lizet', dni: '75345441', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Carhuavilca Carbajal', nombres: 'Owen Mickel Ballak', dni: '75406766', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Castro Ubaldo', nombres: 'Mirtha Karina', dni: '40811097', cargo: 'Operario Produccion', area: 'Producción', status: 'INACTIVE' },
  { apellidos: 'Cordones Cabeza', nombres: 'Genesis Dayan', dni: '006880093', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Cornejo Zeña', nombres: 'Giancarlo Martin', dni: '61946516', cargo: 'AREA EXTERIOR', area: 'Producción' },
  { apellidos: 'Cristobal Contreras', nombres: 'Gady', dni: '61134209', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Fernandez Bobadilla', nombres: 'Joel Dario', dni: '60948067', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción', status: 'INACTIVE' },
  { apellidos: 'Fernandez Venero', nombres: 'David', dni: '70348540', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción' },
  { apellidos: 'Flores Ruiz', nombres: 'María Elisabeth', dni: '45606571', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción' },
  { apellidos: 'Gamboa Rodriguez', nombres: 'Yubeisy Del Valle', dni: '007967214', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Garcia Prieto', nombres: 'Rosario', dni: '43974196', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Gomez Sulca', nombres: 'Luz Blanca', dni: '10499585', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Gomez Sulca', nombres: 'Grady Herlinda', dni: '46099735', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Huarcaya Yaranga', nombres: 'Elizabeth', dni: '44975175', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ipushima Yahuarcani', nombres: 'Rosalinda', dni: '60592404', cargo: 'Operario Produccion', area: 'Producción', status: 'INACTIVE' },
  { apellidos: 'Jaen Betancourt', nombres: 'Edwar Daniel', dni: '009521423', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Leon Mejias', nombres: 'Durbis Bismarys', dni: '008935577', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Lopez Acevedo', nombres: 'David Ignacio', dni: '75763467', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Lopez Mozombite', nombres: 'Luz Noemi', dni: '77265489', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Macahuachi Grefa', nombres: 'Delia', dni: '45190108', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Maiz Carbajal', nombres: 'Liliana', dni: '42830778', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Mamani Paredes', nombres: 'Christopher Nelson', dni: '76241177', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Manrique Romani', nombres: 'Lourdes Rosa', dni: '61376102', cargo: 'AREA EXTERIOR', area: 'Producción' },
  { apellidos: 'Maravi Maldonado', nombres: 'Yorben Wildo', dni: '70333107', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Medina Gamboa', nombres: 'Maria De Los Angeles', dni: '008278987', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Medina Risso', nombres: 'Julio Cesar', dni: '009424087', cargo: 'AREA EXTERIOR', area: 'Producción' },
  { apellidos: 'Mendez Palma', nombres: 'Miguel Andres', dni: '009559361', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Mendoza Shahuaño', nombres: 'Merlita', dni: '80490280', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Meza Huaymana', nombres: 'Pacsi Brilli', dni: '63038564', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Morales Macahuachi', nombres: 'Mirella', dni: '62719067', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Morales Vilchez', nombres: 'Dalia', dni: '80531382', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Mozombite Yuyarima', nombres: 'Leonardo', dni: '73119775', cargo: 'AREA EXTERIOR', area: 'Producción' },
  { apellidos: 'Muñoz Gomez', nombres: 'Oscarina De Los Angeles', dni: '007650654', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Nuñez Lazo', nombres: 'Arnold', dni: '72359957', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Oblitas Gonzalez', nombres: 'Daniel George', dni: '76016694', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ochavano Lomas', nombres: 'Marcos Abel', dni: '48046198', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción' },
  { apellidos: 'Ortega Narciso', nombres: 'Washington Junior', dni: '61378929', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ortega Narciso', nombres: 'Sandra', dni: '48592444', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción' },
  { apellidos: 'Paima Chilicasepa', nombres: 'Mariel Naomi', dni: '60427615', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Panaifo Perez', nombres: 'Rebeca', dni: '62698406', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción' },
  { apellidos: 'Paredes Pacheco', nombres: 'Maricruz Mariuska', dni: '008474812', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Perez Pereira', nombres: 'Yoseline Yakeline', dni: '007325053', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Prieto Yoris', nombres: 'Stefany Inmaculada', dni: '006917711', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ramos Cahuaza', nombres: 'Brandon', dni: '76763723', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Riega Carnero', nombres: 'Milton Wilber', dni: '30405445', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Rios Vela', nombres: 'Genesis Isabel', dni: '74231928', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Rojas Zambrano', nombres: 'Ender Jose', dni: '009715510', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Roman Alderete', nombres: 'Estefani', dni: '42510041', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Roque Bayes', nombres: 'Jonathan', dni: '45014861', cargo: 'AREA EXTERIOR', area: 'Producción' },
  { apellidos: 'Ruiz Polanco', nombres: 'Iliana Lilibeth', dni: '008165638', cargo: 'Operario Produccion', area: 'Producción', status: 'INACTIVE' },
  { apellidos: 'Rustasehenko Calero', nombres: 'Daiam Lissette', dni: '003011701', cargo: 'SUPERVISOR GENERAL', area: 'Producción' },
  { apellidos: 'Saavedra Diaz', nombres: 'Jesus David', dni: '008706148', cargo: 'Operario Produccion', area: 'Producción', status: 'INACTIVE' },
  { apellidos: 'Salazar Mozombite', nombres: 'Ana Lucia', dni: '70782457', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Salazar Romero', nombres: 'Jorge Luis', dni: '10480632', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Salazar Romero', nombres: 'Catalino', dni: '08348653', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Samaniego Ballarta', nombres: 'Jose Antonio', dni: '74726588', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Sanchez Godoy', nombres: 'Sandy Estefany', dni: '75216072', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción', status: 'INACTIVE' },
  { apellidos: 'Sanchez Llamoza', nombres: 'Jean Franco', dni: '71806451', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción' },
  { apellidos: 'Santa Cruz Quispe', nombres: 'Amador', dni: '48291534', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Soria Guedes', nombres: 'Balentino Cristoper', dni: '60929731', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Tanchiva Mendoza', nombres: 'Elia', dni: '40511901', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Tanchiva Mendoza', nombres: 'Reddy', dni: '05353645', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Torres Gamarra', nombres: 'Constantino Justiniano', dni: '23676539', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Torres Romero', nombres: 'Joselyn Yoseany', dni: '008642415', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Usquiano Olascuaga', nombres: 'Reymon Favian', dni: '61296965', cargo: 'Operario Produccion', area: 'Producción', status: 'INACTIVE' },
  { apellidos: 'Venegas Martinez', nombres: 'Yersi Soley', dni: '007860093', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Yahuarcani Valles', nombres: 'Genesis Pamela', dni: '61194467', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Yaricahua Yuyarima', nombres: 'Karyn', dni: '70581266', cargo: 'Operario Produccion', area: 'Producción', status: 'INACTIVE' },
  { apellidos: 'Ynuma Tanchiva', nombres: 'David Jesus', dni: '61267077', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Altamirano Sanchez', nombres: 'Melanie Corina', dni: '77699820', cargo: 'TROQUELADO DE ANILLAS', area: 'Producción' },
  { apellidos: 'Gonzalez Fernandez', nombres: 'Davis Gabriel', dni: '008270860', cargo: 'AREA EXTERIOR', area: 'Producción' },
  { apellidos: 'Rosales Chavez', nombres: 'Felipe', dni: '61089730', cargo: 'AREA EXTERIOR', area: 'Producción' },
  { apellidos: 'Gerencia General', nombres: 'Representante 1', dni: '78019216', cargo: 'GERENTE GENERAL', area: 'Producción' },
  { apellidos: 'Gerencia General', nombres: 'Representante 2', dni: '80184449', cargo: 'GERENTE GENERAL', area: 'Producción' }
];

async function init() {
  console.log('⚡ [PostgreSQL] Verificando y ejecutando migraciones de base de datos...');
  
  // 1. Ejecutar DDL schema.sql
  const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  await db.query(schemaSql);
  console.log('✅ [PostgreSQL] Esquema y tablas verificadas con éxito.');

  // 1.1 Asegurar tabla persistente de fotos de colaboradores (Anti-pérdida en Render)
  await db.query(`
    CREATE TABLE IF NOT EXISTS employee_photos (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER,
      filename VARCHAR(255) UNIQUE NOT NULL,
      mime_type VARCHAR(100) NOT NULL,
      photo_data BYTEA NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_employee_photos_filename ON employee_photos(filename);
    CREATE INDEX IF NOT EXISTS idx_employee_photos_emp_id ON employee_photos(employee_id);
  `);

  // Sincronizar fotos físicas hacia PostgreSQL si no estuvieran ya persistidas
  try {
    const photosDir = path.join(__dirname, '../public/uploads/photos');
    if (fs.existsSync(photosDir)) {
      const photoFiles = fs.readdirSync(photosDir);
      for (const fn of photoFiles) {
        if (fn.startsWith('.')) continue;
        const fullP = path.join(photosDir, fn);
        const ext = path.extname(fn).toLowerCase();
        let mime = 'image/jpeg';
        if (ext === '.png') mime = 'image/png';
        else if (ext === '.webp') mime = 'image/webp';
        else if (ext === '.svg') mime = 'image/svg+xml';

        const buf = fs.readFileSync(fullP);
        await db.query(`
          INSERT INTO employee_photos (filename, mime_type, photo_data)
          VALUES ($1, $2, $3)
          ON CONFLICT (filename) DO NOTHING;
        `, [fn, mime, buf]);
      }
    }
  } catch (syncPhotoErr) {
    console.warn('⚠️ Nota al sincronizar fotos locales:', syncPhotoErr.message);
  }

  // 2. Asegurar Usuarios Administrativos
  const adminPasswordHash = bcrypt.hashSync('admin123', 10);
  const users = [
    { username: 'admin', full_name: 'Administrador General', email: 'admin@dalupezmar.com', role: 'ADMIN' },
    { username: 'rrhh', full_name: 'Coordinador de Talento', email: 'rrhh@dalupezmar.com', role: 'HR' },
    { username: 'kiosco01', full_name: 'Kiosco Recepción Principal', email: 'kiosco@dalupezmar.com', role: 'KIOSK' }
  ];

  for (const u of users) {
    await db.query(`
      INSERT INTO users (username, password_hash, full_name, email, role, is_active)
      VALUES ($1, $2, $3, $4, $5, 1)
      ON CONFLICT (username) DO NOTHING;
    `, [u.username, adminPasswordHash, u.full_name, u.email, u.role]);
  }

  // 3. Asegurar Sedes
  const branches = [
    { code: 'SED-PECEPE', name: 'PECEPE S.A.C.', address: 'Mza. 7 Lote. 27 Urb. Macropolis Etapa 2 Lima - Lima - Lurin', lat: -12.235619, lng: -76.810871, radius: 50 },
    { code: 'SED-01', name: 'DALUPEZMAR Planta Principal', address: 'Planta Operativa Industrial, Lima', lat: -12.045278, lng: -77.112222, radius: 350 },
    { code: 'SED-02', name: 'Sede Central Administrativa', address: 'Oficina Central, Lima', lat: -12.089722, lng: -77.021111, radius: 50 },
    { code: 'SED-03', name: 'Operación Remota / Campo', address: 'Marcación Móvil Georreferenciada', lat: 0.0, lng: 0.0, radius: 50000 }
  ];

  for (const b of branches) {
    await db.query(`
      INSERT INTO branches (code, name, address, latitude, longitude, radius_meters, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, 1)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        address = EXCLUDED.address,
        radius_meters = EXCLUDED.radius_meters;
    `, [b.code, b.name, b.address, b.lat, b.lng, b.radius]);
  }

  // 4. Asegurar Departamentos
  const departments = [
    { code: 'DEP-TI', name: 'Tecnología e Innovación', desc: 'Sistemas y Desarrollo TI' },
    { code: 'DEP-RH', name: 'Recursos Humanos y Talento', desc: 'Gestión de Talento Humano y Asistencia' },
    { code: 'DEP-OP', name: 'Operaciones y Logística', desc: 'Logística y Mantenimiento' },
    { code: 'DEP-FN', name: 'Administración y Finanzas', desc: 'Finanzas y Contabilidad' },
    { code: 'DEP-PROD', name: 'Producción', desc: 'Área de Operaciones y Procesos Industriales' }
  ];

  for (const d of departments) {
    await db.query(`
      INSERT INTO departments (code, name, description, is_active)
      VALUES ($1, $2, $3, 1)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description;
    `, [d.code, d.name, d.desc]);
  }

  // 5. Asegurar Cargos / Puestos
  const deptProdRes = await db.query("SELECT id FROM departments WHERE code = 'DEP-PROD' LIMIT 1");
  const deptProdId = deptProdRes.rows[0]?.id || 1;

  const positions = [
    { dept: deptProdId, name: 'SUPERVISOR GENERAL' },
    { dept: deptProdId, name: 'Operario Produccion' },
    { dept: deptProdId, name: 'TROQUELADO DE ANILLAS' },
    { dept: deptProdId, name: 'AREA EXTERIOR' },
    { dept: deptProdId, name: 'GERENTE GENERAL' }
  ];

  for (const pos of positions) {
    const posExists = await db.query('SELECT id FROM positions WHERE name = $1 LIMIT 1', [pos.name]);
    if (posExists.rows.length === 0) {
      await db.query(
        'INSERT INTO positions (department_id, name, description, is_active) VALUES ($1, $2, $3, 1)',
        [pos.dept, pos.name, `Cargo oficial ${pos.name}`]
      );
    }
  }

  // 6. Asegurar Turnos Normalizados DALUPEZMAR (Diurno 07:30-19:00 y Nocturno 19:30-07:00)
  const shifts = [
    { code: 'diurno', name: 'Diurno (07:30 - 19:00)', entry: '07:30:00', exit: '19:00:00', lunchStart: '12:30:00', lunchEnd: '13:30:00', tol: 15 },
    { code: 'nocturno', name: 'Nocturno (19:30 - 07:00)', entry: '19:30:00', exit: '07:00:00', lunchStart: '00:30:00', lunchEnd: '01:30:00', tol: 15 }
  ];

  for (const s of shifts) {
    await db.query(`
      INSERT INTO shifts (name, code, entry_time, exit_time, lunch_start, lunch_end, tolerance_minutes, lunch_duration_minutes, is_flexible, work_days, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 60, 0, '1,2,3,4,5,6', 1)
      ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name,
        entry_time = EXCLUDED.entry_time,
        exit_time = EXCLUDED.exit_time,
        is_active = 1;
    `, [s.name, s.code, s.entry, s.exit, s.lunchStart, s.lunchEnd, s.tol]);
  }

  // 7. Asegurar Clientes API
  await db.query(`
    INSERT INTO api_clients (client_name, api_key_hash, permissions, is_active)
    VALUES ('ERP SAP / Planillas RRHH Externa', 'ag_erp_live_key_982347102938471209384', 'READ_ATTENDANCE,WRITE_EMPLOYEE,READ_BADGES', 1)
    ON CONFLICT (api_key_hash) DO NOTHING;
  `);

  // 8. Importar y Sincronizar Colaboradores Oficiales de DALUPEZMAR
  console.log(`👥 [PostgreSQL] Sincronizando ${dalupezmarWorkers.length} colaboradores oficiales...`);

  const posMapRes = await db.query('SELECT id, name FROM positions;');
  const posMap = {};
  for (const row of posMapRes.rows) {
    posMap[row.name] = row.id;
  }

  const branchPlantaRes = await db.query("SELECT id FROM branches WHERE code = 'SED-01' LIMIT 1");
  const branchPlantaId = branchPlantaRes.rows[0]?.id || 1;

  const shiftJrnRes = await db.query("SELECT id FROM shifts WHERE code = 'TUR-JRN-01' LIMIT 1");
  const shiftJrnId = shiftJrnRes.rows[0]?.id || 1;

  let codeCounter = 1001;
  for (const w of dalupezmarWorkers) {
    const docNum = w.dni.trim();
    const docType = docNum.length === 8 ? 'DNI' : (docNum.length === 9 ? 'CE' : 'DNI');
    const posId = posMap[w.cargo] || posMap['Operario Produccion'] || 1;
    const empCode = `EMP-${codeCounter++}`;
    const status = w.status || 'ACTIVE';

    const empRes = await db.query(`
      INSERT INTO employees (
        employee_code, document_type, document_number, first_name, last_name,
        hire_date, branch_id, department_id, position_id, shift_id, photo_url, work_mode, status
      ) VALUES ($1, $2, $3, $4, $5, '2024-01-01', $6, $7, $8, $9, '/uploads/photos/default-avatar.png', 'PRESENTIAL', $10)
      ON CONFLICT (document_number) DO NOTHING
      RETURNING id, employee_code, document_number, status;
    `, [empCode, docType, docNum, w.nombres.trim(), w.apellidos.trim(), branchPlantaId, deptProdId, posId, shiftJrnId, status]);

    const emp = empRes.rows[0];
    if (emp) {
      const qrHash = `AGY_SEC_QR_${emp.employee_code}_${emp.document_number}`;
      const barcodeVal = generateBarcodeValue(emp.document_number);
      const badgeStatus = (emp.status === 'INACTIVE' || emp.status === 'BAJA') ? 'REVOKED' : 'ACTIVE';

      await db.query(`
        INSERT INTO badges (
          employee_id, badge_code, qr_token_hash, barcode_value,
          issue_date, expiration_date, status, template_theme
        ) VALUES ($1, $2, $3, $4, '2026-01-01', '2028-12-31', $5, 'DALUPEZMAR_OFFICIAL')
        ON CONFLICT (badge_code) DO UPDATE SET
          qr_token_hash = EXCLUDED.qr_token_hash,
          barcode_value = EXCLUDED.barcode_value,
          status = EXCLUDED.status;
      `, [emp.id, `BADGE-${emp.employee_code}`, qrHash, barcodeVal, badgeStatus]);
    }
  }

  console.log('🎉 [PostgreSQL] Inicialización y migraciones completadas exitosamente.');
}

if (require.main === module) {
  init().then(() => process.exit(0)).catch(err => {
    console.error('❌ Error al inicializar base de datos:', err);
    process.exit(1);
  });
}

module.exports = init;
