const PERU_TIMEZONE = 'America/Lima';

/**
 * Obtiene la fecha en formato YYYY-MM-DD en la zona horaria de Perú (America/Lima UTC-5)
 */
function getPeruDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PERU_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Obtiene la hora en formato HH:MM:SS en la zona horaria de Perú (America/Lima UTC-5)
 */
function getPeruTimeString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: PERU_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d);
}

/**
 * Obtiene la fecha y hora completa ISO en la zona horaria de Perú
 */
function getPeruDateTimeString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const datePart = getPeruDateString(d);
  const timePart = getPeruTimeString(d);
  return `${datePart}T${timePart}`;
}

/**
 * Convierte un string de hora 'HH:MM:SS' o 'HH:MM' a minutos desde la medianoche
 */
function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = String(timeStr).split(':').map(Number);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

/**
 * Convierte un objeto Date o ISO string a minutos desde la medianoche en hora de Perú (America/Lima)
 */
function dateToPeruMinutes(dateObj) {
  if (!dateObj) return 0;
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const timeStr = getPeruTimeString(d);
  return timeStringToMinutes(timeStr);
}

/**
 * Calcula tardanza en minutos teniendo en cuenta el turno y la tolerancia en hora de Perú
 */
function calculateTardiness(entryDate, expectedEntryTimeStr, toleranceMinutes = 15) {
  const actualEntryMinutes = dateToPeruMinutes(entryDate);
  const scheduledMinutes = timeStringToMinutes(expectedEntryTimeStr || '07:00:00');
  const limitMinutes = scheduledMinutes + toleranceMinutes;

  if (actualEntryMinutes > limitMinutes) {
    return actualEntryMinutes - scheduledMinutes;
  }
  return 0;
}

/**
 * Calcula horas y minutos trabajados entre entrada y salida descontando refrigerio
 */
function calculateWorkedMinutes(entryDate, exitDate, lunchMinutes = 60) {
  if (!entryDate || !exitDate) return 0;
  const entry = new Date(entryDate).getTime();
  const exit = new Date(exitDate).getTime();
  
  if (exit <= entry) return 0;
  
  const totalDiffMinutes = Math.floor((exit - entry) / (1000 * 60));
  const effectiveMinutes = Math.max(0, totalDiffMinutes - lunchMinutes);
  return effectiveMinutes;
}

/**
 * Calcula horas extras respecto al turno programado en hora de Perú
 */
function calculateOvertime(exitDate, expectedExitTimeStr) {
  if (!exitDate || !expectedExitTimeStr) return 0;
  const actualExitMinutes = dateToPeruMinutes(exitDate);
  const scheduledExitMinutes = timeStringToMinutes(expectedExitTimeStr || '19:00:00');

  if (actualExitMinutes > scheduledExitMinutes + 15) {
    return actualExitMinutes - scheduledExitMinutes;
  }
  return 0;
}

/**
 * Fórmula de Haversine para calcular distancia en metros entre dos coordenadas GPS
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371e3; // Radio de la tierra en metros
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

module.exports = {
  PERU_TIMEZONE,
  getPeruDateString,
  getPeruTimeString,
  getPeruDateTimeString,
  timeStringToMinutes,
  dateToPeruMinutes,
  calculateTardiness,
  calculateWorkedMinutes,
  calculateOvertime,
  calculateDistanceMeters
};
