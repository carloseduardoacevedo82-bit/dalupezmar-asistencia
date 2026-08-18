const db = require('./database');
const { generateSecureQrToken, generateBarcodeValue } = require('../src/utils/badgeGenerator');

function ensureAllWorkersHavePersonalQr() {
  console.log('🔍 Sincronizando Códigos QR Personales únicos para todos los trabajadores...');

  // Limpiar badges existentes para evitar duplicados
  db.prepare('DELETE FROM badges').run();

  const employees = db.prepare('SELECT id, employee_code, document_number, first_name, last_name, status FROM employees').all();
  let createdBadges = 0;

  const insertBadge = db.prepare(`
    INSERT INTO badges (
      employee_id, badge_code, qr_token_hash, barcode_value,
      issue_date, expiration_date, status, template_theme
    ) VALUES (?, ?, ?, ?, '2026-01-01', '2028-12-31', 'ACTIVE', 'DALUPEZMAR_OFFICIAL')
  `);

  for (const emp of employees) {
    const qrHash = `AGY_SEC_QR_${emp.employee_code}_${emp.document_number}`;
    const barcodeVal = emp.document_number;
    const badgeCode = `BADGE-${emp.employee_code}`;

    insertBadge.run(emp.id, badgeCode, qrHash, barcodeVal);
    createdBadges++;
  }

  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  console.log(`✅ Sincronizadas ${createdBadges} Credenciales Oficiales con Códigos QR y de Barras únicos.`);
}

ensureAllWorkersHavePersonalQr();
