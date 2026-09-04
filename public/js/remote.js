/**
 * Lógica para Supervisor de Campo: Escáner QR frontal/trasero, GPS y marcación rápida
 */
let userCoords = null;
let mobileQrScanner = null;
let isCamActive = false;
let allActiveEmployees = [];
let isScanningCooldown = false;

document.addEventListener('DOMContentLoaded', async () => {
  obtainGeolocation();
  await loadSupervisorEmployees();
  await loadMobileTodayLogs();

  document.getElementById('btn-refresh-gps')?.addEventListener('click', obtainGeolocation);
});

/**
 * Obtener Coordenadas Satelitales GPS
 */
function obtainGeolocation() {
  const indicator = document.getElementById('gps-status-indicator');
  const title = document.getElementById('gps-status-title');
  const coordsEl = document.getElementById('gps-status-coords');
  const mapLink = document.getElementById('gps-map-link');

  if (!navigator.geolocation) {
    if (title) title.textContent = 'GPS no soportado en este navegador';
    if (indicator) indicator.className = 'w-3.5 h-3.5 rounded-full bg-rose-500';
    return;
  }

  if (title) title.textContent = 'GPS Satelital en tiempo real...';
  if (indicator) indicator.className = 'w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };

      if (title) title.textContent = 'GPS Satelital Activo';
      if (coordsEl) coordsEl.textContent = `Lat: ${userCoords.lat.toFixed(5)}, Lng: ${userCoords.lng.toFixed(5)} (±${Math.round(userCoords.accuracy)}m)`;
      if (indicator) indicator.className = 'w-3.5 h-3.5 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50';

      if (mapLink) {
        mapLink.href = `https://www.google.com/maps?q=${userCoords.lat},${userCoords.lng}`;
        mapLink.classList.remove('hidden');
      }
    },
    (error) => {
      console.warn('Error GPS:', error);
      if (title) title.textContent = 'GPS Desactivado o Sin Permiso';
      if (coordsEl) coordsEl.textContent = 'Activa el GPS/Ubicación en tu teléfono';
      if (indicator) indicator.className = 'w-3.5 h-3.5 rounded-full bg-rose-500';
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
  );
}

/**
 * Marcación Rápida de Supervisor para un Colaborador seleccionado
 */
window.submitSupervisorPunch = async function(punchType) {
  const select = document.getElementById('sup-select-employee');
  const selectedDni = select?.value;

  if (!selectedDni) {
    alert('Selecciona un colaborador de la lista.');
    return;
  }

  await executePunch(selectedDni, punchType, 'SUPERVISOR_FIELD');
};

/**
 * Ejecución centralizada de Marcación con GPS y Universal Token Reader
 */
async function executePunch(tokenValue, punchType = 'AUTO', punchSource = 'MOBILE_CAM_SCAN') {
  const resultBox = document.getElementById('remote-result-box');

  try {
    showToast('Procesando código escaneado...', 'info');

    const payload = {
      token: tokenValue,
      punch_type: punchType,
      punch_source: punchSource,
      latitude: userCoords ? userCoords.lat : null,
      longitude: userCoords ? userCoords.lng : null,
      device_info: `Supervisor Móvil (${navigator.platform}) - GPS: ${userCoords ? 'ACTIVO' : 'NO'}`
    };

    const response = await api.attendance.punch(payload);

    if (response && response.success) {
      if (resultBox) {
        document.getElementById('remote-res-title').textContent = response.message;
        document.getElementById('remote-res-name').textContent = `${response.data.employee.name} (${response.data.employee.position})`;
        
        let msg = `🏢 Sede: ${response.data.employee.branch_name} • Hora: ${new Date(response.data.punch.time).toLocaleTimeString('es-PE')}`;
        let geoMsg = userCoords ? `🛰️ GPS: ${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)}` : '⚠️ Sin coordenadas';
        if (response.data.punch.distance_meters !== null) {
          geoMsg += ` • Distancia a sede: ${response.data.punch.distance_meters}m`;
        }

        document.getElementById('remote-res-msg').textContent = msg;
        document.getElementById('remote-res-geo').textContent = geoMsg;

        resultBox.classList.remove('hidden');
        resultBox.scrollIntoView({ behavior: 'smooth' });
      }

      showToast(`¡${response.data.employee.name} registrado!`, 'success');
      await loadMobileTodayLogs();
    } else {
      alert(response.message || 'Error al procesar la marcación.');
    }
  } catch (error) {
    alert(error.message || 'Código o credencial no encontrado en el sistema.');
  }
}

/**
 * Cargar lista de colaboradores para el Supervisor
 */
async function loadSupervisorEmployees() {
  const select = document.getElementById('sup-select-employee');
  if (!select) return;

  try {
    const res = await api.employees.getAll();
    if (res && res.data) {
      allActiveEmployees = res.data.filter(e => e.status === 'ACTIVE');
      allActiveEmployees.sort((a, b) => {
        const nameA = `${a.last_name || ''}, ${a.first_name || ''}`.trim().toLowerCase();
        const nameB = `${b.last_name || ''}, ${b.first_name || ''}`.trim().toLowerCase();
        return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
      });
      select.innerHTML = '<option value="">-- Seleccionar Colaborador --</option>' +
        allActiveEmployees.map(e => `<option value="${e.document_number}">${e.last_name}, ${e.first_name} (DNI: ${e.document_number}) - ${e.position_name || 'Operario'}</option>`).join('');
    }
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Cargar asistencias de hoy en el celular del supervisor
 */
window.loadMobileTodayLogs = async function() {
  const container = document.getElementById('sup-today-logs-list');
  if (!container) return;

  try {
    const res = await api.attendance.getTodayLogs();
    if (res && res.data && res.data.length > 0) {
      container.innerHTML = res.data.map(log => {
        const timeStr = new Date(log.punch_time).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
        const typeBadge = log.punch_type === 'ENTRY' 
          ? '<span class="px-2 py-0.5 rounded text-[9px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ENTRADA</span>'
          : '<span class="px-2 py-0.5 rounded text-[9px] font-black bg-rose-500/10 text-rose-400 border border-rose-500/20">SALIDA</span>';

        const empName = (log.last_name && log.first_name)
          ? `${log.last_name}, ${log.first_name}`.toUpperCase()
          : `${log.first_name || ''} ${log.last_name || ''}`.trim().toUpperCase();

        return `
          <div class="p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <img src="${log.photo_url || '/uploads/photos/default-avatar.png'}" class="w-9 h-9 rounded-xl object-cover border border-slate-700">
              <div>
                <p class="font-extrabold text-xs text-white">${empName}</p>
                <p class="text-[10px] text-slate-400">${log.position_name || 'Operario'} • <span class="font-mono text-cyan-300 font-bold">${timeStr}</span></p>
              </div>
            </div>
            <div>
              ${typeBadge}
            </div>
          </div>
        `;
      }).join('');
    } else {
      container.innerHTML = '<p class="text-center text-xs text-slate-500 py-4">No hay marcaciones registradas hoy.</p>';
    }
  } catch (e) {
    console.warn(e);
  }
};

/**
 * Activar / Desactivar Cámara para Escáner de Fotochecks en el Celular
 */
window.toggleMobileCamera = async function() {
  const container = document.getElementById('mobile-reader-container');
  const btnText = document.getElementById('cam-btn-text');

  if (isCamActive) {
    if (mobileQrScanner) {
      await mobileQrScanner.stop();
      mobileQrScanner = null;
    }
    container.classList.add('hidden');
    btnText.textContent = 'Activar Cámara';
    isCamActive = false;
  } else {
    container.classList.remove('hidden');
    btnText.textContent = 'Detener Cámara';
    isCamActive = true;

    try {
      mobileQrScanner = new Html5Qrcode('mobile-reader');
      const config = {
        fps: 24,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.3333
      };

      await mobileQrScanner.start(
        { facingMode: 'environment' }, // Cámara trasera
        config,
        async (decodedText) => {
          if (decodedText && !isScanningCooldown) {
            isScanningCooldown = true;
            await executePunch(decodedText, 'AUTO', 'MOBILE_CAM_SCAN');
            setTimeout(() => {
              isScanningCooldown = false;
            }, 2500);
          }
        },
        (error) => {}
      );
    } catch (err) {
      alert('Error al acceder a la cámara del teléfono: ' + err.message);
      container.classList.add('hidden');
      btnText.textContent = 'Activar Cámara';
      isCamActive = false;
    }
  }
};
