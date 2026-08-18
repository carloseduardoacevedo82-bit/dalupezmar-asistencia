const path = require('path');
require('dotenv').config();

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback_secret_asistencia_fotocheck_2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h'
  },
  apiIntegrationKey: process.env.API_INTEGRATION_KEY || 'ag_erp_live_key_982347102938471209384',
  dbFile: process.env.DB_FILE || path.join(__dirname, '../../database/asistencia.db'),
  company: {
    name: process.env.COMPANY_NAME || 'DALUPEZMAR SERVICIOS INDUSTRIALES S.A.C.',
    ruc: process.env.COMPANY_RUC || '20615714128',
    address: process.env.COMPANY_ADDRESS || 'Planta Industrial PECEPE S.A.C.'
  }
};
