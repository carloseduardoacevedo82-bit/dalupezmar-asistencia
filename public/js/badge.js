/**
 * Controlador de Frontend para el Diseñador y Emisor de Fotochecks DALUPEZMAR
 * Con soporte de edición de datos y subida de fotos desde PC, celulares y tablets
 */
const defaultAvatarSvg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%231e293b'/%3E%3Ccircle cx='50' cy='38' r='20' fill='%23475569'/%3E%3Cpath d='M20 90 C20 68, 35 58, 50 58 C65 58, 80 68, 80 90 Z' fill='%23475569'/%3E%3C/svg%3E";

let allEmployees = [];
let selectedEmployee = null;
let currentTheme = 'theme-dalupezmar';
let isFlipped = false;
let pendingPhotoFile = null;
let currentBadgeFolder = 'ACTIVE'; // 'ACTIVE' o 'INACTIVE'

document.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();
  await loadPositionsCatalog();
  await loadEmployees();
});

async function loadPositionsCatalog() {
  try {
    const res = await api.employees.getCatalogs();
    if (res && res.data && res.data.positions) {
      const posSelect = document.getElementById('quick-position');
      if (posSelect) {
        const positions = res.data.positions;
        posSelect.innerHTML = positions.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
      }
    }
  } catch (e) {
    console.warn('Error al cargar catálogo de cargos:', e);
  }
}

function initEventListeners() {
  // 1. Giro 3D de tarjeta
  const btnFlip = document.getElementById('btn-flip-card');
  const cardInner = document.getElementById('badge-card-container');
  if (btnFlip && cardInner) {
    btnFlip.addEventListener('click', () => {
      isFlipped = !isFlipped;
      cardInner.classList.toggle('flipped', isFlipped);
    });
  }

  // 2. Buscador de empleados
  const searchInput = document.getElementById('input-search-employee');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterEmployees(e.target.value);
    });
  }

  // 3. Selector de temas
  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => {
        b.classList.remove('active', 'border-cyan-500', 'border-blue-500', 'border-purple-500', 'border-zinc-500', 'bg-cyan-950/50');
        b.classList.add('border-slate-700');
      });
      btn.classList.add('active', 'border-cyan-500', 'bg-cyan-950/50');
      const newTheme = btn.dataset.theme;
      setCardTheme(newTheme);
    });
  });

  // 4. Toggles
  document.getElementById('toggle-hologram')?.addEventListener('change', (e) => {
    const el = document.getElementById('badge-hologram');
    if (el) el.style.display = e.target.checked ? 'flex' : 'none';
  });

  document.getElementById('toggle-qr-front')?.addEventListener('change', (e) => {
    const el = document.getElementById('front-qr-box');
    if (el) el.style.display = e.target.checked ? 'flex' : 'none';
  });

  // 6. Guardar Cambios de Datos y Foto
  document.getElementById('btn-save-quick-changes')?.addEventListener('click', handleSaveQuickChanges);

  // 7. Botón regenerar token
  document.getElementById('btn-regenerate-token')?.addEventListener('click', handleRegenerateToken);

  // 8. Botones de impresión y PDF
  document.getElementById('btn-print-single')?.addEventListener('click', handlePrintSingle);
  document.getElementById('btn-download-pdf')?.addEventListener('click', handleDownloadPdf);

  // 9. Modal de lote
  const modalBatch = document.getElementById('modal-batch');
  document.getElementById('btn-batch-modal')?.addEventListener('click', () => {
    modalBatch?.classList.remove('hidden');
    renderBatchList();
  });
  document.getElementById('btn-close-batch-modal')?.addEventListener('click', () => modalBatch?.classList.add('hidden'));
  document.getElementById('btn-cancel-batch')?.addEventListener('click', () => modalBatch?.classList.add('hidden'));
  document.getElementById('btn-generate-batch-print')?.addEventListener('click', handleGenerateBatchPrint);

  document.getElementById('batch-select-all')?.addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.batch-emp-checkbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
    updateBatchCount();
  });
}

/**
 * Cargar lista de empleados desde la API
 */
async function loadEmployees() {
  try {
    const response = await api.employees.getAll();
    if (response && response.data) {
      allEmployees = response.data;
      
      updateBadgeFolderCounts();
      updateBadgeFolderTabsUI();
      renderCurrentFolderEmployees();

      if (allEmployees.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const targetId = urlParams.get('id');
        let found = allEmployees.find(e => e.id == targetId);
        if (found) {
          currentBadgeFolder = found.status || 'ACTIVE';
          updateBadgeFolderTabsUI();
          renderCurrentFolderEmployees();
          selectEmployee(found.id);
        } else {
          const activeList = allEmployees.filter(e => (e.status || 'ACTIVE') === 'ACTIVE');
          if (activeList.length > 0) {
            selectEmployee(activeList[0].id);
          } else {
            selectEmployee(allEmployees[0].id);
          }
        }
      }
    }
  } catch (error) {
    showToast('Error al cargar empleados: ' + error.message, 'error');
  }
}

/**
 * Actualizar conteos de carpetas (Activos vs Cesados)
 */
function updateBadgeFolderCounts() {
  const activeCount = allEmployees.filter(e => (e.status || 'ACTIVE') === 'ACTIVE').length;
  const inactiveCount = allEmployees.filter(e => e.status === 'INACTIVE').length;

  const countBadge = document.getElementById('emp-badge-count');
  if (countBadge) countBadge.textContent = `${activeCount} Activos`;

  const activeTabCount = document.getElementById('badge-count-active-tab');
  if (activeTabCount) activeTabCount.textContent = activeCount;

  const inactiveTabCount = document.getElementById('badge-count-inactive-tab');
  if (inactiveTabCount) inactiveTabCount.textContent = inactiveCount;

  const btnBatchModal = document.getElementById('btn-batch-modal');
  if (btnBatchModal) btnBatchModal.innerHTML = `<i data-lucide="layers" class="w-4 h-4"></i> Imprimir en Lote (${activeCount})`;
  
  if (window.lucide) lucide.createIcons();
}

/**
 * Actualizar estilos visuales de las pestañas de carpetas
 */
function updateBadgeFolderTabsUI() {
  const tabActive = document.getElementById('badge-tab-active');
  const tabInactive = document.getElementById('badge-tab-inactive');
  if (!tabActive || !tabInactive) return;

  if (currentBadgeFolder === 'ACTIVE') {
    tabActive.className = 'py-2 px-3 rounded-xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-bold text-[11px] flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer';
    tabInactive.className = 'py-2 px-3 rounded-xl bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer';
  } else {
    tabActive.className = 'py-2 px-3 rounded-xl bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200 font-bold text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer';
    tabInactive.className = 'py-2 px-3 rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500/40 font-bold text-[11px] flex items-center justify-center gap-1.5 transition shadow-sm cursor-pointer';
  }
  if (window.lucide) lucide.createIcons();
}

/**
 * Cambiar entre Carpeta de Activos y Carpeta de Bajas
 */
function switchBadgeFolder(folder) {
  currentBadgeFolder = folder;
  updateBadgeFolderTabsUI();
  
  const searchInput = document.getElementById('input-search-employee');
  if (searchInput) searchInput.value = '';

  renderCurrentFolderEmployees();

  const folderList = allEmployees.filter(e => (e.status || 'ACTIVE') === currentBadgeFolder);
  if (folderList.length > 0) {
    selectEmployee(folderList[0].id);
  }
}

/**
 * Renderizar colaboradores de la carpeta actual ordenados alfabéticamente
 */
function renderCurrentFolderEmployees() {
  const filtered = allEmployees.filter(e => (e.status || 'ACTIVE') === currentBadgeFolder);
  filtered.sort((a, b) => {
    const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
    const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
  });
  renderEmployeeList(filtered);
}

/**
 * Renderizar lista de selección de colaboradores
 */
function renderEmployeeList(employees) {
  const container = document.getElementById('employee-list-container');
  if (!container) return;

  if (employees.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">No hay colaboradores en esta carpeta.</div>`;
    return;
  }

  container.innerHTML = employees.map(emp => {
    const isInactive = emp.status === 'INACTIVE';
    const isSelected = selectedEmployee && selectedEmployee.id === emp.id;
    return `
      <div onclick="selectEmployee(${emp.id})" class="employee-item p-3 rounded-xl border ${isInactive ? 'border-rose-900/40 bg-rose-950/20 hover:border-rose-700/50' : 'border-slate-800 bg-slate-900/50 hover:bg-cyan-950/30 hover:border-cyan-700/50'} transition cursor-pointer flex items-center justify-between ${isSelected ? (isInactive ? 'border-rose-500 bg-rose-950/50 ring-1 ring-rose-500' : 'border-cyan-500 bg-cyan-950/40 ring-1 ring-cyan-500') : ''}" data-id="${emp.id}">
        <div class="flex items-center gap-3">
          <img src="${emp.photo_url || defaultAvatarSvg}" width="36" height="36" loading="lazy" class="w-9 h-9 min-w-[36px] rounded-xl object-cover border ${isInactive ? 'border-rose-800 opacity-60' : 'border-slate-700'}" alt="avatar" onerror="this.onerror=null; this.src='${defaultAvatarSvg}';">
          <div>
            <p class="text-xs font-bold ${isInactive ? 'text-rose-300 line-through' : 'text-slate-100'}">${emp.first_name} ${emp.last_name}</p>
            <p class="text-[10px] text-slate-400 font-mono"><span class="text-amber-400 font-bold">${emp.document_type || 'DNI'}:</span> ${emp.document_number} • <span class="${isInactive ? 'text-rose-400' : 'text-cyan-400'} font-semibold">${emp.position_name || 'Operario'}</span></p>
          </div>
        </div>
        ${isInactive ? `
          <span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
            🔴 DADO DE BAJA
          </span>
        ` : `
          <span class="text-[9px] font-bold px-2 py-0.5 rounded-full ${emp.position_name === 'Supervisor' ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}">
            ${emp.position_name || 'OPERARIO'}
          </span>
        `}
      </div>
    `;
  }).join('');
}

function filterEmployees(query) {
  const q = query.toLowerCase().trim();
  const folderList = allEmployees.filter(e => (e.status || 'ACTIVE') === currentBadgeFolder);
  const filtered = folderList.filter(emp => 
    (emp.first_name && emp.first_name.toLowerCase().includes(q)) ||
    (emp.last_name && emp.last_name.toLowerCase().includes(q)) ||
    (emp.document_number && emp.document_number.includes(q)) ||
    (emp.position_name && emp.position_name.toLowerCase().includes(q)) ||
    (emp.employee_code && emp.employee_code.toLowerCase().includes(q))
  );
  filtered.sort((a, b) => {
    const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
    const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
  });
  renderEmployeeList(filtered);
}

/**
 * Seleccionar empleado y renderizar fotocheck y formulario de edición
 */
async function selectEmployee(empId) {
  try {
    const response = await api.employees.getById(empId);
    if (!response || !response.data) return;

    const emp = response.data;
    selectedEmployee = emp;
    pendingPhotoFile = null;

    // Resetear preview de foto temporal
    const thumb = document.getElementById('photo-preview-thumb');
    if (thumb) thumb.classList.add('hidden');

    document.querySelectorAll('.employee-item').forEach(item => {
      if (item.dataset.id == empId) {
        item.classList.add('border-cyan-500', 'bg-cyan-950/40', 'ring-1', 'ring-cyan-500');
      } else {
        item.classList.remove('border-cyan-500', 'bg-cyan-950/40', 'ring-1', 'ring-cyan-500');
      }
    });

    // Rellenar formulario de edición rápida
    document.getElementById('quick-first-name').value = emp.first_name || '';
    document.getElementById('quick-last-name').value = emp.last_name || '';
    
    const docTypeEl = document.getElementById('quick-doc-type');
    if (docTypeEl) {
      docTypeEl.value = emp.document_type || (emp.document_number && emp.document_number.length === 9 ? 'CEX' : 'DNI');
    }

    document.getElementById('quick-doc-number').value = emp.document_number || '';
    
    const posSelect = document.getElementById('quick-position');
    if (posSelect) {
      const currentPos = emp.position_name || 'OPERARIO DE PRODUCCIÓN';
      // Si la opción no existe en el select, agregarla
      let found = false;
      for (let i = 0; i < posSelect.options.length; i++) {
        if (posSelect.options[i].value.toUpperCase() === currentPos.toUpperCase()) {
          posSelect.selectedIndex = i;
          found = true;
          break;
        }
      }
      if (!found) {
        const opt = document.createElement('option');
        opt.value = currentPos;
        opt.textContent = currentPos;
        posSelect.appendChild(opt);
        posSelect.value = currentPos;
      }
    }

    document.getElementById('quick-blood-type').value = emp.blood_type || 'O+';
    document.getElementById('quick-emergency-phone').value = emp.emergency_contact_phone || '+51 911111111';

    const branchSelect = document.getElementById('quick-branch');
    if (branchSelect) {
      branchSelect.value = emp.branch_id || 1;
    }

    // Mostrar preview de foto actual
    const previewThumb = document.getElementById('photo-preview-thumb');
    const thumbImg = document.getElementById('thumb-img');
    if (emp.photo_url) {
      thumbImg.src = emp.photo_url;
      previewThumb.classList.remove('hidden');
    } else {
      previewThumb.classList.add('hidden');
    }

    renderBadge(emp);
  } catch (error) {
    showToast('Error al cargar datos del fotocheck: ' + error.message, 'error');
  }
}

/**
 * Renderizar datos oficiales DALUPEZMAR en el carnet
 */
function renderBadge(emp) {
  if (!emp) return;

  // Anverso: Nombres ARRIBA y Apellidos DEBAJO
  const nombres = (emp.first_name || '').trim().toUpperCase();
  const apellidos = (emp.last_name || '').trim().toUpperCase();

  const nameContainer = document.getElementById('badge-fullname');
  if (nameContainer) {
    nameContainer.innerHTML = `
      <span class="block text-xs font-black tracking-wide text-[#002855] leading-tight">${nombres}</span>
      <span class="block text-sm font-black tracking-tight text-[#002855] leading-tight mt-0.5">${apellidos}</span>
    `;
  }

  const docType = emp.document_type || (emp.document_number && emp.document_number.length === 9 ? 'CEX' : 'DNI');
  document.getElementById('badge-doc-number').textContent = `${docType}: ${emp.document_number}`;
  document.getElementById('badge-emp-code').textContent = emp.employee_code || `DAL-${emp.id}`;
  document.getElementById('badge-photo').src = emp.photo_url || '/uploads/photos/default-avatar.png';

  // Banner inferior según cargo dinámico (NARANJA para AREA EXTERIOR, VERDE para Troquelado de Anillas)
  const posName = (emp.position_name || 'OPERARIO DE PRODUCCIÓN').toUpperCase();
  const posLower = (emp.position_name || '').toLowerCase();
  const deptLower = (emp.department_name || '').toLowerCase();
  let bannerColor = '#0284c7';
  if (posLower.includes('exterior') || posLower.includes('externa') || posLower.includes('externo') || deptLower.includes('exterior') || deptLower.includes('externa')) {
    bannerColor = '#ea580c'; // Naranja Intenso Corporativo para ÁREA EXTERIOR / EXTERNA
  } else if (posLower.includes('troquelado') || posLower.includes('anillas')) {
    bannerColor = '#16a34a'; // Verde Vibrante para Troquelado de Anillas
  } else if (posLower.includes('supervisor') || posLower.includes('jefe') || posLower.includes('gerente') || posLower.includes('coordinador')) {
    bannerColor = '#4c1d95';
  } else if (posLower.includes('calidad') || posLower.includes('seguridad') || posLower.includes('sst')) {
    bannerColor = '#059669';
  } else if (posLower.includes('mantenimiento') || posLower.includes('técnico') || posLower.includes('almacén') || posLower.includes('logística')) {
    bannerColor = '#0369a1';
  } else if (posLower.includes('administra') || posLower.includes('rrhh') || posLower.includes('contab')) {
    bannerColor = '#0f172a';
  }

  const bannerEl = document.getElementById('badge-position-banner');
  if (bannerEl) {
    bannerEl.textContent = posName;
    bannerEl.parentElement.style.background = bannerColor;
  }

  // Reverso: Planta Principal PECEPE S.A.C.
  document.getElementById('badge-blood-type').textContent = emp.blood_type || 'O+';
  document.getElementById('badge-emergency-name').textContent = emp.emergency_contact_name || 'Contacto Familiar';
  document.getElementById('badge-emergency-phone').textContent = emp.emergency_contact_phone || '+51 911111111';
  document.getElementById('badge-department').textContent = posLower.includes('troquelado') ? 'Troquelado de Anillas' : ((posLower.includes('exterior') || posLower.includes('externa')) ? 'Área Exterior' : (emp.department_name || 'Producción'));

  // Aplicar tema
  setCardTheme('theme-dalupezmar');

  // Generar QR seguro y personal único vinculado al trabajador
  const qrCanvas = document.getElementById('qr-canvas');
  // Usar siempre el qr_token_hash personal criptográfico único del empleado
  const qrPayload = emp.qr_token_hash || `AGY_SEC_QR_${emp.employee_code}_${emp.document_number}`;
  
  if (qrCanvas && window.QRCode) {
    QRCode.toCanvas(qrCanvas, qrPayload, {
      width: 46,
      margin: 0,
      color: {
        dark: '#002855',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });
  }

  // Generar Código de Barras (Code 128) - Tamaño Aumentado para Escáner Óptico
  const barcodeSvg = document.getElementById('barcode-svg');
  if (barcodeSvg && window.JsBarcode) {
    try {
      JsBarcode(barcodeSvg, emp.barcode_value || emp.document_number, {
        format: "CODE128",
        lineColor: "#002855",
        width: 1.95,
        height: 58,
        displayValue: true,
        fontSize: 12.5,
        font: "Montserrat",
        margin: 2
      });
    } catch (e) {
      console.warn('Barcode warning:', e);
    }
  }

let badgeCameraStream = null;
let badgeCameraFacing = 'user'; // 'user' (frontal) o 'environment' (trasera)
let badgeCapturedBlob = null;

/**
 * Cambiar entre modo Archivo y modo Cámara en Diseñador de Fotochecks
 */
window.setBadgePhotoMode = function(mode) {
  const btnFile = document.getElementById('btn-badge-photo-mode-file');
  const btnCamera = document.getElementById('btn-badge-photo-mode-camera');
  const containerFile = document.getElementById('badge-photo-file-container');
  const containerCamera = document.getElementById('badge-photo-camera-container');

  if (mode === 'camera') {
    if (btnCamera) btnCamera.className = 'px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition bg-cyan-600/20 text-cyan-400 border-cyan-500/40 cursor-pointer';
    if (btnFile) btnFile.className = 'px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition bg-slate-800 text-slate-400 border-slate-700 hover:text-white cursor-pointer';
    containerCamera?.classList.remove('hidden');
    containerFile?.classList.add('hidden');
  } else {
    if (btnFile) btnFile.className = 'px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition bg-blue-600/20 text-blue-400 border-blue-500/40 cursor-pointer';
    if (btnCamera) btnCamera.className = 'px-2.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 border transition bg-slate-800 text-slate-400 border-slate-700 hover:text-white cursor-pointer';
    containerFile?.classList.remove('hidden');
    containerCamera?.classList.add('hidden');
    stopBadgeCamera();
  }
  lucide.createIcons();
};

/**
 * Previsualizar archivo cargado en el fotocheck
 */
window.previewBadgeFilePhoto = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  pendingPhotoFile = file;
  badgeCapturedBlob = null;
  const reader = new FileReader();
  reader.onload = function(evt) {
    const badgePhoto = document.getElementById('badge-photo');
    if (badgePhoto) badgePhoto.src = evt.target.result;
    showToast('Foto cargada en vista previa. Presiona "Guardar y Actualizar Fotocheck" para confirmar.', 'info');
  };
  reader.readAsDataURL(file);
};

/**
 * Iniciar Cámara en Vivo para Diseñador de Fotochecks
 */
window.startBadgeCamera = async function() {
  const video = document.getElementById('badge-camera-video');
  const placeholder = document.getElementById('badge-camera-placeholder');
  const btnStart = document.getElementById('btn-start-badge-camera');
  const btnSwitch = document.getElementById('btn-switch-badge-camera');
  const btnCapture = document.getElementById('btn-capture-badge-camera');

  stopBadgeCamera();

  try {
    const constraints = {
      video: {
        facingMode: badgeCameraFacing,
        width: { ideal: 640 },
        height: { ideal: 640 }
      },
      audio: false
    };

    badgeCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    if (video) {
      video.srcObject = badgeCameraStream;
      video.classList.remove('hidden');
    }
    placeholder?.classList.add('hidden');

    btnStart?.classList.add('hidden');
    btnSwitch?.classList.remove('hidden');
    btnCapture?.classList.remove('hidden');
  } catch (err) {
    showToast('No se pudo acceder a la cámara: ' + err.message, 'error');
  }
};

/**
 * Alternar entre cámara frontal y trasera en Diseñador
 */
window.switchBadgeCameraFacing = async function() {
  badgeCameraFacing = badgeCameraFacing === 'user' ? 'environment' : 'user';
  await startBadgeCamera();
};

/**
 * Capturar Foto en Vivo e Inyectar en el Fotocheck
 */
window.captureBadgePhoto = function() {
  const video = document.getElementById('badge-camera-video');
  if (!video || !badgeCameraStream) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 480;
  canvas.height = video.videoHeight || 480;

  const ctx = canvas.getContext('2d');
  if (badgeCameraFacing === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    badgeCapturedBlob = blob;
    pendingPhotoFile = blob;

    const badgePhoto = document.getElementById('badge-photo');
    if (badgePhoto) {
      badgePhoto.src = URL.createObjectURL(blob);
    }

    showToast('¡Foto capturada y aplicada al fotocheck! Presiona "Guardar y Actualizar Fotocheck".', 'success');
    stopBadgeCamera();
  }, 'image/jpeg', 0.9);
};

/**
 * Detener Cámara de Fotochecks
 */
window.stopBadgeCamera = function() {
  if (badgeCameraStream) {
    badgeCameraStream.getTracks().forEach(t => t.stop());
    badgeCameraStream = null;
  }
  const video = document.getElementById('badge-camera-video');
  const placeholder = document.getElementById('badge-camera-placeholder');
  const btnStart = document.getElementById('btn-start-badge-camera');
  const btnSwitch = document.getElementById('btn-switch-badge-camera');
  const btnCapture = document.getElementById('btn-capture-badge-camera');

  if (video) video.classList.add('hidden');
  if (placeholder) placeholder?.classList.remove('hidden');
  if (btnStart) btnStart.classList.remove('hidden');
  if (btnSwitch) btnSwitch.classList.add('hidden');
  if (btnCapture) btnCapture.classList.add('hidden');
};

/**
 * Guardar Cambios de Edición Rápida (Nombre, Tipo Doc, DNI, Cargo, Sede, Foto)
 */
async function handleSaveQuickChanges() {
  if (!selectedEmployee) {
    showToast('Selecciona un colaborador primero.', 'warning');
    return;
  }

  const firstName = document.getElementById('quick-first-name').value.trim();
  const lastName = document.getElementById('quick-last-name').value.trim();
  const docType = document.getElementById('quick-doc-type') ? document.getElementById('quick-doc-type').value : 'DNI';
  const docNumber = document.getElementById('quick-doc-number').value.trim();
  const positionName = document.getElementById('quick-position').value.trim();
  const bloodType = document.getElementById('quick-blood-type').value;
  const emergencyPhone = document.getElementById('quick-emergency-phone').value.trim();
  const branchId = document.getElementById('quick-branch') ? document.getElementById('quick-branch').value : (selectedEmployee.branch_id || 1);

  if (!firstName || !lastName || !docNumber) {
    showToast('Nombres, Apellidos y Número de Documento son obligatorios.', 'warning');
    return;
  }

  const formData = new FormData();
  formData.append('first_name', firstName);
  formData.append('last_name', lastName);
  formData.append('document_type', docType);
  formData.append('document_number', docNumber);
  formData.append('position_name', positionName);
  formData.append('blood_type', bloodType);
  formData.append('emergency_contact_phone', emergencyPhone);
  formData.append('branch_id', branchId);
  formData.append('department_id', positionName.toUpperCase().includes('TROQUELADO') ? 6 : (selectedEmployee.department_id || 5));
  formData.append('shift_id', selectedEmployee.shift_id || 1);
  formData.append('work_mode', selectedEmployee.work_mode || 'PRESENTIAL');
  formData.append('status', selectedEmployee.status || 'ACTIVE');

  if (pendingPhotoFile) {
    formData.append('photo', pendingPhotoFile);
  }

  try {
    showToast('Guardando cambios en el servidor...', 'info');
    const response = await api.employees.update(selectedEmployee.id, formData);

    if (response && response.success) {
      showToast('¡Datos y fotocheck actualizados exitosamente!', 'success');
      pendingPhotoFile = null;
      await loadEmployees();
      await selectEmployee(selectedEmployee.id);
    } else {
      showToast(response.message || 'Error al actualizar.', 'error');
    }
  } catch (error) {
    showToast('Error al guardar: ' + error.message, 'error');
  }
}

/**
 * Cambiar tema de la tarjeta
 */
function setCardTheme(themeClass) {
  currentTheme = themeClass;
  const front = document.getElementById('badge-front');
  const back = document.getElementById('badge-back');

  const allThemes = ['theme-dalupezmar', 'theme-corporate-blue', 'theme-modern-purple', 'theme-industrial-emerald', 'theme-tech-dark'];

  if (front && back) {
    allThemes.forEach(t => {
      front.classList.remove(t);
      back.classList.remove(t);
    });
    front.classList.add(themeClass);
    back.classList.add(themeClass);
  }
}

/**
 * Regenerar hash QR
 */
async function handleRegenerateToken() {
  if (!selectedEmployee) return;

  if (!confirm(`¿Deseas regenerar el código QR para ${selectedEmployee.first_name} ${selectedEmployee.last_name}?`)) {
    return;
  }

  try {
    const response = await api.badges.regenerate(selectedEmployee.id, {
      template_theme: 'DALUPEZMAR_OFFICIAL'
    });

    if (response && response.success) {
      showToast('¡Token QR seguro regenerado exitosamente!', 'success');
      await selectEmployee(selectedEmployee.id);
    }
  } catch (error) {
    showToast('Error al regenerar token: ' + error.message, 'error');
  }
}

/**
 * Imprimir Fotocheck Individual Actual (Frente + Dorso Plegable)
 */
async function handlePrintSingle() {
  if (!selectedEmployee) {
    showToast('Selecciona un colaborador primero.', 'warning');
    return;
  }
  await printEmployeesBadges([selectedEmployee], `Fotocheck Oficial - ${selectedEmployee.first_name} ${selectedEmployee.last_name}`);
}

async function handleDownloadPdf() {
  if (!selectedEmployee) return;

  showToast('Generando PDF de alta resolución...', 'info');

  const { jsPDF } = window.jspdf;
  const frontEl = document.getElementById('badge-front');
  const backEl = document.getElementById('badge-back');

  try {
    const canvasFront = await html2canvas(frontEl, { scale: 3, useCORS: true });
    const canvasBack = await html2canvas(backEl, { scale: 3, useCORS: true });

    const imgDataFront = canvasFront.toDataURL('image/png');
    const imgDataBack = canvasBack.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [53.98, 85.60]
    });

    pdf.addImage(imgDataFront, 'PNG', 0, 0, 53.98, 85.60);
    pdf.addPage([53.98, 85.60], 'portrait');
    pdf.addImage(imgDataBack, 'PNG', 0, 0, 53.98, 85.60);

    pdf.save(`Fotocheck_DALUPEZMAR_${selectedEmployee.document_number}_${selectedEmployee.last_name}.pdf`);
    showToast('¡PDF de fotocheck oficial descargado!', 'success');
  } catch (error) {
    console.error('Error al generar PDF:', error);
    showToast('Error al crear PDF: ' + error.message, 'error');
  }
}

function renderBatchList() {
  const container = document.getElementById('batch-employee-list');
  const totalCountEl = document.getElementById('batch-total-count');
  if (!container) return;

  const activeEmployees = allEmployees.filter(emp => (emp.status || 'ACTIVE') === 'ACTIVE');

  if (totalCountEl) totalCountEl.textContent = activeEmployees.length;

  container.innerHTML = activeEmployees.map(emp => `
    <label class="flex items-center justify-between p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800 transition cursor-pointer">
      <div class="flex items-center gap-3">
        <input type="checkbox" value="${emp.id}" checked class="batch-emp-checkbox w-4 h-4 text-cyan-600 rounded bg-slate-950 border-slate-700" onchange="updateBatchCount()">
        <div>
          <p class="text-xs font-bold text-white">${emp.first_name} ${emp.last_name}</p>
          <p class="text-[10px] text-slate-400 font-mono"><span class="text-amber-400 font-bold">${emp.document_type || 'DNI'}:</span> ${emp.document_number} • <b class="text-cyan-400">${emp.position_name || 'Operario'}</b></p>
        </div>
      </div>
      <span class="text-[10px] font-semibold text-slate-400 font-mono">${emp.employee_code}</span>
    </label>
  `).join('');

  updateBatchCount();
}

function updateBatchCount() {
  const selected = document.querySelectorAll('.batch-emp-checkbox:checked');
  const countEl = document.getElementById('batch-selected-count');
  if (countEl) {
    countEl.textContent = `${selected.length} seleccionados`;
  }
}

/**
 * Generador de Planchas de Impresión A4 de Fotochecks Plegables (Frente + Dorso)
 */
async function handleGenerateBatchPrint() {
  const selectedCbs = document.querySelectorAll('.batch-emp-checkbox:checked');
  if (selectedCbs.length === 0) {
    showToast('Selecciona al menos un colaborador.', 'warning');
    return;
  }

  const selectedIds = Array.from(selectedCbs).map(cb => Number(cb.value));
  const employeesToPrint = allEmployees.filter(e => selectedIds.includes(e.id));

  await printEmployeesBadges(employeesToPrint, `Plancha de Emisión Oficial de Fotochecks (Total: ${employeesToPrint.length} colaboradores)`);
}

/**
 * Generador Seguro y Ultra-Rápido de QR (Cero Congelamientos)
 */
function generateSafeQrDataUrl(payload) {
  return new Promise((resolve) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 160;
    tempCanvas.height = 160;

    // Timeout de seguridad: Si demora más de 100ms, resuelve con fallback de inmediato
    const timer = setTimeout(() => {
      resolve(`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(payload)}`);
    }, 100);

    try {
      if (window.QRCode && QRCode.toCanvas) {
        QRCode.toCanvas(tempCanvas, payload, {
          width: 160,
          margin: 1,
          color: { dark: '#002855', light: '#ffffff' }
        }).then(() => {
          clearTimeout(timer);
          try {
            resolve(tempCanvas.toDataURL('image/png'));
          } catch (e) {
            resolve(`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(payload)}`);
          }
        }).catch(() => {
          clearTimeout(timer);
          resolve(`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(payload)}`);
        });
      } else {
        clearTimeout(timer);
        resolve(`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(payload)}`);
      }
    } catch (err) {
      clearTimeout(timer);
      resolve(`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(payload)}`);
    }
  });
}

/**
 * Función Maestra de Impresión de Fotochecks Plegables (Individual o Lote)
 * Procesamiento ultra-rápido en paralelo con Promise.all
 */
async function printEmployeesBadges(employeesList, subtitleText) {
  showToast('Generando credenciales listas para impresión...', 'info');

  const defaultAvatarSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240"><rect width="200" height="240" fill="%23f1f5f9"/><circle cx="100" cy="85" r="45" fill="%23cbd5e1"/><path d="M25 220 C25 155, 60 145, 100 145 C140 145, 175 155, 175 220 Z" fill="%23cbd5e1"/></svg>`;

  // Procesar todas las tarjetas en paralelo instantáneamente
  const processedCards = await Promise.all(employeesList.map(async (emp) => {
    const posName = (emp.position_name || 'OPERARIO').toUpperCase();
    const posLower = (emp.position_name || '').toLowerCase();
    const deptLower = (emp.department_name || '').toLowerCase();
    let bannerColor = '#0284c7';
    if (posLower.includes('exterior') || posLower.includes('externa') || posLower.includes('externo') || deptLower.includes('exterior') || deptLower.includes('externa')) {
      bannerColor = '#ea580c'; // NARANJA INTENSO CORPORATIVO PARA AREA EXTERIOR / EXTERNA
    } else if (posLower.includes('troquelado') || posLower.includes('anillas')) {
      bannerColor = '#16a34a'; // VERDE VIBRANTE PROFESIONAL PARA TROQUELADO DE ANILLAS
    } else if (posLower.includes('supervisor') || posLower.includes('jefe') || posLower.includes('gerente') || posLower.includes('coordinador')) {
      bannerColor = '#4c1d95';
    } else if (posLower.includes('calidad') || posLower.includes('seguridad') || posLower.includes('sst')) {
      bannerColor = '#059669';
    } else if (posLower.includes('mantenimiento') || posLower.includes('técnico') || posLower.includes('almacén') || posLower.includes('logística')) {
      bannerColor = '#0369a1';
    } else if (posLower.includes('administra') || posLower.includes('rrhh') || posLower.includes('contab')) {
      bannerColor = '#0f172a';
    }
    // Calcular tamaño de fuente y espaciado para que el cargo SIEMPRE quepa en 1 sola línea con altura fija
    let bannerFontSize = '7.8pt';
    let bannerLetterSpacing = '1px';
    if (posName.length > 22) {
      bannerFontSize = '5.6pt';
      bannerLetterSpacing = '0.1px';
    } else if (posName.length > 16) {
      bannerFontSize = '6.4pt';
      bannerLetterSpacing = '0.3px';
    } else if (posName.length > 10) {
      bannerFontSize = '7.2pt';
      bannerLetterSpacing = '0.6px';
    }

    const docType = emp.document_type || (emp.document_number && emp.document_number.length === 9 ? 'CEX' : 'DNI');
    const bannerText = posName;
    const areaText = posLower.includes('troquelado') ? 'Troquelado de Anillas' : ((posLower.includes('exterior') || posLower.includes('externa')) ? 'Área Exterior' : (emp.department_name || 'Producción'));
    const nombres = (emp.first_name || '').trim().toUpperCase();
    const apellidos = (emp.last_name || '').trim().toUpperCase();
    const qrPayload = emp.qr_token_hash || `AGY_SEC_QR_${emp.employee_code}_${emp.document_number}`;

    // 1. Generar Código QR de forma instantánea
    const qrDataUrl = await generateSafeQrDataUrl(qrPayload);

    // 2. Generar Código de Barras SVG Vectorial de Alta Lectura
    let barcodeSvgHtml = '';
    try {
      const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(tempSvg, emp.barcode_value || emp.document_number, {
        format: 'CODE128',
        lineColor: '#002855',
        width: 1.85,
        height: 54,
        displayValue: true,
        fontSize: 11.5,
        font: 'Montserrat',
        margin: 1
      });
      barcodeSvgHtml = tempSvg.outerHTML;
    } catch (e) {
      console.warn('Error barcode:', e);
    }

    // Foto Real o Avatar SVG Oficial Nítido (Garantizado sin imágenes rotas)
    let photoSrc = defaultAvatarSvg;
    if (emp.photo_url && !emp.photo_url.includes('default-avatar') && !emp.photo_url.includes('emp-100')) {
      photoSrc = emp.photo_url.startsWith('http') || emp.photo_url.startsWith('data:') ? emp.photo_url : `${window.location.origin}${emp.photo_url}`;
    }

    return {
      emp,
      docType,
      areaText,
      nombres,
      apellidos,
      bannerColor,
      bannerText,
      bannerFontSize,
      bannerLetterSpacing,
      qrDataUrl,
      barcodeSvgHtml,
      photoSrc
    };
  }));

  // Generar HTML de pares plegables (Lado Izquierdo = Frente, Lado Derecho = Dorso)
  const pairsHtml = processedCards.map(item => `
    <div class="badge-fold-pair">
      
      <!-- ================= PARTE IZQUIERDA: FRENTE ================= -->
      <div class="badge-card-face badge-front-face">
        
        <!-- Decoración Geométrica Superior a Color -->
        <div class="deco-top"></div>

        <!-- Ranura para colgador -->
        <div class="lanyard-hole"></div>

        <!-- Cabecera DALUPEZMAR -->
        <div class="header-box">
          <svg class="sailboat-logo" viewBox="0 0 100 100">
            <path d="M50 12 C44 34, 28 54, 12 65 C34 59, 44 38, 50 12 Z" fill="#002855"/>
            <path d="M55 20 C62 38, 77 54, 90 64 C72 61, 60 43, 55 20 Z" fill="#00b4d8"/>
            <path d="M18 72 C35 67, 65 67, 82 72 C65 78, 35 78, 18 72 Z" fill="#002855"/>
            <path d="M26 78 C42 74, 58 74, 74 78 C60 83, 40 83, 26 78 Z" fill="#00b4d8"/>
          </svg>
          <div class="company-title">DALUPEZMAR</div>
          <div class="company-sub">SERVICIOS INDUSTRIALES</div>
        </div>

        <!-- Foto del Trabajador -->
        <div class="photo-frame">
          <img src="${item.photoSrc}" onerror="this.onerror=null;this.src='${defaultAvatarSvg}'" alt="Foto">
        </div>

        <!-- Nombres y Apellidos Grandes y Legibles -->
        <div class="name-block">
          <div class="worker-names">${item.nombres}</div>
          <div class="worker-surnames">${item.apellidos}</div>
          <div class="worker-dni">${item.docType}: ${item.emp.document_number}</div>
        </div>

        <!-- Código QR Frontal Perfectamente Centrado -->
        <div class="qr-front-container">
          <div class="qr-card-white">
            <img src="${item.qrDataUrl}" class="qr-print-img" alt="QR">
            <div class="qr-label-group">
              <span class="qr-code-label">${item.emp.employee_code}</span>
              <span class="qr-verified-badge">● QR ACTIVO</span>
            </div>
          </div>
        </div>

        <!-- Decoración Geométrica Inferior a Color -->
        <div class="deco-bottom"></div>

        <!-- Banner de Cargo con Altura Fija y Texto Auto-Ajustado -->
        <div class="role-banner" style="background: ${item.bannerColor} !important; font-size: ${item.bannerFontSize}; letter-spacing: ${item.bannerLetterSpacing};">
          <span class="role-banner-text">${item.bannerText}</span>
        </div>

      </div>

      <!-- ================= LÍNEA DE PLEGADO CENTRAL ================= -->
      <div class="fold-divider">
        <span class="fold-text">DOBLAR AQUÍ</span>
      </div>

      <!-- ================= PARTE DERECHA: REVERSO A COLOR OFICIAL ================= -->
      <div class="badge-card-face badge-back-face">
        
        <!-- Decoración Geométrica Superior (Reverso a Color) -->
        <div class="deco-top"></div>

        <div class="lanyard-hole"></div>

        <!-- Cabecera Reverso -->
        <div class="header-box">
          <div style="display: flex; align-items: center; justify-content: center; gap: 1.5mm;">
            <svg style="width: 5.5mm; height: 5.5mm;" viewBox="0 0 100 100">
              <path d="M50 15 C45 35, 30 55, 15 65 C35 60, 45 40, 50 15 Z" fill="#002855"/>
              <path d="M54 22 C60 40, 75 55, 88 65 C70 62, 58 45, 54 22 Z" fill="#00b4d8"/>
            </svg>
            <span style="font-size: 9.5pt; font-weight: 900; color: #002855; letter-spacing: 0.5px;">DALUPEZMAR S.A.C.</span>
          </div>
          <p class="terms-text">
            Credencial oficial de identificación y control de asistencia en planta. En caso de pérdida comunicarse con los teléfonos: <b style="color: #002855; font-weight: 900;">+51 958 544 726 - +51 935 936 168</b>
          </p>
        </div>

        <!-- Datos Médicos y de Emergencia Grandes y Claros -->
        <div class="med-info-box">
          <div class="med-row">
            <span class="med-label">GRUPO SANGUÍNEO:</span>
            <span class="med-val text-red">${item.emp.blood_type || 'O+'}</span>
          </div>
          <div class="med-row" style="flex-direction: column; align-items: flex-start; gap: 0.4mm;">
            <span class="med-label">CONTACTO DE EMERGENCIA:</span>
            <span class="med-val" style="font-size: 7.8pt; color: #002855; font-weight: 900;">${item.emp.emergency_contact_phone || '+51 911111111'}</span>
          </div>
          <div class="med-row">
            <span class="med-label">PLANTA PRINCIPAL:</span>
            <span class="med-val" style="color: #002855; font-weight: 900; font-size: 6.5pt;">PECEPE S.A.C.</span>
          </div>
          <div class="med-row" style="border: none; padding-bottom: 0;">
            <span class="med-label">ÁREA:</span>
            <span class="med-val" style="color: #002855; font-weight: 800; font-size: 6.5pt;">${item.areaText}</span>
          </div>
        </div>

        <!-- Código de Barras Lineal Grande -->
        <div class="barcode-box">
          ${item.barcodeSvgHtml}
        </div>

        <!-- Pie de Reverso con RUC y Domicilio Oficial -->
        <div class="back-footer">
          <p class="ruc-line">DALUPEZMAR S.A.C. • RUC N° 20615714128</p>
          <p class="address-line">P.J. Calle Asoc De Fam Santa Rosa De Villa Lomo De Corvina Mz.F, Lt 2, Villa El Salvador</p>
        </div>

        <!-- Decoración Geométrica Inferior a Color (SOLO COLOR ORIGINAL, SIN TEXTO) -->
        <div class="deco-bottom"></div>

      </div>

    </div>
  `).join('');

  // Abrir ventana de impresión con estilos 100% calibrados para termolaminado sin desperdicios en A4 (Medida 49x79 mm)
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <title>DALUPEZMAR - Plancha de Fotochecks Plegables (49x79 mm)</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,700;0,800;0,900;1,700;1,800;1,900&family=Plus+Jakarta+Sans:wght@700;800&display=swap');
        
        @page {
          size: A4 portrait;
          margin: 4mm 4mm;
        }

        * {
          box-sizing: border-box;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }

        body {
          margin: 0;
          padding: 0;
          font-family: 'Montserrat', sans-serif;
          background: #ffffff;
          color: #002855;
        }

        /* REJILLA A4 PARA MEDIDA EXACTA 49mm x 79mm (PAR DE 98mm x 79mm) */
        .print-grid {
          display: grid !important;
          grid-template-columns: 98mm 98mm !important;
          gap: 4.5mm 3.5mm !important;
          justify-content: center !important;
          align-content: start !important;
          width: 100%;
        }

        /* Contenedor del Par Plegable Calibrado a 98mm x 79mm */
        .badge-fold-pair {
          width: 98mm !important;
          height: 79mm !important;
          border: 1px dashed #64748b;
          border-radius: 3.5mm;
          display: flex;
          position: relative;
          background: #ffffff;
          page-break-inside: avoid !important;
          overflow: hidden;
          margin: 0;
        }

        /* Cada Cara de la tarjeta (49mm x 79mm exactos) */
        .badge-card-face {
          width: 49mm !important;
          height: 79mm !important;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 1.4mm 1.6mm;
          background: #ffffff;
          overflow: hidden;
          text-align: center;
        }

        /* Línea de plegado central divisoria a 49mm */
        .fold-divider {
          position: absolute;
          left: 49mm;
          top: 0;
          bottom: 0;
          width: 1px;
          border-left: 1.2px dotted #002855;
          z-index: 30;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .fold-text {
          font-size: 4pt;
          font-weight: 800;
          color: #002855;
          transform: rotate(-90deg);
          white-space: nowrap;
          background: #ffffff;
          padding: 0 1mm;
        }

        /* Decoraciones Geométricas en Color Exacto */
        .deco-top {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 10.5mm;
          background: linear-gradient(135deg, #7dd3fc 0%, #38bdf8 45%, #0284c7 100%) !important;
          clip-path: polygon(0 0, 100% 0, 100% 40%, 0 100%);
          z-index: 1;
        }

        .deco-bottom {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 12.5mm;
          background: linear-gradient(135deg, #0284c7 0%, #00b4d8 50%, #38bdf8 100%) !important;
          clip-path: polygon(0 45%, 100% 0, 100% 100%, 0 100%);
          z-index: 1;
        }

        .lanyard-hole {
          width: 9.5mm;
          height: 2.2mm;
          border-radius: 1.2mm;
          background: rgba(0, 0, 0, 0.35) !important;
          border: 0.6px solid rgba(255, 255, 255, 0.7);
          position: absolute;
          top: 1.6mm;
          left: 50%;
          transform: translateX(-50%);
          z-index: 25;
        }

        .header-box {
          position: relative;
          z-index: 10;
          margin-top: 3.4mm;
        }

        .sailboat-logo {
          width: 5.8mm;
          height: 5.8mm;
          margin: 0 auto;
          display: block;
        }

        .company-title {
          font-size: 7.5pt;
          font-weight: 900;
          color: #002855;
          letter-spacing: 0.3px;
          line-height: 1;
          margin-top: 0.2mm;
        }

        .company-sub {
          font-size: 3.8pt;
          font-weight: 800;
          color: #002855;
          letter-spacing: 0.6px;
        }

        .photo-frame {
          position: relative;
          z-index: 10;
          width: 18.5mm;
          height: 20mm;
          border-radius: 2mm;
          border: 1.5px solid #000000;
          overflow: hidden;
          margin: 0.2mm auto;
          background: #ffffff;
        }

        .photo-frame img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .name-block {
          position: relative;
          z-index: 10;
          padding: 0 0.6mm;
        }

        /* NOMBRES Y APELLIDOS GRANDES Y CLAROS */
        .worker-names {
          font-size: 7pt;
          font-weight: 800;
          color: #002855;
          line-height: 1.08;
          letter-spacing: 0.1px;
          word-break: break-word;
        }

        .worker-surnames {
          font-size: 8.2pt;
          font-weight: 900;
          font-style: italic;
          color: #002855;
          line-height: 1.08;
          margin-top: 0.2mm;
          word-break: break-word;
        }

        .worker-dni {
          font-size: 8.5pt;
          font-weight: 900;
          color: #d90429 !important;
          text-decoration: underline;
          margin-top: 0.4mm;
        }

        /* CONTENEDOR QR FRONTAL CENTRADO CON SEPARACIÓN SEGURA */
        .qr-front-container {
          position: relative;
          z-index: 10;
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          margin: 0.2mm auto 5.8mm auto;
        }

        .qr-card-white {
          background: #ffffff;
          border: 1.2px solid #0284c7;
          border-radius: 1.8mm;
          padding: 0.8mm 1.5mm;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 1.5mm;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          margin: 0 auto;
        }

        .qr-print-img {
          width: 14mm;
          height: 14mm;
          display: block;
          object-fit: contain;
          flex-shrink: 0;
        }

        .qr-label-group {
          text-align: left;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .qr-code-label {
          font-size: 5.5pt;
          font-weight: 900;
          font-family: 'Plus Jakarta Sans', sans-serif;
          color: #002855;
          line-height: 1.1;
        }

        .qr-verified-badge {
          font-size: 4.8pt;
          font-weight: 800;
          color: #059669;
          line-height: 1.1;
        }

        /* BANDA INFERIOR CON TAMAÑO FIJO Y TEXTO AUTO-ESCALADO */
        .role-banner {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 5.2mm !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          padding: 0 1mm !important;
          box-sizing: border-box !important;
          font-weight: 900;
          color: #ffffff !important;
          z-index: 20;
          overflow: hidden !important;
          white-space: nowrap !important;
        }

        .role-banner-text {
          display: block;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          line-height: 1;
        }

        /* Reverso Estilos Legibles y Ampliados */
        .terms-text {
          font-size: 4.8pt;
          color: #1e293b;
          line-height: 1.2;
          margin: 0.5mm 0 0 0;
          padding: 0 0.5mm;
          font-weight: 700;
        }

        .med-info-box {
          background: #f0f9ff !important;
          border: 0.9px solid #bae6fd;
          border-radius: 1.8mm;
          padding: 1.2mm 1.6mm;
          margin: 0.6mm 0;
          font-size: 6pt;
          text-align: left;
          position: relative;
          z-index: 10;
        }

        .med-row {
          display: flex;
          justify-content: space-between;
          padding: 0.4mm 0;
          border-bottom: 0.5px solid #e0f2fe;
        }

        .med-label {
          font-weight: 900;
          color: #334155;
          font-size: 5.8pt;
        }

        .med-val {
          font-weight: 900;
          font-size: 6.2pt;
        }

        .text-red {
          color: #e11d48 !important;
          font-size: 7.8pt;
          font-weight: 900;
        }

        .barcode-box {
          background: #ffffff;
          border: 0.8px solid #cbd5e1;
          border-radius: 1.8mm;
          padding: 0.5mm 0.3mm;
          margin: 0.3mm auto;
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44.2mm;
          box-sizing: border-box;
        }

        .barcode-box svg {
          width: 43.5mm;
          height: 11.5mm;
          display: block;
          max-width: 100%;
        }

        /* PIE DE REVERSO CON DATOS LEGALES */
        .back-footer {
          position: relative;
          z-index: 10;
          padding: 0 0.5mm;
          margin-bottom: 2.5mm;
          text-align: center;
        }

        .ruc-line {
          font-size: 5.6pt;
          font-weight: 900;
          color: #002855;
          margin: 0;
          line-height: 1.1;
        }

        .address-line {
          font-size: 4.5pt;
          font-weight: 800;
          color: #334155;
          margin: 0.2mm 0 0 0;
          line-height: 1.1;
        }
      </style>
    </head>
    <body onload="window.print()">
      <div class="print-grid">
        ${pairsHtml}
      </div>
    </body>
    </html>
  `);

  printWindow.document.close();
}
