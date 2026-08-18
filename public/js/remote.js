/**
 * Lógica para marcación remota de asistencia con GPS
 */
let userCoords = null;

document.addEventListener('DOMContentLoaded', () => {
  startRemoteClock();
  obtainGeolocation();

  document.getElementById('btn-refresh-gps')?.addEventListener('click', obtainGeolocation);
});

function startRemoteClock() {
  const clockEl = document.getElementById('remote-clock');
  const dateEl = document.getElementById('remote-date');

  function update() {
    const now = new Date();
    if (clockEl) clockEl.textContent = now.toLocaleTimeString('es-PE', { hour12: false });
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('es-PE', {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  }

  update();
  setInterval(update, 1000);
}

function obtainGeolocation() {
  const indicator = document.getElementById('gps-status-indicator');
  const title = document.getElementById('gps-status-title');
  const coordsEl = document.getElementById('gps-status-coords');

  if (!navigator.geolocation) {
    if (title) title.textContent = 'GPS No Soportado por el navegador';
    if (indicator) indicator.className = 'w-3 h-3 rounded-full bg-rose-500';
    return;
  }

  if (title) title.textContent = 'Solicitando ubicación GPS...';
  if (indicator) indicator.className = 'w-3 h-3 rounded-full bg-amber-400 animate-pulse';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };

      if (title) title.textContent = 'Ubicación GPS Verificada';
      if (coordsEl) coordsEl.textContent = `Lat: ${userCoords.lat.toFixed(5)}, Lng: ${userCoords.lng.toFixed(5)} (±${Math.round(userCoords.accuracy)}m)`;
      if (indicator) indicator.className = 'w-3 h-3 rounded-full bg-emerald-400';
    },
    (error) => {
      console.warn('Error GPS:', error);
      if (title) title.textContent = 'GPS Desactivado o Sin Permisos';
      if (coordsEl) coordsEl.textContent = 'Se registrará marcación sin coordenadas';
      if (indicator) indicator.className = 'w-3 h-3 rounded-full bg-rose-500';
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

async function submitRemotePunch(punchType) {
  const docInput = document.getElementById('remote-doc-input');
  const docNumber = docInput?.value?.trim();

  if (!docNumber) {
    alert('Por favor, ingresa tu número de DNI o código de trabajador.');
    docInput?.focus();
    return;
  }

  const resultBox = document.getElementById('remote-result-box');

  try {
    const payload = {
      token: docNumber,
      punch_type: punchType,
      punch_source: 'REMOTE_WEB',
      latitude: userCoords ? userCoords.lat : null,
      longitude: userCoords ? userCoords.lng : null,
      device_info: `Mobile Remote (${navigator.platform})`
    };

    const response = await api.attendance.punch(payload);

    if (response && response.success) {
      if (resultBox) {
        document.getElementById('remote-res-title').textContent = '¡Marcación Confirmada!';
        document.getElementById('remote-res-name').textContent = `${response.data.employee.name} (${response.data.employee.position})`;
        
        let msg = `${response.message} • Hora: ${new Date(response.data.punch.time).toLocaleTimeString('es-PE')}`;
        if (response.data.punch.distance_meters !== null) {
          msg += ` • Distancia a sede: ${response.data.punch.distance_meters}m`;
        }
        document.getElementById('remote-res-msg').textContent = msg;

        resultBox.classList.remove('hidden');
      }
    } else {
      alert(response.message || 'Error al procesar la marcación.');
    }
  } catch (error) {
    alert(error.message || 'Credencial o DNI no encontrado.');
  }
}
