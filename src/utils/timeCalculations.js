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

/**
 * Motor oficial de cálculo de jornada según normativa peruana (D.L. 854 / MYPE Micro):
 * 1. Cruce de medianoche si exit < entry o turno nocturno.
 * 2. Descuento automático de 1 hora de refrigerio (60 minutos).
 * 3. Base Ordinaria: hasta 8.00 horas.
 * 4. HE 25%: Primeras 2 horas que excedan la jornada (8.01 a 10.00 horas).
 * 5. HE 35%: Exceso sobre las 10.00 horas.
 */
function calculateShiftWorkMetrics(entryDate, exitDate, shiftType = 'diurno', lunchMinutes = 60) {
  if (!entryDate || !exitDate) {
    return {
      totalWorkedHours: 0,
      regularHours: 0,
      overtime25Hours: 0,
      overtime35Hours: 0,
      grossHours: 0
    };
  }

  let entryMs = new Date(entryDate).getTime();
  let exitMs = new Date(exitDate).getTime();

  // Si exit <= entry, sumar 24h por cruce de medianoche
  if (exitMs <= entryMs) {
    exitMs += 24 * 60 * 60 * 1000;
  }

  const grossMinutes = Math.max(0, Math.floor((exitMs - entryMs) / (1000 * 60)));
  const effectiveMinutes = Math.max(0, grossMinutes - lunchMinutes);

  const grossHours = Number((grossMinutes / 60).toFixed(2));
  const totalWorkedHours = Number((effectiveMinutes / 60).toFixed(2));

  // 1. Horas ordinarias base (máx 8.00h)
  const regularHours = Number(Math.min(8.00, totalWorkedHours).toFixed(2));

  // 2. Sobretiempo sobre 8h
  const excess = Math.max(0, totalWorkedHours - 8.00);

  // 3. HE 25% (primeras 2 horas: 8.01 a 10.00)
  const overtime25Hours = Number(Math.min(2.00, excess).toFixed(2));

  // 4. HE 35% (a partir de la 10ª hora)
  const overtime35Hours = Number(Math.max(0, totalWorkedHours - 10.00).toFixed(2));

  return {
    grossHours,
    totalWorkedHours,
    regularHours,
    overtime25Hours,
    overtime35Hours
  };
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
  calculateShiftWorkMetrics,
  calculateDistanceMeters
};
