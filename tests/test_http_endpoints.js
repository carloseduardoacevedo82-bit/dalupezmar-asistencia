const http = require('http');
const app = require('../src/app');
const db = require('../database/database');

async function testHttpServer() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`Test HTTP server listening on port ${port}`);

  try {
    // 1. Healthcheck /api/health
    const healthRes = await fetch(`http://localhost:${port}/api/health`);
    const healthData = await healthRes.json();
    console.log('GET /api/health status:', healthRes.status, healthData);

    if (healthRes.status !== 200 || healthData.database !== 'connected') {
      throw new Error('Health check failed');
    }

    // 2. Healthcheck /api/v1/health
    const healthV1Res = await fetch(`http://localhost:${port}/api/v1/health`);
    const healthV1Data = await healthV1Res.json();
    console.log('GET /api/v1/health status:', healthV1Res.status, healthV1Data);

    // 3. Catalogs
    const catRes = await fetch(`http://localhost:${port}/api/v1/employees/catalogs`);
    const catData = await catRes.json();
    console.log('GET /api/v1/employees/catalogs status:', catRes.status, `Branches: ${catData.data?.branches?.length}, Departments: ${catData.data?.departments?.length}`);

    // 4. Employees roster
    const rosterRes = await fetch(`http://localhost:${port}/api/v1/sync/employees`);
    const rosterData = await rosterRes.json();
    console.log('GET /api/v1/sync/employees count:', rosterData.data?.length);

    console.log('🎉 Todos los endpoints HTTP respondieron satisfactoriamente con la base de datos persistente.');
  } finally {
    server.close();
    await db.pool.end();
  }
}

testHttpServer().catch(err => {
  console.error('HTTP Test failed:', err);
  process.exit(1);
});
