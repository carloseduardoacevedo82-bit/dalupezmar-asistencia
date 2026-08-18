const http = require('http');
const path = require('path');
const fs = require('fs');
const app = require('./app');
const config = require('./config/config');
const db = require('../database/database');
const initDb = require('../database/initDb');

// Verificar si la base de datos tiene tablas; si no, inicializar automáticamente
try {
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!tableCheck) {
    console.log('⚡ Base de datos no inicializada. Ejecutando migración inicial...');
    initDb();
  }
} catch (err) {
  console.log('⚡ Error al verificar tablas. Ejecutando inicialización...', err.message);
  initDb();
}

// Crear directorios requeridos
const uploadsDir = path.join(__dirname, '../public/uploads/photos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Sincronización y auditoría de personal, puestos y bajas oficiales de DALUPEZMAR
try {
  // 1. Eliminar registros de prueba demo residuales (Camila Lucia, Carlos Mendoza, Valeria Rojas, Diego Vargas, etc.)
  db.prepare(`
    DELETE FROM employees 
    WHERE document_number IN ('45892147', '72314569', '48123908', '70984512', '12345678', '87654321', '11223344', '55667788', '10000001', '10000002')
       OR employee_code IN ('EMP-1001', 'EMP-1002', 'EMP-1003', 'EMP-1004', 'ADM-001', 'DEV-002', 'HR-003', 'OPS-004')
       OR email LIKE '%@globaltech.com'
       OR first_name LIKE '%Camila Lucia%'
       OR first_name LIKE '%Valeria Sofia%'
       OR first_name LIKE '%Diego Alejandro%'
       OR (first_name LIKE '%Carlos Alberto%' AND last_name LIKE '%Mendoza Quispe%')
       OR first_name LIKE '%Demo%' 
       OR last_name LIKE '%Prueba%'
  `).run();

  // Limpiar credenciales / fotochecks huérfanos asociados a esos IDs
  db.prepare(`DELETE FROM badges WHERE employee_id NOT IN (SELECT id FROM employees)`).run();

  // 2. Asegurar existencia de cargos oficiales
  let posTroquelado = db.prepare("SELECT id FROM positions WHERE name = 'TROQUELADO DE ANILLAS'").get();
  if (!posTroquelado) {
    const res = db.prepare("INSERT INTO positions (department_id, name, description, is_active) VALUES (5, 'TROQUELADO DE ANILLAS', 'Operador de Prensa y Troquelado de Anillas', 1)").run();
    posTroquelado = { id: res.lastInsertRowid };
  }

  let posExterior = db.prepare("SELECT id FROM positions WHERE name = 'AREA EXTERIOR'").get();
  if (!posExterior) {
    const res = db.prepare("INSERT INTO positions (department_id, name, description, is_active) VALUES (5, 'AREA EXTERIOR', 'Personal Operativo de Área Exterior y Logística', 1)").run();
    posExterior = { id: res.lastInsertRowid };
  }

  let posGerente = db.prepare("SELECT id FROM positions WHERE name = 'GERENTE GENERAL'").get();
  if (!posGerente) {
    const res = db.prepare("INSERT INTO positions (department_id, name, description, is_active) VALUES (5, 'GERENTE GENERAL', 'Dirección General de la Empresa', 1)").run();
    posGerente = { id: res.lastInsertRowid };
  }

  let posSupervisor = db.prepare("SELECT id FROM positions WHERE name = 'SUPERVISOR GENERAL'").get();
  if (!posSupervisor) {
    const res = db.prepare("INSERT INTO positions (department_id, name, description, is_active) VALUES (5, 'SUPERVISOR GENERAL', 'Supervisión General de Planta y Operaciones', 1)").run();
    posSupervisor = { id: res.lastInsertRowid };
  }

  // 3. Asignar colaboradores de TROQUELADO DE ANILLAS
  const dnisTroquelado = [
    '77699820', // Melanie Corina Altamirano Sanchez
    '77478525', // Segundo Angel Armas Muena
    '41859381', // Jose Bautista Lupuche
    '63401773', // Dempster Cahuaza Muena
    '60948067', // Joel Dario Fernandez Bobadilla
    '70348540', // David Fernandez Venero
    '45606571', // María Elisabeth Flores Ruiz
    '48046198', // Marcos Abel Ochavano Lomas
    '48592444', // Sandra Ortega Narciso
    '62698406', // Rebeca Panaifo Perez
    '75216072', // Sandy Estefany Sanchez Godoy
    '71806451'  // Jean Franco Sanchez Llamoza
  ];
  const updateTroquelado = db.prepare("UPDATE employees SET position_id = ? WHERE document_number = ?");
  dnisTroquelado.forEach(dni => updateTroquelado.run(posTroquelado.id, dni));

  // 4. Asignar colaboradores de ÁREA EXTERIOR
  const dnisExterior = [
    '78706411',  // Richard Apagueño Panaifo
    '43046174',  // Charly Arnold Arevalo Henderson
    '80424858',  // Edwin Cahuaza Vasquez
    '61946516',  // Giancarlo Martin Cornejo Zeña
    '008270860', // Davis Gabriel Gonzalez Fernandez
    '61376102',  // Lourdes Rosa Manrique Romani
    '009424087', // Julio Cesar Medina Risso
    '73119775',  // Leonardo Mozombite Yuyarima
    '45014861',  // Jonathan Roque Bayes
    '61089730'   // Felipe Rosales Chavez
  ];
  const updateExterior = db.prepare("UPDATE employees SET position_id = ? WHERE document_number = ?");
  dnisExterior.forEach(dni => updateExterior.run(posExterior.id, dni));

  // 5. Asignar Gerencia y Supervisores
  const updateGerente = db.prepare("UPDATE employees SET position_id = ? WHERE document_number = ?");
  ['78019216', '80184449'].forEach(dni => updateGerente.run(posGerente.id, dni));

  const updateSup = db.prepare("UPDATE employees SET position_id = ? WHERE document_number = ?");
  ['005704276', '003011701'].forEach(dni => updateSup.run(posSupervisor.id, dni));

  // 6. Establecer el estado INACTIVE para los 8 trabajadores dados de baja procesados
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

  const updateBaja = db.prepare("UPDATE employees SET status = 'INACTIVE' WHERE document_number = ?");
  for (const dni of bajasDnis) {
    updateBaja.run(dni);
  }
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  console.log('✅ Sincronización oficial DALUPEZMAR: Puestos y bajas aplicados con éxito.');
} catch (syncErr) {
  console.log('Nota de sincronización de personal:', syncErr.message);
}

const server = http.createServer(app);

server.listen(config.port, () => {
  console.log('===========================================================');
  console.log(`🚀 SERVIDOR DE ASISTENCIA Y FOTOCHECKS EN LÍNEA`);
  console.log(`🌐 URL Local: http://localhost:${config.port}`);
  console.log(`🏢 Organización: ${config.company.name}`);
  console.log(`🛡️ Entorno: ${config.nodeEnv}`);
  console.log(`⚡ API REST v1: http://localhost:${config.port}/api/v1/health`);
  console.log('===========================================================');
});
