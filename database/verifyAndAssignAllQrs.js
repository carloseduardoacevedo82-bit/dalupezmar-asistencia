const db = require('./database');
const { generateSecureQrToken, generateBarcodeValue } = require('../src/utils/badgeGenerator');

function ensureAllWorkersHavePersonalQr() {
  console.log('🔍 Verificando asignación de Códigos QR Personales a todos los trabajadores...');

  const employees = db.prepare('SELECT id, employee_code, document_number, first_name, last_name, status FROM employees').all();
  let createdBadges = 0;
  let verifiedBadges = 0;

  const findBadge = db.prepare("SELECT id, qr_token_hash FROM badges WHERE employee_id = ? AND status = 'ACTIVE'");
  const insertBadge = db.prepare(`
    INSERT INTO badges (
      employee_id, badge_code, qr_token_hash, barcode_value,
      issue_date, expiration_date, status, template_theme
    ) VALUES (?, ?, ?, ?, '2026-01-01', '2028-12-31', 'ACTIVE', 'DALUPEZMAR_OFFICIAL')
  `);

  for (const emp of employees) {
    const activeBadge = findBadge.get(emp.id);

    if (!activeBadge || !activeBadge.qr_token_hash) {
      const qrHash = generateSecureQrToken(emp.id, emp.employee_code);
      const barcodeVal = generateBarcodeValue(emp.document_number);
      insertBadge.run(emp.id, `BADGE-${emp.employee_code}`, qrHash, barcodeVal);
      createdBadges++;
    } else {
      verifiedBadges++;
    }
  }

  console.log(`✅ Total trabajadores inspeccionados: ${employees.length}`);
  console.log(`🛡️ Credenciales QR activas verificadas: ${verifiedBadges}`);
  console.log(`🆕 Nuevos Códigos QR personales generados: ${createdBadges}`);
  console.log('🎉 100% de los colaboradores cuentan con Código QR Personal Único.');
}

ensureAllWorkersHavePersonalQr();
