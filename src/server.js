const http = require('http');
const path = require('path');
const fs = require('fs');
const app = require('./app');
const config = require('./config/config');
const db = require('../database/database');
const initDb = require('../database/initDb');

// Crear directorios de subidas físicas si no existen
const uploadsDir = path.join(__dirname, '../public/uploads/photos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

async function startServer() {
  try {
    console.log('🚀 Iniciando conexión con base de datos PostgreSQL persistente...');
    
    // Probar ping inicial
    const ping = await db.pingDb();
    if (ping.ok) {
      console.log(`✅ [PostgreSQL Cloud] Conectado exitosamente (${ping.latencyMs}ms de latencia).`);
    } else {
      console.warn('⚠️ [PostgreSQL Cloud] Advertencia en conexión inicial:', ping.error);
    }

    // Ejecutar migración y verificación de esquema
    await initDb();

    const server = http.createServer(app);

    server.listen(config.port, () => {
      console.log('===========================================================');
      console.log(`🏢 SISTEMA DE ASISTENCIA Y RR.HH. - DALUPEZMAR`);
      console.log(`🚀 SERVIDOR EN LÍNEA EN PUERTO: ${config.port}`);
      console.log(`🌐 URL Local: http://localhost:${config.port}`);
      console.log(`☁️ Persistencia: PostgreSQL Remoto Permanente (Sin pérdida de datos en Render)`);
      console.log(`🛡️ Entorno: ${config.nodeEnv}`);
      console.log(`⚡ API Health: http://localhost:${config.port}/api/v1/health`);
      console.log('===========================================================');
    });

  } catch (error) {
    console.error('❌ Error crítico al arrancar el servidor:', error);
    process.exit(1);
  }
}

startServer();
