const config = require('../config/config');
const { errorResponse } = require('../utils/responseHandler');
const db = require('../../database/database');

/**
 * Middleware para validar llamadas API de sistemas externos (ERP/Planillas)
 */
const verifyApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return errorResponse(res, 'Falta la cabecera X-API-KEY requerida para la integración.', null, 401);
  }

  // Comprobar si coincide con la clave maestra configurada o con un cliente registrado en la BD
  if (apiKey === config.apiIntegrationKey) {
    req.apiClient = { name: 'Master Integration Key', permissions: 'ALL' };
    return next();
  }

  const client = db.prepare('SELECT id, client_name, permissions, is_active FROM api_clients WHERE api_key_hash = ?').get(apiKey);

  if (!client || client.is_active !== 1) {
    return errorResponse(res, 'API Key inválida o cliente inactivo.', null, 403);
  }

  // Actualizar último uso
  db.prepare('UPDATE api_clients SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(client.id);

  req.apiClient = client;
  next();
};

module.exports = {
  verifyApiKey
};
