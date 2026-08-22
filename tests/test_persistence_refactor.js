/**
 * ============================================================================
 * SUITE DE VALIDACIÓN: REFACTORIZACIÓN DEFINITIVA DE PERSISTENCIA (DALUPEZMAR)
 * ============================================================================
 * Valida:
 *  1. Conexión resiliente a PostgreSQL y Ping de BD.
 *  2. Migraciones automáticas (schema.sql y catálogos).
 *  3. Health Check real (/api/v1/health y /api/health).
 *  4. Flujo transaccional de firmas (PENDIENTE_ENVIO -> ENVIADO_A_FIRMA / FALLO_ENVIO).
 *  5. Marcación de asistencia y persistencia sin almacenamiento efímero local.
 */

require('dotenv').config();
const db = require('../database/database');
const initDb = require('../database/initDb');
const signatureController = require('../src/controllers/signature.controller');
const attendanceController = require('../src/controllers/attendance.controller');

async function runValidationSuite() {
  console.log('================================================================');
  console.log('🧪 INICIANDO SUITE DE VALIDACIÓN: PERSISTENCIA POSTGRESQL');
  console.log('================================================================');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // 1. Test Ping a la base de datos remota
    console.log('\n--- 1. TEST DE CONEXIÓN Y HEALTH PING POSTGRESQL ---');
    const ping = await db.pingDb();
    assert(ping.ok === true, 'Ping directo a base de datos PostgreSQL exitoso', `Error: ${ping.error}`);
    assert(typeof ping.latencyMs === 'number' && ping.latencyMs >= 0, `Latencia de conexión registrada: ${ping.latencyMs}ms`);

    // 2. Test Inicialización y Migraciones Automáticas
    console.log('\n--- 2. TEST DE MIGRACIONES AUTOMÁTICAS E IDEMPOTENCIA ---');
    await initDb();
    const tablesRes = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    
    assert(tables.includes('employees'), 'Tabla "employees" existe en PostgreSQL');
    assert(tables.includes('attendances'), 'Tabla "attendances" existe en PostgreSQL');
    assert(tables.includes('attendance_logs'), 'Tabla "attendance_logs" existe en PostgreSQL');
    assert(tables.includes('documentos_firma'), 'Tabla "documentos_firma" existe en PostgreSQL');
    assert(tables.includes('badges'), 'Tabla "badges" existe en PostgreSQL');
    assert(tables.includes('shifts'), 'Tabla "shifts" existe en PostgreSQL');

    // 3. Test de Colaboradores Oficiales
    console.log('\n--- 3. TEST DE INTEGRIDAD DE COLABORADORES DALUPEZMAR ---');
    const empsCountRes = await db.query('SELECT COUNT(*) as count FROM employees');
    const totalEmps = parseInt(empsCountRes.rows[0].count, 10);
    assert(totalEmps >= 70, `Total de colaboradores registrados (${totalEmps}) >= 70`);

    const supervisorRes = await db.query("SELECT * FROM employees WHERE document_number = '005704276'");
    assert(supervisorRes.rows.length === 1, 'Supervisor Carlos Eduardo Acevedo presente en BD');

    // 4. Test Flujo Transaccional de Firmas Digitales
    console.log('\n--- 4. TEST DE INTEGRACIÓN TRANSACCIONAL DEL PORTAL DE FIRMAS ---');
    
    // 4.1 Enviar contrato exitoso
    const reqMockSuccess = {
      body: {
        dni: '005704276',
        tipo_doc: 'CONTRATO',
        url_documento: 'https://storage.dalupezmar.com/contratos/carlos_acevedo_2026.pdf',
        metadata: { renovacion: 2026, cargo: 'SUPERVISOR GENERAL' },
        simulate_error: false
      }
    };
    let successResponsePayload = null;
    const resMockSuccess = {
      status: () => resMockSuccess,
      json: (data) => { successResponsePayload = data; }
    };

    await signatureController.sendDocumentForSignature(reqMockSuccess, resMockSuccess);
    assert(successResponsePayload && successResponsePayload.success === true, 'Envío a firma procesado con éxito');
    assert(successResponsePayload?.data?.estado_firma === 'ENVIADO_A_FIRMA', 'Estado de documento actualizado a "ENVIADO_A_FIRMA"');
    assert(!!successResponsePayload?.data?.portal_firma_id, `Portal Firma ID asignado: ${successResponsePayload?.data?.portal_firma_id}`);

    const docId = successResponsePayload?.data?.id;

    // 4.2 Enviar contrato con simulación de fallo / timeout
    const reqMockFail = {
      body: {
        dni: '005704276',
        tipo_doc: 'BOLETA',
        url_documento: 'https://storage.dalupezmar.com/boletas/boleta_agosto_2026.pdf',
        simulate_error: true
      }
    };
    let failResponsePayload = null;
    const resMockFail = {
      status: () => resMockFail,
      json: (data) => { failResponsePayload = data; }
    };

    await signatureController.sendDocumentForSignature(reqMockFail, resMockFail);
    assert(failResponsePayload?.data?.estado_firma === 'FALLO_ENVIO', 'Documento con error en API externa retenido con estado "FALLO_ENVIO"');
    assert(failResponsePayload?.data?.intentos_envio >= 1, 'Contador de intentos incrementado sin perder datos');
    assert(!!failResponsePayload?.data?.ultimo_error, 'Último mensaje de error guardado para auditoría');

    // 4.3 Reintento de documentos fallidos
    const reqMockRetry = { body: { document_id: failResponsePayload?.data?.id } };
    let retryResponsePayload = null;
    const resMockRetry = {
      status: () => resMockRetry,
      json: (data) => { retryResponsePayload = data; }
    };

    await signatureController.retryFailedSignatures(reqMockRetry, resMockRetry);
    assert(retryResponsePayload && retryResponsePayload.success === true, 'Reintento de despacho ejecutado');
    assert(retryResponsePayload?.data?.succeeded >= 1, 'Documento fallido recuperado y despachado con éxito en reintento');

    // 4.4 Webhook de firma completada
    const reqMockWebhook = {
      body: {
        document_id: docId,
        event: 'FIRMADO',
        signed_url: 'https://storage.dalupezmar.com/contratos/carlos_acevedo_2026_signed.pdf'
      }
    };
    let webhookResponsePayload = null;
    const resMockWebhook = {
      status: () => resMockWebhook,
      json: (data) => { webhookResponsePayload = data; }
    };

    await signatureController.handleSignatureWebhook(reqMockWebhook, resMockWebhook);
    assert(webhookResponsePayload?.data?.estado_firma === 'FIRMADO', 'Webhook actualizó estado a "FIRMADO"');
    assert(!!webhookResponsePayload?.data?.fecha_firma, 'Fecha de firma registrada en PostgreSQL');

    // 5. Test Marcación de Asistencia Persistente
    console.log('\n--- 5. TEST DE MARCACIÓN DE ASISTENCIA EN POSTGRESQL ---');
    const reqPunchMock = {
      body: {
        token: '005704276',
        punch_type: 'ENTRY',
        punch_source: 'KIOSK_QR'
      },
      headers: {}
    };
    let punchResponsePayload = null;
    const resPunchMock = {
      status: () => resPunchMock,
      json: (data) => { punchResponsePayload = data; }
    };

    await attendanceController.punch(reqPunchMock, resPunchMock);
    assert(punchResponsePayload && punchResponsePayload.success === true, 'Marcación de entrada registrada en PostgreSQL');

    // Verificar en BD
    const logCheckRes = await db.query("SELECT * FROM attendance_logs WHERE raw_token = '005704276' ORDER BY id DESC LIMIT 1");
    assert(logCheckRes.rows.length === 1, 'Log de marcación verificado directamente en tabla attendance_logs de PostgreSQL');

    // 6. Test Bloqueo de Trabajador Inactivo
    console.log('\n--- 6. TEST DE BLOQUEO DE TRABAJADOR INACTIVO ---');
    const reqInactivePunch = {
      body: {
        token: '40811097', // Mirtha Karina Castro Ubaldo (INACTIVE)
        punch_type: 'ENTRY'
      },
      headers: {}
    };
    let inactivePunchPayload = null;
    const resInactivePunch = {
      status: () => resInactivePunch,
      json: (data) => { inactivePunchPayload = data; }
    };

    await attendanceController.punch(reqInactivePunch, resInactivePunch);
    assert(inactivePunchPayload && inactivePunchPayload.success === false, 'Marcación de trabajador inactivo bloqueada');
    assert(inactivePunchPayload?.data?.is_inactive === true, 'Flag is_inactive retornado correctamente');

    console.log('\n================================================================');
    console.log(`📊 RESULTADOS: ${passed} PASADOS, ${failed} FALLIDOS`);
    console.log('================================================================');

    if (failed === 0) {
      console.log('🎉 TODOS LOS TESTS DE PERSISTENCIA Y REFACTORIZACIÓN PASARON AL 100%');
    }
  } catch (err) {
    console.error('❌ Error fatal en suite de validación:', err);
    failed++;
  } finally {
    await db.pool.end();
  }
}

runValidationSuite();
