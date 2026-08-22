const config = require('../config/config');
const { errorResponse } = require('../utils/responseHandler');
const db = require('../../database/database');

/**
 * Middleware para validar llamadas API de sistemas externos (ERP/Planillas)
 */
const verifyApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return errorResponse(res, 'Falta la cabecera X-API-KEY requerida para la integración.', null, 401);
  }

  // Comprobar si coincide con la clave maestra configurada o con un cliente registrado en la BD
  if (apiKey === config.apiIntegrationKey) {
    req.apiClient = { name: 'Master Integration Key', permissions: 'ALL' };
    return next();
  }

  try {
    const clientRes = await db.query(
      'SELECT id, client_name, permissions, is_active FROM api_clients WHERE api_key_hash = $1',
      [apiKey]
    );
    const client = clientRes.rows[0];

    if (!client || client.is_active !== 1) {
      return errorResponse(res, 'API Key inválida o cliente inactivo.', null, 403);
    }

    // Actualizar último uso de manera asíncrona
    db.query('UPDATE api_clients SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1', [client.id]).catch(e => {
      console.warn('Advertencia actualizando last_used_at en api_clients:', e.message);
    });

    req.apiClient = client;
    next();
  } catch (error) {
    return errorResponse(res, 'Error validando API Key.', error.message, 500);
  }
};

module.exports = {
  verifyApiKey
};
