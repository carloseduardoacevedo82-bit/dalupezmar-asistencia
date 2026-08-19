const db = require('../database/database');
console.log('Statuses count:', db.prepare('SELECT status, count(*) as count FROM employees GROUP BY status').all());
console.log('Inactive employees:', db.prepare("SELECT id, employee_code, document_number, first_name, last_name, status FROM employees WHERE status != 'ACTIVE'").all());
console.log('Total employees:', db.prepare('SELECT count(*) as total FROM employees').get());
