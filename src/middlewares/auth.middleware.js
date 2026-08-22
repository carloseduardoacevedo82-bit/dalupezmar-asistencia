const jwt = require('jsonwebtoken');
const config = require('../config/config');
const { errorResponse } = require('../utils/responseHandler');
const db = require('../../database/database');

/**
 * Middleware para verificar token JWT (Async PostgreSQL)
 */
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse(res, 'Acceso no autorizado. Token no proporcionado o inválido.', null, 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    
    // Si es un token emitido para un colaborador (WORKER)
    if (decoded.role === 'WORKER') {
      const empRes = await db.query(
        'SELECT id, employee_code, document_number, first_name, last_name, status FROM employees WHERE id = $1',
        [decoded.employee_id || decoded.id]
      );
      const emp = empRes.rows[0];

      if (!emp || emp.status !== 'ACTIVE') {
        return errorResponse(res, 'Colaborador inactivo o no encontrado.', null, 403);
      }

      req.user = {
        id: emp.id,
        employee_id: emp.id,
        document_number: emp.document_number,
        employee_code: emp.employee_code,
        full_name: `${emp.first_name} ${emp.last_name}`.trim(),
        role: 'WORKER'
      };
      return next();
    }

    // Verificar si el usuario administrativo existe y está activo
    const userRes = await db.query(
      'SELECT id, username, full_name, email, role, is_active FROM users WHERE id = $1',
      [decoded.id]
    );
    const user = userRes.rows[0];

    if (!user || user.is_active !== 1) {
      return errorResponse(res, 'Usuario inactivo o no encontrado.', null, 403);
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return errorResponse(res, 'La sesión ha expirado. Inicia sesión nuevamente.', null, 401);
    }
    return errorResponse(res, 'Token de autenticación inválido.', null, 401);
  }
};

/**
 * Middleware para validar roles específicos (RBAC)
 */
const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'No autenticado.', null, 401);
    }

    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'ADMIN') {
      return errorResponse(res, 'No tienes permisos suficientes para realizar esta acción.', null, 403);
    }

    next();
  };
};

module.exports = {
  verifyToken,
  requireRoles
};
