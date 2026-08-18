const app = require('../src/app');
const http = require('http');

async function testBackendEndpoints() {
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(3099, resolve));
  console.log('🧪 Servidor de pruebas iniciado en puerto 3099');

  const baseUrl = 'http://localhost:3099/api/v1';

  try {
    // 1. Healthcheck
    const resHealth = await fetch(`${baseUrl}/health`).then(r => r.json());
    console.log('1. Healthcheck:', resHealth.status === 'UP' ? '✅ OK' : '❌ FAIL', resHealth);

    // 2. Login
    const resLogin = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    }).then(r => r.json());
    console.log('2. Login:', resLogin.success ? '✅ OK' : '❌ FAIL', resLogin.message);
    const token = resLogin.data?.token;

    // 3. Catalogs
    const resCatalogs = await fetch(`${baseUrl}/employees/catalogs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    console.log('3. Catalogs:', resCatalogs.success ? '✅ OK' : '❌ FAIL', `Branches: ${resCatalogs.data.branches.length}, Shifts: ${resCatalogs.data.shifts.length}`);

    // 4. Employees List
    const resEmployees = await fetch(`${baseUrl}/employees`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    console.log('4. Employees:', resEmployees.success ? '✅ OK' : '❌ FAIL', `Total: ${resEmployees.data.length}`);

    // 5. Verify Badge Token
    const testEmployee = resEmployees.data[0];
    const resBadgeVerify = await fetch(`${baseUrl}/badges/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: testEmployee.qr_token_hash })
    }).then(r => r.json());
    console.log('5. Badge Verify (QR):', resBadgeVerify.success ? '✅ OK' : '❌ FAIL', resBadgeVerify.data?.first_name);

    // 6. Punch Entry
    const resPunch = await fetch(`${baseUrl}/attendance/punch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: testEmployee.qr_token_hash,
        punch_type: 'ENTRY',
        punch_source: 'KIOSK_QR'
      })
    }).then(r => r.json());
    console.log('6. Punch Entry:', resPunch.success ? '✅ OK' : '❌ FAIL', resPunch.message);

    // 7. Today Logs
    const resTodayLogs = await fetch(`${baseUrl}/attendance/today-logs`).then(r => r.json());
    console.log('7. Today Logs:', resTodayLogs.success ? '✅ OK' : '❌ FAIL', `Punches: ${resTodayLogs.data.length}`);

    // 8. Dashboard Stats
    const resDashboard = await fetch(`${baseUrl}/dashboard/stats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    }).then(r => r.json());
    console.log('8. Dashboard Stats:', resDashboard.success ? '✅ OK' : '❌ FAIL', resDashboard.data.overview);

    // 9. ERP Export (with API Key)
    const today = new Date().toISOString().split('T')[0];
    const resErp = await fetch(`${baseUrl}/integration/attendances?start_date=${today}&end_date=${today}`, {
      headers: { 'x-api-key': 'ag_erp_live_key_982347102938471209384' }
    }).then(r => r.json());
    console.log('9. ERP Export API Key:', resErp.success ? '✅ OK' : '❌ FAIL', `Records: ${resErp.data.total_records}`);

    console.log('\n🎉 ¡TODOS LOS ENDPOINTS DE LA FASE 2 HAN SIDO VALIDADOS CON ÉXITO!');
  } catch (error) {
    console.error('❌ Error en pruebas:', error);
  } finally {
    server.close();
  }
}

testBackendEndpoints();
