const db = require('./database');
const { generateSecureQrToken, generateBarcodeValue } = require('../src/utils/badgeGenerator');

const rawWorkers = [
  { apellidos: 'Acevedo Mendoza', nombres: 'Carlos Eduardo', dni: '005704276', cargo: 'Supervisor', area: 'Producción' },
  { apellidos: 'Agüero Paredes', nombres: 'Lucia Juana', dni: '20569691', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Apagueño Panaifo', nombres: 'Richard', dni: '78706411', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Arangure Mendez', nombres: 'Wilker Armando', dni: '008622740', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Arevalo Henderson', nombres: 'Charly Arnold', dni: '43046174', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Arimuya Tamani', nombres: 'Deiby Javier', dni: '74927639', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Armas Muena', nombres: 'Segundo Angel', dni: '77478525', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Arotinco Godoy', nombres: 'Andy Gustavo', dni: '76110226', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Asipali Rubio', nombres: 'Jairo Samuel', dni: '61660649', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Bautista Lupuche', nombres: 'Jose', dni: '41859381', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Brito Neiva', nombres: 'Egliannys Yarismar', dni: '006153301', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Cahuaza Muena', nombres: 'Dempster', dni: '63401773', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Cahuaza Vasquez', nombres: 'Edwin', dni: '80424858', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Cardenas Bejarano', nombres: 'Mariana Lizet', dni: '75345441', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Carhuavilca Carbajal', nombres: 'Owen Mickel Ballak', dni: '75406766', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Castro Ubaldo', nombres: 'Mirtha Karina', dni: '40811097', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Cordones Cabeza', nombres: 'Genesis Dayan', dni: '006880093', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Cornejo Zeña', nombres: 'Giancarlo Martin', dni: '61946516', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Cristobal Contreras', nombres: 'Gady', dni: '61134209', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Fernandez Bobadilla', nombres: 'Joel Dario', dni: '60948067', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Fernandez Venero', nombres: 'David', dni: '70348540', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Flores Ruiz', nombres: 'María Elisabeth', dni: '45606571', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Gamboa Rodriguez', nombres: 'Yubeisy Del Valle', dni: '007967214', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Garcia Prieto', nombres: 'Rosario', dni: '43974196', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Gomez Sulca', nombres: 'Luz Blanca', dni: '10499585', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Gomez Sulca', nombres: 'Grady Herlinda', dni: '46099735', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Huarcaya Yaranga', nombres: 'Elizabeth', dni: '44975175', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ipushima Yahuarcani', nombres: 'Rosalinda', dni: '60592404', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Jaen Betancourt', nombres: 'Edwar Daniel', dni: '009521423', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Leon Mejias', nombres: 'Durbis Bismarys', dni: '008935577', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Lopez Acevedo', nombres: 'David Ignacio', dni: '75763467', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Lopez Mozombite', nombres: 'Luz Noemi', dni: '77265489', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Macahuachi Grefa', nombres: 'Delia', dni: '45190108', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Maiz Carbajal', nombres: 'Liliana', dni: '42830778', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Mamani Paredes', nombres: 'Christopher Nelson', dni: '76241177', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Manrique Romani', nombres: 'Lourdes Rosa', dni: '61376102', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Maravi Maldonado', nombres: 'Yorben Wildo', dni: '70333107', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Medina Gamboa', nombres: 'Maria De Los Angeles', dni: '008278987', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Mendez Palma', nombres: 'Miguel Andres', dni: '009559361', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Mendoza Shahuaño', nombres: 'Merlita', dni: '80490280', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Meza Huaymana', nombres: 'Pacsi Brilli', dni: '63038564', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Morales Macahuachi', nombres: 'Mirella', dni: '62719067', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Morales Vilchez', nombres: 'Dalia', dni: '80531382', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Mozombite Yuyarima', nombres: 'Leonardo', dni: '73119775', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Muñoz Gomez', nombres: 'Oscarina De Los Angeles', dni: '007650654', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Nuñez Lazo', nombres: 'Arnold', dni: '72359957', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Oblitas Gonzalez', nombres: 'Daniel George', dni: '76016694', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ochavano Lomas', nombres: 'Marcos Abel', dni: '48046198', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ortega Narciso', nombres: 'Washington Junior', dni: '61378929', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ortega Narciso', nombres: 'Sandra', dni: '48592444', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Paima Chilicasepa', nombres: 'Mariel Naomi', dni: '60427615', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Panaifo Perez', nombres: 'Rebeca', dni: '62698406', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Paredes Pacheco', nombres: 'Maricruz Mariuska', dni: '008474812', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Perez Pereira', nombres: 'Yoseline Yakeline', dni: '007325053', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Prieto Yoris', nombres: 'Stefany Inmaculada', dni: '006917711', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ramos Cahuaza', nombres: 'Brandon', dni: '76763723', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Riega Carnero', nombres: 'Milton Wilber', dni: '30405445', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Rios Vela', nombres: 'Genesis Isabel', dni: '74231928', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Rojas Zambrano', nombres: 'Ender Jose', dni: '009715510', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Roman Alderete', nombres: 'Estefani', dni: '42510041', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Roque Bayes', nombres: 'Jonathan', dni: '45014861', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ruiz Polanco', nombres: 'Iliana Lilibeth', dni: '008165638', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Rustasehenko Calero', nombres: 'Daiam Lissette', dni: '003011701', cargo: 'Supervisor', area: 'Producción' },
  { apellidos: 'Saavedra Diaz', nombres: 'Jesus David', dni: '008706148', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Salazar Mozombite', nombres: 'Ana Lucia', dni: '70782457', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Salazar Romero', nombres: 'Jorge Luis', dni: '10480632', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Salazar Romero', nombres: 'Catalino', dni: '08348653', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Samaniego Ballarta', nombres: 'Jose Antonio', dni: '74726588', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Sanchez Godoy', nombres: 'Sandy Estefany', dni: '75216072', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Sanchez Llamoza', nombres: 'Jean Franco', dni: '71806451', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Santa Cruz Quispe', nombres: 'Amador', dni: '48291534', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Soria Guedes', nombres: 'Balentino Cristoper', dni: '60929731', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Tanchiva Mendoza', nombres: 'Elia', dni: '40511901', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Tanchiva Mendoza', nombres: 'Reddy', dni: '05353645', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Torres Gamarra', nombres: 'Constantino Justiniano', dni: '23676539', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Torres Romero', nombres: 'Joselyn Yoseany', dni: '008642415', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Usquiano Olascuaga', nombres: 'Reymon Favian', dni: '61296965', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Venegas Martinez', nombres: 'Yersi Soley', dni: '007860093', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Yahuarcani Valles', nombres: 'Genesis Pamela', dni: '61194467', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Yaricahua Yuyarima', nombres: 'Karyn', dni: '70581266', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Ynuma Tanchiva', nombres: 'David Jesus', dni: '61267077', cargo: 'Operario Produccion', area: 'Producción' },
  { apellidos: 'Altamirano Sanchez', nombres: 'Melanie Corina', dni: '77699820', cargo: 'Operario Produccion', area: 'Producción' }
];

async function importWorkers() {
  console.log('🚀 Iniciando importación del personal real de DALUPEZMAR SERVICIOS INDUSTRIALES...');

  // 1. Asegurar Departamento de Producción
  let dept = db.prepare("SELECT id FROM departments WHERE name = 'Producción' OR code = 'DEP-PROD'").get();
  if (!dept) {
    const res = db.prepare("INSERT INTO departments (code, name, description, is_active) VALUES ('DEP-PROD', 'Producción', 'Área de Operaciones y Procesos Industriales', 1)").run();
    dept = { id: res.lastInsertRowid };
  }

  // 2. Asegurar Cargos: Supervisor y Operario Produccion
  let posSupervisor = db.prepare("SELECT id FROM positions WHERE name = 'Supervisor' AND department_id = ?").get(dept.id);
  if (!posSupervisor) {
    const res = db.prepare("INSERT INTO positions (department_id, name, description, is_active) VALUES (?, 'Supervisor', 'Supervisión de Planta y Control de Calidad', 1)").run(dept.id);
    posSupervisor = { id: res.lastInsertRowid };
  }

  let posOperario = db.prepare("SELECT id FROM positions WHERE (name = 'Operario Produccion' OR name = 'Operario') AND department_id = ?").get(dept.id);
  if (!posOperario) {
    const res = db.prepare("INSERT INTO positions (department_id, name, description, is_active) VALUES (?, 'Operario Produccion', 'Operador de Planta y Línea de Producción', 1)").run(dept.id);
    posOperario = { id: res.lastInsertRowid };
  }

  // 3. Sede Principal DALUPEZMAR Callao
  let branch = db.prepare("SELECT id FROM branches WHERE code = 'SED-CALLAO' OR name LIKE '%Dalupezmar%'").get();
  if (!branch) {
    const res = db.prepare("INSERT INTO branches (code, name, address, latitude, longitude, radius_meters, is_active) VALUES ('SED-CALLAO', 'Planta Principal DALUPEZMAR', 'Av. Industrial 500, Callao', -12.045278, -77.112222, 300, 1)").run();
    branch = { id: res.lastInsertRowid };
  }

  // 4. Turno Productivo (07:00 a 16:00)
  let shift = db.prepare("SELECT id FROM shifts WHERE code = 'TUR-PROD-DAL'").get();
  if (!shift) {
    const res = db.prepare("INSERT INTO shifts (name, code, entry_time, exit_time, lunch_start, lunch_end, tolerance_minutes, lunch_duration_minutes, is_flexible, is_active) VALUES ('Turno Producción DALUPEZMAR (07:00 - 16:00)', 'TUR-PROD-DAL', '07:00:00', '16:00:00', '12:00:00', '13:00:00', 15, 60, 0, 1)").run();
    shift = { id: res.lastInsertRowid };
  }

  let insertedCount = 0;
  let updatedCount = 0;

  const insertEmpStmt = db.prepare(`
    INSERT INTO employees (
      employee_code, document_type, document_number, first_name, last_name,
      email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
      hire_date, branch_id, department_id, position_id, shift_id, photo_url, work_mode, status
    ) VALUES (?, 'DNI', ?, ?, ?, ?, '+51 900000000', 'Contacto Familiar', '+51 911111111', 'O+', '2024-01-01', ?, ?, ?, ?, '/uploads/photos/default-avatar.png', 'PRESENTIAL', 'ACTIVE')
  `);

  const insertBadgeStmt = db.prepare(`
    INSERT INTO badges (
      employee_id, badge_code, qr_token_hash, barcode_value,
      issue_date, expiration_date, status, template_theme
    ) VALUES (?, ?, ?, ?, '2026-01-01', '2028-12-31', 'ACTIVE', 'DALUPEZMAR_OFFICIAL')
  `);

  for (let i = 0; i < rawWorkers.length; i++) {
    const w = rawWorkers[i];
    const docClean = String(w.dni).trim();
    const isSupervisor = w.cargo.toLowerCase().includes('supervisor');
    const posId = isSupervisor ? posSupervisor.id : posOperario.id;
    const empCode = `DAL-${(1000 + i + 1)}`;
    const email = `${w.nombres.split(' ')[0].toLowerCase()}.${w.apellidos.split(' ')[0].toLowerCase()}@dalupezmar.com`.replace(/ñ/g, 'n').replace(/á|é|í|ó|ú/g, 'a');

    const existing = db.prepare("SELECT id FROM employees WHERE document_number = ?").get(docClean);

    let empId;
    if (existing) {
      db.prepare(`
        UPDATE employees SET
          first_name = ?, last_name = ?, branch_id = ?, department_id = ?, position_id = ?, shift_id = ?, status = 'ACTIVE'
        WHERE id = ?
      `).run(w.nombres.trim(), w.apellidos.trim(), branch.id, dept.id, posId, shift.id, existing.id);
      empId = existing.id;
      updatedCount++;
    } else {
      const res = insertEmpStmt.run(
        empCode,
        docClean,
        w.nombres.trim(),
        w.apellidos.trim(),
        email,
        branch.id,
        dept.id,
        posId,
        shift.id
      );
      empId = res.lastInsertRowid;
      insertedCount++;
    }

    // Asegurar fotocheck activo con tema DALUPEZMAR_OFFICIAL
    const existingBadge = db.prepare("SELECT id FROM badges WHERE employee_id = ? AND status = 'ACTIVE'").get(empId);
    if (!existingBadge) {
      const qrHash = generateSecureQrToken(empId, empCode);
      const barcodeVal = generateBarcodeValue(docClean);
      insertBadgeStmt.run(empId, `BADGE-${empCode}`, qrHash, barcodeVal);
    } else {
      db.prepare("UPDATE badges SET template_theme = 'DALUPEZMAR_OFFICIAL' WHERE id = ?").run(existingBadge.id);
    }
  }

  console.log(`✅ ¡Importación completada!`);
  console.log(`📊 Nuevos colaboradores registrados: ${insertedCount}`);
  console.log(`🔄 Colaboradores actualizados: ${updatedCount}`);
  console.log(`🪪 Total de colaboradores en DALUPEZMAR: ${rawWorkers.length}`);
}

importWorkers().catch(err => {
  console.error('Error importando trabajadores:', err);
});
