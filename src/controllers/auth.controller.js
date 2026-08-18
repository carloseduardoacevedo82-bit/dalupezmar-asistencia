const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const db = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

/**
 * Iniciar sesión de usuario administrativo / kiosco
 */
const login = (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return errorResponse(res, 'Debe ingresar el usuario y la contraseña.', null, 400);
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username.trim());

    if (!user) {
      return errorResponse(res, 'Credenciales incorrectas.', null, 401);
    }

    if (user.is_active !== 1) {
      return errorResponse(res, 'El usuario se encuentra inactivo. Contacte al administrador.', null, 403);
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return errorResponse(res, 'Credenciales incorrectas.', null, 401);
    }

    // Actualizar fecha de último login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Generar token JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        full_name: user.full_name
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const userClean = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      email: user.email,
      role: user.role
    };

    return successResponse(res, 'Inicio de sesión exitoso.', { token, user: userClean });
  } catch (error) {
    console.error('Error en login:', error);
    return errorResponse(res, 'Error interno durante la autenticación.', error.message);
  }
};

/**
 * Obtener perfil del usuario autenticado
 */
const getProfile = (req, res) => {
  try {
    const user = db.prepare(`
      SELECT id, username, full_name, email, role, is_active, last_login, created_at
      FROM users WHERE id = ?
    `).get(req.user.id);

    return successResponse(res, 'Perfil recuperado con éxito.', user);
  } catch (error) {
    return errorResponse(res, 'Error al obtener el perfil.', error.message);
  }
};

/**
 * Registrar nuevo usuario administrativo (solo ADMIN)
 */
const registerUser = (req, res) => {
  try {
    const { username, password, full_name, email, role } = req.body;

    if (!username || !password || !full_name) {
      return errorResponse(res, 'Los campos username, password y full_name son obligatorios.', null, 400);
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email || '');
    if (existing) {
      return errorResponse(res, 'El nombre de usuario o correo ya está registrado.', null, 409);
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const validRole = ['ADMIN', 'HR', 'SUPERVISOR', 'KIOSK', 'AUDITOR'].includes(role) ? role : 'HR';

    const result = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, email, role, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(username.trim(), passwordHash, full_name.trim(), email ? email.trim() : null, validRole);

    return successResponse(res, 'Usuario registrado exitosamente.', { id: result.lastInsertRowid, username, role: validRole }, 201);
  } catch (error) {
    return errorResponse(res, 'Error al registrar usuario.', error.message);
  }
};

module.exports = {
  login,
  getProfile,
  registerUser
};
