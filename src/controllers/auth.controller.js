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

/**
 * Iniciar sesión independiente para Trabajadores (DNI o Carnet de Extranjería)
 */
const workerLogin = (req, res) => {
  try {
    const { document_number, password } = req.body;

    if (!document_number || !password) {
      return errorResponse(res, 'Ingresa tu DNI / CEX y tu contraseña.', null, 400);
    }

    const docTrim = String(document_number).trim();
    const passTrim = String(password).trim();

    const emp = db.prepare(`
      SELECT 
        e.*,
        b.name as branch_name,
        b.latitude as branch_lat,
        b.longitude as branch_lng,
        b.radius_meters as branch_radius,
        d.name as department_name,
        p.name as position_name,
        s.name as shift_name,
        s.entry_time as shift_entry_time,
        s.exit_time as shift_exit_time
      FROM employees e
      LEFT JOIN branches b ON e.branch_id = b.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      LEFT JOIN shifts s ON e.shift_id = s.id
      WHERE e.document_number = ? OR e.employee_code = ?
    `).get(docTrim, docTrim);

    if (!emp) {
      return errorResponse(res, 'Trabajador no encontrado. Verifica tu DNI o Carnet.', null, 404);
    }

    if (emp.status !== 'ACTIVE') {
      return errorResponse(res, '⛔ TRABAJADOR INACTIVO / DADO DE BAJA. Tu registro está dado de baja o inactivo. Acceso denegado al aplicativo.', null, 403);
    }

    // Validación de contraseña: por defecto es el mismo número de DNI o password_hash si fue cambiada
    let isMatch = false;
    if (emp.password_hash) {
      isMatch = bcrypt.compareSync(passTrim, emp.password_hash);
    } else {
      isMatch = (passTrim === emp.document_number || passTrim === emp.employee_code);
    }

    if (!isMatch) {
      return errorResponse(res, 'Contraseña incorrecta. Recuerda que por defecto es tu número de DNI.', null, 401);
    }

    const token = jwt.sign(
      {
        id: emp.id,
        employee_id: emp.id,
        document_number: emp.document_number,
        employee_code: emp.employee_code,
        full_name: `${emp.first_name} ${emp.last_name}`,
        role: 'WORKER'
      },
      config.jwt.secret,
      { expiresIn: '30d' }
    );

    return successResponse(res, `¡Bienvenido(a), ${emp.first_name}!`, {
      token,
      worker: {
        id: emp.id,
        code: emp.employee_code,
        document_number: emp.document_number,
        name: `${emp.first_name} ${emp.last_name}`,
        first_name: emp.first_name,
        last_name: emp.last_name,
        photo_url: emp.photo_url,
        department: emp.department_name,
        position: emp.position_name,
        branch_name: emp.branch_name || 'Planta Principal',
        branch_lat: emp.branch_lat,
        branch_lng: emp.branch_lng,
        branch_radius: emp.branch_radius || 300,
        shift_name: emp.shift_name,
        shift_entry: emp.shift_entry_time,
        shift_exit: emp.shift_exit_time
      }
    });
  } catch (error) {
    return errorResponse(res, 'Error en acceso del trabajador.', error.message);
  }
};

/**
 * Listar todos los usuarios administrativos y supervisores (Solo ADMIN)
 */
const getAllUsers = (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, full_name, email, role, is_active, last_login, created_at
      FROM users ORDER BY role ASC, full_name ASC
    `).all();

    return successResponse(res, 'Lista de usuarios administrativos.', users);
  } catch (error) {
    return errorResponse(res, 'Error al listar usuarios.', error.message);
  }
};

/**
 * Actualizar datos y/o contraseña de un usuario administrativo
 */
const updateUser = (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, role, is_active, password } = req.body;

    const existing = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (!existing) {
      return errorResponse(res, 'Usuario no encontrado.', null, 404);
    }

    let passwordHash = existing.password_hash;
    if (password && password.trim().length >= 4) {
      passwordHash = bcrypt.hashSync(password.trim(), 10);
    }

    db.prepare(`
      UPDATE users SET
        full_name = ?,
        email = ?,
        role = ?,
        is_active = ?,
        password_hash = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      full_name || existing.full_name,
      email !== undefined ? email : existing.email,
      role || existing.role,
      is_active !== undefined ? Number(is_active) : existing.is_active,
      passwordHash,
      id
    );

    return successResponse(res, 'Usuario actualizado exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al actualizar usuario.', error.message);
  }
};

/**
 * Eliminar usuario administrativo
 */
const deleteUser = (req, res) => {
  try {
    const { id } = req.params;
    if (Number(id) === Number(req.user.id)) {
      return errorResponse(res, 'No puedes eliminar tu propia cuenta activa.', null, 400);
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return successResponse(res, 'Usuario eliminado exitosamente.');
  } catch (error) {
    return errorResponse(res, 'Error al eliminar usuario.', error.message);
  }
};

module.exports = {
  login,
  workerLogin,
  getProfile,
  registerUser,
  getAllUsers,
  updateUser,
  deleteUser
};
