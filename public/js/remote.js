/**
 * Lógica para marcación remota de asistencia con GPS y Módulo de Supervisor de Campo
 */
let userCoords = null;
let currentMobileRole = 'WORKER';
let mobileQrScanner = null;
let isCamActive = false;
let allActiveEmployees = [];

document.addEventListener('DOMContentLoaded', async () => {
  startRemoteClock();
  obtainGeolocation();
  await loadSupervisorEmployees();
  await loadMobileTodayLogs();

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

  if (title) title.textContent = 'Obteniendo GPS en tiempo real...';
  if (indicator) indicator.className = 'w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse';

  navigator.geolocation.getCurrentPosition(
    (position) => {
      userCoords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy
      };

      if (title) title.textContent = 'Posicionamiento GPS Satelital Activo';
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
 * Alternar entre Modo Operario y Modo Supervisor de Campo
 */
window.switchMobileRole = function(role) {
  currentMobileRole = role;

  const btnWorker = document.getElementById('tab-mode-worker');
  const btnSup = document.getElementById('tab-mode-supervisor');
  const viewWorker = document.getElementById('view-worker-mode');
  const viewSup = document.getElementById('view-supervisor-mode');

  if (role === 'WORKER') {
    btnWorker.className = 'py-2 px-3 rounded-xl bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer';
    btnSup.className = 'py-2 px-3 rounded-xl text-slate-400 hover:text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer';
    viewWorker.classList.remove('hidden');
    viewSup.classList.add('hidden');
    if (isCamActive) toggleMobileCamera();
  } else {
    btnSup.className = 'py-2 px-3 rounded-xl bg-emerald-600 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md transition cursor-pointer';
    btnWorker.className = 'py-2 px-3 rounded-xl text-slate-400 hover:text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer';
    viewSup.classList.remove('hidden');
    viewWorker.classList.add('hidden');
    loadMobileTodayLogs();
  }
  lucide.createIcons();
};

/**
 * Marcación del Trabajador
 */
window.submitRemotePunch = async function(punchType) {
  const docInput = document.getElementById('remote-doc-input');
  const docNumber = docInput?.value?.trim();

  if (!docNumber) {
    alert('Por favor, ingresa tu número de DNI o código de trabajador.');
    docInput?.focus();
    return;
  }

  await executePunch(docNumber, punchType, 'REMOTE_MOBILE');
};

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
 * Ejecución centralizada de Marcación con GPS
 */
async function executePunch(tokenValue, punchType, punchSource) {
  const resultBox = document.getElementById('remote-result-box');

  try {
    const payload = {
      token: tokenValue,
      punch_type: punchType,
      punch_source: punchSource,
      latitude: userCoords ? userCoords.lat : null,
      longitude: userCoords ? userCoords.lng : null,
      device_info: `Mobile App (${navigator.platform}) - GPS: ${userCoords ? 'ACTIVO' : 'NO'}`
    };

    const response = await api.attendance.punch(payload);

    if (response && response.success) {
      if (resultBox) {
        document.getElementById('remote-res-title').textContent = '¡Marcación Confirmada!';
        document.getElementById('remote-res-name').textContent = `${response.data.employee.name} (${response.data.employee.position})`;
        
        let msg = `${response.message} • Hora: ${new Date(response.data.punch.time).toLocaleTimeString('es-PE')}`;
        if (userCoords) {
          msg += ` • GPS: ${userCoords.lat.toFixed(4)}, ${userCoords.lng.toFixed(4)}`;
        }
        document.getElementById('remote-res-msg').textContent = msg;

        resultBox.classList.remove('hidden');
        resultBox.scrollIntoView({ behavior: 'smooth' });
      }

      await loadMobileTodayLogs();
    } else {
      alert(response.message || 'Error al procesar la marcación.');
    }
  } catch (error) {
    alert(error.message || 'Credencial o DNI no encontrado.');
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
          ? '<span class="px-2 py-0.5 rounded text-[9px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">ENTRADA</span>'
          : '<span class="px-2 py-0.5 rounded text-[9px] font-extrabold bg-rose-500/10 text-rose-400 border border-rose-500/20">SALIDA</span>';

        return `
          <div class="p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <img src="${log.photo_url || '/uploads/photos/default-avatar.png'}" class="w-9 h-9 rounded-xl object-cover border border-slate-700">
              <div>
                <p class="font-extrabold text-xs text-white">${log.first_name} ${log.last_name}</p>
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
        fps: 20,
        qrbox: { width: 220, height: 220 },
        aspectRatio: 1.3333
      };

      await mobileQrScanner.start(
        { facingMode: 'environment' }, // Cámara trasera del celular
        config,
        async (decodedText) => {
          if (decodedText) {
            await executePunch(decodedText, 'AUTO', 'MOBILE_CAM_SCAN');
            // Pausa breve tras escaneo
            setTimeout(() => {}, 1500);
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
