const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const config = require('./config/config');

// Rutas
const authRoutes = require('./routes/auth.routes');
const employeeRoutes = require('./routes/employee.routes');
const badgeRoutes = require('./routes/badge.routes');
const attendanceRoutes = require('./routes/attendance.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const apiIntegrationRoutes = require('./routes/apiIntegration.routes');

const app = express();

// Middlewares de Seguridad y Logs
app.use(helmet({
  contentSecurityPolicy: false, // Permitir CDNs externos para Tailwind, Lucide, QRCode, jsPDF
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (config.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

// Servir archivos estáticos (Frontend y subidas)
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Rutas directas limpias
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

const apiIntegrationController = require('./controllers/apiIntegration.controller');
app.get('/api/v1/sync/employees', apiIntegrationController.getEmployeesRoster);

// Endpoint de estado del sistema (Healthcheck)
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'UP',
    version: '1.0.0',
    company: config.company.name,
    timestamp: new Date().toISOString()
  });
});

// Manejador 404 para API
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.originalUrl} no encontrado.`
  });
});

// Manejador global de errores
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor.',
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
