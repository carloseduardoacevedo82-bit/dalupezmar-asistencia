/**
 * Utilidad para respuestas HTTP estándar y consistentes
 */
const successResponse = (res, message = 'Operación exitosa', data = null, statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

const errorResponse = (res, message = 'Ocurrió un error en el servidor', errors = null, statusCode = 500) => {
  return res.status(statusCode).json({
    success: false,
    message,
    errors,
    data: errors,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  successResponse,
  errorResponse
};
