const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const config = require('./config/config');
const db = require('../database/database');

// Rutas
const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const badgeRoutes = require('./routes/badge.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const apiIntegrationRoutes = require('./routes/apiIntegration.routes');
const signatureRoutes = require('./routes/signature.routes');

const app = express();

// Middlewares de Seguridad y Logs
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Desactivar caché del navegador para asegurar entrega inmediata de scripts actualizados
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Servidor dinámico resiliente de fotos de colaboradores (Respaldo permanente en PostgreSQL)
app.get('/uploads/photos/:filename', async (req, res, next) => {
  const filename = req.params.filename;
  const photosDir = path.join(__dirname, '../public/uploads/photos');
  const filePath = path.join(photosDir, filename);

  // 1. Si existe físicamente en el disco del contenedor, servirlo de inmediato
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  // 2. Si no existe en disco (debido a reinicio o redeploy en Render), rescatarlo de PostgreSQL
  try {
    const photoRes = await db.query(
      'SELECT mime_type, photo_data FROM employee_photos WHERE filename = $1 LIMIT 1',
      [filename]
    );

    if (photoRes.rows.length > 0) {
      const { mime_type, photo_data } = photoRes.rows[0];

      // Recrear el archivo en disco como caché para futuras peticiones ultra-rápidas
      try {
        if (!fs.existsSync(photosDir)) {
          fs.mkdirSync(photosDir, { recursive: true });
        }
        fs.writeFileSync(filePath, photo_data);
      } catch (writeErr) {
        console.warn('⚠️ No se pudo cachear foto en disco:', writeErr.message);
      }

      res.setHeader('Content-Type', mime_type || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(photo_data);
    }
  } catch (dbErr) {
    console.error('❌ Error recuperando foto de PostgreSQL:', dbErr.message);
  }

  // 3. Fallback a avatar por defecto si no existe ni en disco ni en base de datos
  const defaultAvatar = path.join(photosDir, 'default-avatar.png');
  if (fs.existsSync(defaultAvatar)) {
    return res.sendFile(defaultAvatar);
  }

  next();
});

// Servir archivos estáticos (Frontend y subidas)
app.use(express.static(path.join(__dirname, '../public'), {
  etag: false,
  maxAge: 0
}));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Rutas directas limpias para el portal del trabajador
app.get(['/trabajador', '/portal-trabajador'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public/portal-trabajador.html'));
});

// Rutas de la API REST v1
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/badges', badgeRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/integration', apiIntegrationRoutes);
app.use('/api/v1/signatures', signatureRoutes);
app.use('/api/v1/documentos-firma', signatureRoutes);

const apiIntegrationController = require('./controllers/apiIntegration.controller');
app.get('/api/v1/sync/employees', apiIntegrationController.getEmployeesRoster);

/**
 * Endpoint de Salud Real (Healthcheck con SELECT 1 directo a PostgreSQL)
 * Cumple con el requisito de verificación contra la base de datos persistente.
 */
const handleHealthCheck = async (req, res) => {
  const ping = await db.pingDb();
  
  if (ping.ok) {
    return res.status(200).json({
      status: 'connected',
      database: 'connected',
      engine: 'PostgreSQL Persistent Cloud',
      latency_ms: ping.latencyMs,
      company: config.company.name,
      version: '2.0.0',
      timestamp: new Date().toISOString()
    });
  } else {
    return res.status(503).json({
      status: 'disconnected',
      database: 'disconnected',
      engine: 'PostgreSQL Persistent Cloud',
      error: ping.error || 'No se pudo contactar la base de datos externa',
      latency_ms: ping.latencyMs,
      timestamp: new Date().toISOString()
    });
  }
};

app.get(['/api/health', '/api/v1/health', '/health'], handleHealthCheck);

// Manejador 404 para API
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.originalUrl} no encontrado.`
  });
});

// Manejador global de errores
app.use((err, req, res, next) => {
  console.error('Error no controlado en Express:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor.',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
