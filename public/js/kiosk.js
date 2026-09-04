/**
 * Lógica del Kiosco de Asistencia con Escáner por Cámara y Lector de Códigos
 */
let html5QrCode = null;
let currentPunchMode = 'AUTO';
let isProcessingScan = false;
let lastScannedToken = null;
let lastScanTime = 0;
let barcodeBuffer = '';
let barcodeTimeout = null;

let kioskGps = null;
const PECEPE_COORDS = { lat: -12.235619, lng: -76.810871, radius: 50 };

document.addEventListener('DOMContentLoaded', async () => {
  startLiveClock();
  initKioskGps();
  initEventListeners();
  await initCameraScanner();
  await loadRecentLogs();

  // Polling automático de marcaciones cada 15 segundos
  setInterval(loadRecentLogs, 15000);
});

/**
 * Inicializar rastreo GPS del Kiosco / Pantalla Principal
 */
function initKioskGps() {
  const indicator = document.getElementById('kiosk-gps-indicator');
  const text = document.getElementById('kiosk-gps-text');

  if (!navigator.geolocation) {
    if (text) text.textContent = 'GPS no compatible';
    if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
    return;
  }

  function updatePos(pos) {
    kioskGps = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy
    };

    const dist = getKioskDistanceFromBranch(kioskGps.lat, kioskGps.lng);
    if (dist !== null) {
      if (dist <= PECEPE_COORDS.radius) {
        if (text) text.textContent = `En Planta PECEPE (${dist}m) • ±${Math.round(kioskGps.accuracy)}m`;
        if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-500/50';
      } else {
        if (text) text.textContent = `⛔ Fuera de Planta (${dist}m) • Bloqueado`;
        if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse';
      }
    }
  }

  function onGpsError(err) {
    console.warn('[Kiosk GPS Error]', err);
    if (text) text.textContent = 'GPS Desactivado (Ubicación requerida)';
    if (indicator) indicator.className = 'w-2.5 h-2.5 rounded-full bg-rose-500';
  }

  navigator.geolocation.getCurrentPosition(updatePos, onGpsError, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  navigator.geolocation.watchPosition(updatePos, onGpsError, { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
}

function getKioskDistanceFromBranch(lat, lng) {
  const R = 6371e3; // Metros
  const φ1 = (lat * Math.PI) / 180;
  const φ2 = (PECEPE_COORDS.lat * Math.PI) / 180;
  const Δφ = ((PECEPE_COORDS.lat - lat) * Math.PI) / 180;
  const Δλ = ((PECEPE_COORDS.lng - lng) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Reloj y Fecha Digital en Vivo
 */
function startLiveClock() {
  const clockEl = document.getElementById('live-clock');
  const dateEl = document.getElementById('live-date');

  function update() {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('es-PE', { hour12: false });
    }
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('es-PE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  update();
  setInterval(update, 1000);
}

/**
 * Configuración de Event Listeners y Lector de Barras USB
 */
function initEventListeners() {
  // 1. Selector de modo de marcación
  const modeBtns = document.querySelectorAll('.punch-mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => {
        b.classList.remove('bg-blue-600', 'text-white', 'shadow-lg');
        b.classList.add('text-slate-400');
      });
      btn.classList.add('bg-blue-600', 'text-white', 'shadow-lg');
      btn.classList.remove('text-slate-400');
      currentPunchMode = btn.dataset.punch;
    });
  });

  // 2. Pantalla Completa
  document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.warn(err));
    } else {
      document.exitFullscreen().catch(err => console.warn(err));
    }
  });

  // 3. Modal de Marcación Manual
  const modalManual = document.getElementById('modal-manual-punch');
  const manualInput = document.getElementById('manual-input-code');

  document.getElementById('btn-manual-punch')?.addEventListener('click', () => {
    modalManual?.classList.remove('hidden');
    manualInput?.focus();
  });

  document.getElementById('btn-close-manual-modal')?.addEventListener('click', () => {
    modalManual?.classList.add('hidden');
  });

  // Teclado virtual numérico
  document.querySelectorAll('.key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (manualInput) {
        manualInput.value += btn.textContent.trim();
      }
    });
  });

  document.getElementById('key-clear')?.addEventListener('click', () => {
    if (manualInput) manualInput.value = '';
  });

  document.getElementById('key-backspace')?.addEventListener('click', () => {
    if (manualInput) manualInput.value = manualInput.value.slice(0, -1);
  });

  document.getElementById('btn-submit-manual-punch')?.addEventListener('click', () => {
    const code = manualInput?.value?.trim();
    if (code) {
      modalManual?.classList.add('hidden');
      if (manualInput) manualInput.value = '';
      processPunch(code, 'MANUAL_OVERRIDE');
    }
  });

  manualInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const code = manualInput.value.trim();
      if (code) {
        modalManual?.classList.add('hidden');
        manualInput.value = '';
        processPunch(code, 'MANUAL_OVERRIDE');
      }
    }
  });

  // 4. Captura de Lector de Códigos de Barras USB (Hardware Wedge)
  window.addEventListener('keydown', (e) => {
    // Si el foco está en un input normal, no interceptar
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

    if (e.key === 'Enter') {
      if (barcodeBuffer.length >= 4) {
        const scannedCode = barcodeBuffer.trim();
        barcodeBuffer = '';
        processPunch(scannedCode, 'BARCODE');
      }
      barcodeBuffer = '';
    } else if (e.key.length === 1) {
      barcodeBuffer += e.key;
      clearTimeout(barcodeTimeout);
      barcodeTimeout = setTimeout(() => {
        barcodeBuffer = '';
      }, 120); // Reseteo si el ingreso es lento (tecleo humano vs lector)
    }
  });
}

/**
 * Inicializar Escáner de Cámara con HTML5-QRCode
 */
async function initCameraScanner() {
  try {
    if (!window.Html5Qrcode) {
      console.warn('Librería Html5Qrcode no disponible.');
      return;
    }

    const cameras = await Html5Qrcode.getCameras();
    const cameraSelect = document.getElementById('camera-select');

    if (!cameras || cameras.length === 0) {
      if (cameraSelect) cameraSelect.innerHTML = `<option>No se detectaron cámaras</option>`;
      return;
    }

    if (cameraSelect) {
      cameraSelect.innerHTML = cameras.map((c, i) => `
        <option value="${c.id}">${c.label || `Cámara ${i + 1}`}</option>
      `).join('');

      cameraSelect.addEventListener('change', async (e) => {
        if (html5QrCode) {
          await html5QrCode.stop();
          startScanning(e.target.value);
        }
      });
    }

    // Usar la cámara trasera por defecto si existe (móviles) o la primera disponible
    const selectedCamId = cameras.length > 1 ? cameras[cameras.length - 1].id : cameras[0].id;
    if (cameraSelect) cameraSelect.value = selectedCamId;

    html5QrCode = new Html5Qrcode('reader');
    await startScanning(selectedCamId);
  } catch (error) {
    console.error('Error al inicializar cámara:', error);
  }
}

async function startScanning(cameraId) {
  try {
    const config = {
      fps: 20,
      qrbox: function(viewfinderWidth, viewfinderHeight) {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const qrboxEdgeSize = Math.floor(minEdge * 0.85);
        return {
          width: Math.max(qrboxEdgeSize, 220),
          height: Math.max(qrboxEdgeSize, 220)
        };
      },
      aspectRatio: 1.3333,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true
      }
    };

    await html5QrCode.start(
      cameraId,
      config,
      (decodedText) => {
        onQrCodeScanned(decodedText);
      },
      (errorMessage) => {
        // Ignorar errores menores de encuadre en cada frame
      }
    );
  } catch (err) {
    console.error('Error al iniciar transmisión de cámara:', err);
  }
}

/**
 * Manejador de Código QR detectado por la cámara
 */
function onQrCodeScanned(qrText) {
  const now = Date.now();
  // Evitar escaneos repetidos accidentales en menos de 3 segundos
  if (isProcessingScan || (qrText === lastScannedToken && now - lastScanTime < 3000)) {
    return;
  }

  lastScannedToken = qrText;
  lastScanTime = now;
  processPunch(qrText, 'KIOSK_QR');
}

/**
 * Procesar marcación enviándola a la API
 */
async function processPunch(token, source = 'KIOSK_QR') {
  if (isProcessingScan) return;
  isProcessingScan = true;

  // 1. Validar que el dispositivo tenga señal GPS activa
  if (!kioskGps) {
    playFeedbackAudio('error');
    alert('⛔ GPS SATELITAL OBLIGATORIO:\n\nNo se ha detectado la ubicación GPS de este dispositivo.\n\nPara poder registrar asistencia en la sede PECEPE S.A.C., debes encender la Ubicación/GPS en tu equipo o celular y permitir los permisos de ubicación en el navegador.');
    initKioskGps();
    setTimeout(() => { isProcessingScan = false; }, 1500);
    return;
  }

  // 2. Validar que esté físicamente dentro de los 50 metros de Planta PECEPE
  const dist = getKioskDistanceFromBranch(kioskGps.lat, kioskGps.lng);
  if (dist !== null && dist > PECEPE_COORDS.radius) {
    playFeedbackAudio('error');
    alert(`⛔ MARCACIÓN DENEGADA POR GEOCERCA:\n\nTe encuentras fuera del área autorizada de la sede PECEPE S.A.C.\n\nEstás a ${dist} metros de distancia (Radio permitido: ${PECEPE_COORDS.radius} metros).\n\nDebes estar físicamente dentro de las instalaciones de la planta para poder registrar tu asistencia.`);
    setTimeout(() => { isProcessingScan = false; }, 1500);
    return;
  }

  try {
    const response = await api.attendance.punch({
      token,
      punch_type: currentPunchMode,
      punch_source: source,
      latitude: kioskGps.lat,
      longitude: kioskGps.lng,
      device_info: `Kiosk Screen (${navigator.userAgent.substring(0, 50)})`
    });

    if (response && response.success) {
      playFeedbackAudio('success');
      showPunchResultCard(response.data, true, response.message);
      await loadRecentLogs();
    } else {
      playFeedbackAudio('error');
      if (response && (response.message?.includes('INACTIVO') || response.message?.includes('BAJA') || response.data?.is_inactive)) {
        showInactiveWorkerCard(response.data || {}, response.message);
      } else {
        alert(response.message || 'Marcación no procesada.');
        showToast(response.message || 'Marcación no procesada.', 'error');
      }
    }
  } catch (error) {
    playFeedbackAudio('error');
    const errMsg = error.message || 'Credencial no reconocida.';
    if (errMsg.includes('INACTIVO') || errMsg.includes('BAJA')) {
      showInactiveWorkerCard(error.data || {}, errMsg);
    } else if (error.status === 403 || errMsg.includes('GEOCERCA') || errMsg.includes('DENEGADA') || errMsg.includes('GPS')) {
      alert(errMsg);
      showToast(errMsg, 'error');
    } else {
      showToast(errMsg, 'error');
    }
  } finally {
    setTimeout(() => {
      isProcessingScan = false;
    }, 1500);
  }
}

/**
 * Mostrar aviso visual de trabajador inactivo o de baja
 */
function showInactiveWorkerCard(data, message) {
  const card = document.getElementById('punch-result-card');
  if (!card) return;

  const emp = data.employee || {};

  document.getElementById('res-emp-photo').src = emp.photo_url || '/uploads/photos/default-avatar.png';
  document.getElementById('res-emp-photo').className = 'w-20 h-20 rounded-2xl object-cover border-2 border-rose-500 shadow-lg grayscale';
  document.getElementById('res-emp-name').textContent = emp.name || 'Trabajador Cesado / Baja';
  document.getElementById('res-emp-position').textContent = emp.position || 'Sin Acceso Autorizado';
  document.getElementById('res-emp-dept').textContent = emp.department || 'Personal Inactivo';

  const badgeIcon = document.getElementById('res-badge-status-icon');
  if (badgeIcon) {
    badgeIcon.className = 'absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-rose-600 text-white flex items-center justify-center text-sm shadow animate-pulse';
    badgeIcon.innerHTML = '<i data-lucide="shield-alert" class="w-4 h-4 stroke-[3]"></i>';
  }

  const tagEl = document.getElementById('res-punch-tag');
  tagEl.textContent = '⛔ TRABAJADOR INACTIVO / DADO DE BAJA';
  tagEl.className = 'text-[11px] font-black uppercase px-3 py-1 rounded-full bg-rose-600 text-white shadow-lg shadow-rose-600/40 border border-rose-400 animate-pulse';

  const time = new Date().toLocaleTimeString('es-PE', { hour12: true });
  document.getElementById('res-punch-time').textContent = time;

  const noteEl = document.getElementById('res-punch-note');
  noteEl.textContent = '❌ MARCACIÓN DENEGADA (NO REGISTRADA)';
  noteEl.className = 'text-xs font-black text-rose-400';

  card.className = 'glass-panel p-6 rounded-3xl border-2 border-rose-500/80 bg-rose-950/40 shadow-2xl shadow-rose-950/50 transition-all duration-300';
  card.classList.remove('hidden');

  showToast('⛔ TRABAJADOR INACTIVO O DADO DE BAJA. Marcación denegada.', 'error');

  clearTimeout(card._hideTimeout);
  card._hideTimeout = setTimeout(() => {
    card.classList.add('hidden');
    card.className = 'glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl transition-all duration-300 hidden';
    const photo = document.getElementById('res-emp-photo');
    if (photo) photo.className = 'w-20 h-20 rounded-2xl object-cover border-2 border-cyan-400 shadow-lg';
  }, 7000);

  lucide.createIcons();
}

/**
 * Mostrar tarjeta visual de confirmación instantánea
 */
function showPunchResultCard(data, isSuccess, message) {
  const card = document.getElementById('punch-result-card');
  if (!card) return;

  const emp = data.employee;
  const punch = data.punch;

  document.getElementById('res-emp-photo').src = emp.photo_url || '/uploads/photos/default-avatar.png';
  document.getElementById('res-emp-photo').className = 'w-20 h-20 rounded-2xl object-cover border-2 border-cyan-400 shadow-lg';
  document.getElementById('res-emp-name').textContent = emp.name;
  document.getElementById('res-emp-position').textContent = emp.position || 'Colaborador';
  document.getElementById('res-emp-dept').textContent = emp.department || 'General';

  const badgeIcon = document.getElementById('res-badge-status-icon');
  if (badgeIcon) {
    badgeIcon.className = 'absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm shadow';
    badgeIcon.innerHTML = '<i data-lucide="check" class="w-4 h-4 stroke-[3]"></i>';
  }

  const typeNames = {
    ENTRY: 'ENTRADA CONFIRMADA',
    LUNCH_START: 'INICIO REFRIGERIO',
    LUNCH_END: 'FIN REFRIGERIO',
    EXIT: 'SALIDA CONFIRMADA'
  };

  const tagEl = document.getElementById('res-punch-tag');
  tagEl.textContent = typeNames[punch.type] || punch.type;

  const time = new Date(punch.time).toLocaleTimeString('es-PE', { hour12: true });
  document.getElementById('res-punch-time').textContent = time;

  const noteEl = document.getElementById('res-punch-note');
  if (punch.tardiness_minutes > 0 && punch.type === 'ENTRY') {
    noteEl.textContent = `Tardanza: ${punch.tardiness_minutes} min`;
    noteEl.className = 'text-xs font-black text-rose-400';
    tagEl.className = 'text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30';
  } else {
    noteEl.textContent = 'Puntual / En regla';
    noteEl.className = 'text-xs font-black text-emerald-400';
    tagEl.className = 'text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  }

  card.className = 'glass-panel p-6 rounded-3xl border border-slate-800 shadow-2xl transition-all duration-300';
  card.classList.remove('hidden');

  // Auto-ocultar después de 6 segundos si no hay otra marcación
  clearTimeout(card._hideTimeout);
  card._hideTimeout = setTimeout(() => {
    card.classList.add('hidden');
  }, 6000);

  lucide.createIcons();
}

/**
 * Cargar marcaciones recientes del día
 */
async function loadRecentLogs() {
  try {
    const response = await api.attendance.getTodayLogs();
    const container = document.getElementById('live-logs-container');
    const totalEl = document.getElementById('total-punches-today');
    if (!container) return;

    if (response && response.data) {
      const logs = response.data;
      if (totalEl) totalEl.textContent = `${logs.length} hoy`;

      if (logs.length === 0) {
        container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">Esperando primeras marcaciones de la jornada...</div>`;
        return;
      }

      const typeBadges = {
        ENTRY: '<span class="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-500/20">ENTRADA</span>',
        LUNCH_START: '<span class="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500/20">REFRIGERIO</span>',
        LUNCH_END: '<span class="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded text-[10px] font-bold border border-cyan-500/20">RETORNO</span>',
        EXIT: '<span class="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded text-[10px] font-bold border border-rose-500/20">SALIDA</span>'
      };

      container.innerHTML = logs.slice(0, 10).map(log => {
        const time = new Date(log.punch_time).toLocaleTimeString('es-PE', { hour12: true });
        const empName = (log.last_name && log.first_name)
          ? `${log.last_name}, ${log.first_name}`.toUpperCase()
          : `${log.first_name || ''} ${log.last_name || ''}`.trim().toUpperCase();
        return `
          <div class="flex items-center justify-between p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition">
            <div class="flex items-center gap-3">
              <img src="${log.photo_url || '/uploads/photos/default-avatar.png'}" class="w-8 h-8 rounded-xl object-cover border border-slate-700">
              <div>
                <p class="text-xs font-bold text-white leading-tight">${empName}</p>
                <p class="text-[10px] text-slate-400">${log.position_name || 'Personal'}</p>
              </div>
            </div>
            <div class="text-right flex flex-col items-end gap-0.5">
              ${typeBadges[log.punch_type] || log.punch_type}
              <span class="text-[10px] font-mono text-slate-400 font-semibold">${time}</span>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (error) {
    console.error('Error al cargar logs recientes:', error);
  }
}

/**
 * Síntesis de Sonido de Feedback con Web Audio API (Sin archivos externos)
 */
function playFeedbackAudio(type = 'success') {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'success') {
      // Tono agudo alegre (Bip doble armónico)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // La5
      osc.frequency.exponentialRampToValueAtTime(1320, audioCtx.currentTime + 0.15); // Mi6
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.25);
    } else {
      // Tono grave de advertencia / error
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, audioCtx.currentTime);
      osc.frequency.setValueAtTime(180, audioCtx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    }
  } catch (e) {
    // Si el navegador bloquea audio sin interacción previa, se ignora silenciosamente
  }
}
