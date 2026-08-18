const db = require('./database');

console.log('🚀 Iniciando migración de tipos de documento (DNI, CEX, CPP)...');

db.exec('PRAGMA foreign_keys = OFF;');

db.exec(`
  CREATE TABLE employees_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code VARCHAR(20) NOT NULL UNIQUE,
    document_type VARCHAR(10) NOT NULL DEFAULT 'DNI' CHECK (document_type IN ('DNI', 'CEX', 'CE', 'CPP', 'PASAPORTE', 'RUT')),
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
    branch_id INTEGER NOT NULL,
    department_id INTEGER NOT NULL,
    position_id INTEGER NOT NULL,
    shift_id INTEGER NOT NULL,
    photo_url VARCHAR(255),
    work_mode VARCHAR(20) NOT NULL DEFAULT 'PRESENTIAL',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  INSERT INTO employees_new (
    id, employee_code, document_type, document_number, first_name, last_name,
    email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
    birth_date, hire_date, branch_id, department_id, position_id, shift_id,
    photo_url, work_mode, status, created_at, updated_at
  )
  SELECT 
    id, employee_code, document_type, document_number, first_name, last_name,
    email, phone, emergency_contact_name, emergency_contact_phone, blood_type,
    birth_date, hire_date, branch_id, department_id, position_id, shift_id,
    photo_url, work_mode, status, created_at, updated_at
  FROM employees;

  DROP TABLE employees;
  ALTER TABLE employees_new RENAME TO employees;

  CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
  CREATE INDEX IF NOT EXISTS idx_employees_doc ON employees(document_number);
  CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
  CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
  CREATE INDEX IF NOT EXISTS idx_employees_pos ON employees(position_id);
  CREATE INDEX IF NOT EXISTS idx_employees_shift ON employees(shift_id);
`);

db.exec('PRAGMA foreign_keys = ON;');

// Actualizar los 82 empleados según la regla solicitada:
// 8 dígitos = DNI, 9 dígitos = CEX
const employees = db.prepare('SELECT id, document_number FROM employees').all();
let countDNI = 0;
let countCEX = 0;
let countOther = 0;

employees.forEach(emp => {
  const doc = (emp.document_number || '').trim();
  let type = 'DNI';
  if (doc.length === 9) {
    type = 'CEX';
    countCEX++;
  } else if (doc.length === 8) {
    type = 'DNI';
    countDNI++;
  } else {
    type = doc.length > 8 ? 'CEX' : 'DNI';
    countOther++;
  }
  db.prepare('UPDATE employees SET document_type = ?, document_number = ? WHERE id = ?').run(type, doc, emp.id);
});

console.log('✅ Migración y actualización completada con éxito.');
console.log('📄 Total DNI (8 dígitos):', countDNI);
console.log('📄 Total CEX (9 dígitos):', countCEX);
console.log('📄 Otros ajustados:', countOther);

const sampleCEX = db.prepare('SELECT id, employee_code, first_name, last_name, document_type, document_number FROM employees WHERE document_type = "CEX" LIMIT 5').all();
console.log('Ejemplos CEX:', sampleCEX);

const sampleDNI = db.prepare('SELECT id, employee_code, first_name, last_name, document_type, document_number FROM employees WHERE document_type = "DNI" LIMIT 5').all();
console.log('Ejemplos DNI:', sampleDNI);
