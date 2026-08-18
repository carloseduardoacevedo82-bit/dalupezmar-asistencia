/**
 * Convierte un string de hora 'HH:MM:SS' o 'HH:MM' a minutos desde la medianoche
 */
function timeStringToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':').map(Number);
  return parts[0] * 60 + parts[1];
}

/**
 * Convierte un objeto Date a minutos desde la medianoche (hora local)
 */
function dateToMinutes(dateObj) {
  const d = new Date(dateObj);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Calcula tardanza en minutos teniendo en cuenta el turno y la tolerancia
 */
function calculateTardiness(entryDate, expectedEntryTimeStr, toleranceMinutes = 15) {
  const actualEntryMinutes = dateToMinutes(entryDate);
  const scheduledMinutes = timeStringToMinutes(expectedEntryTimeStr);
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
 * Calcula horas extras respecto al turno programado
 */
function calculateOvertime(exitDate, expectedExitTimeStr) {
  if (!exitDate || !expectedExitTimeStr) return 0;
  const actualExitMinutes = dateToMinutes(exitDate);
  const scheduledExitMinutes = timeStringToMinutes(expectedExitTimeStr);

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
  timeStringToMinutes,
  dateToMinutes,
  calculateTardiness,
  calculateWorkedMinutes,
  calculateOvertime,
  calculateDistanceMeters
};
