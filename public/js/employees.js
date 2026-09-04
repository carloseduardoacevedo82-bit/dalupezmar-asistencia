/**
 * Lógica del Módulo de Gestión de Empleados y Catálogos
 */
const DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%231e293b'/%3E%3Ccircle cx='50' cy='38' r='20' fill='%23475569'/%3E%3Cpath d='M20 90 C20 68, 35 58, 50 58 C65 58, 80 68, 80 90 Z' fill='%23475569'/%3E%3C/svg%3E";

let catalogs = { branches: [], departments: [], positions: [], shifts: [] };
let employeesData = [];
let currentFolder = 'ACTIVE'; // 'ACTIVE' | 'INACTIVE'
let targetTerminateEmpId = null;

document.addEventListener('DOMContentLoaded', async () => {
  initEmployeeListeners();
  await loadCatalogs();
  await loadEmployeesList();
});

function initEmployeeListeners() {
  // Modal de Empleado
  const modal = document.getElementById('modal-employee');
  document.getElementById('btn-open-new-emp-modal')?.addEventListener('click', () => {
    openEmployeeModal();
  });

  document.getElementById('btn-close-emp-modal')?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });

  document.getElementById('btn-cancel-emp-modal')?.addEventListener('click', () => {
    modal?.classList.add('hidden');
  });

  // Modal de Dar de Baja
  const terminateModal = document.getElementById('modal-terminate-emp');
  document.getElementById('btn-cancel-terminate')?.addEventListener('click', () => {
    terminateModal?.classList.add('hidden');
    targetTerminateEmpId = null;
  });

  document.getElementById('btn-confirm-terminate')?.addEventListener('click', handleConfirmTerminate);

  // Filtros en tiempo real
  document.getElementById('emp-search')?.addEventListener('input', applyFilters);
  document.getElementById('emp-filter-dept')?.addEventListener('change', applyFilters);
  document.getElementById('emp-filter-mode')?.addEventListener('change', applyFilters);

  // Submit de formulario
  document.getElementById('form-employee')?.addEventListener('submit', handleEmployeeFormSubmit);
}

/**
 * Cambiar entre Carpeta de Personal Activo y Carpeta de Bajas
 */
window.switchFolder = function(folder) {
  currentFolder = folder;
  
  const tabActive = document.getElementById('tab-folder-active');
  const tabInactive = document.getElementById('tab-folder-inactive');

  if (folder === 'ACTIVE') {
    tabActive.className = "px-5 py-2.5 rounded-2xl bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 font-bold text-xs flex items-center gap-2.5 transition shadow-lg shadow-emerald-950/40 cursor-pointer";
    tabInactive.className = "px-5 py-2.5 rounded-2xl bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200 hover:bg-slate-800 font-bold text-xs flex items-center gap-2.5 transition cursor-pointer";
  } else {
    tabActive.className = "px-5 py-2.5 rounded-2xl bg-slate-900/80 text-slate-400 border border-slate-800 hover:text-slate-200 hover:bg-slate-800 font-bold text-xs flex items-center gap-2.5 transition cursor-pointer";
    tabInactive.className = "px-5 py-2.5 rounded-2xl bg-rose-600/20 text-rose-300 border border-rose-500/40 font-bold text-xs flex items-center gap-2.5 transition shadow-lg shadow-rose-950/40 cursor-pointer";
  }

  applyFilters();
};

/**
 * Cargar catálogos maestros
 */
async function loadCatalogs() {
  try {
    const res = await api.employees.getCatalogs();
    if (res && res.data) {
      catalogs = res.data;

      // Poblar filtros con Áreas y Puestos clave
      const deptFilter = document.getElementById('emp-filter-dept');
      if (deptFilter) {
        deptFilter.innerHTML = `
          <option value="">Todas las Áreas / Puestos</option>
          <option value="Troquelado de Anillas">Troquelado de Anillas</option>
          <option value="Área Exterior">Área Exterior</option>
          <option value="Producción">Producción</option>
          <option value="Operaciones y Logística">Operaciones y Logística</option>
          <option value="Administración y Finanzas">Administración y Finanzas</option>
          <option value="Recursos Humanos y Talento">Recursos Humanos y Talento</option>
          <option value="Tecnología e Innovación">Tecnología e Innovación</option>
        `;
      }

      // Poblar selects del modal (PECEPE S.A.C. como primera opción)
      populateSelect('emp-branch', catalogs.branches, 'id', 'name');
      populateSelect('emp-department', catalogs.departments, 'id', 'name');
      populateSelect('emp-position', catalogs.positions, 'id', 'name');
      
      // Normalización estricta de selector de turnos DALUPEZMAR
      const shiftSelect = document.getElementById('shiftType') || document.getElementById('emp-shift');
      if (shiftSelect) {
        shiftSelect.innerHTML = `
          <option value="diurno">Diurno (07:30 - 19:00)</option>
          <option value="nocturno">Nocturno (19:30 - 07:00)</option>
        `;
      }
    }
  } catch (error) {
    console.error('Error al cargar catálogos:', error);
  }
}

function populateSelect(elementId, items, valueKey, textKey) {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.innerHTML = items.map(item => {
    const text = typeof textKey === 'function' ? textKey(item) : item[textKey];
    return `<option value="${item[valueKey]}">${text}</option>`;
  }).join('');
}

/**
 * Cargar lista de empleados
 */
async function loadEmployeesList() {
  try {
    const res = await api.employees.getAll();
    if (res && res.data) {
      employeesData = res.data;
      updateFolderCounters();
      applyFilters();
    }
  } catch (error) {
    showToast('Error al cargar lista de personal: ' + error.message, 'error');
  }
}

/**
 * Actualizar contadores de las carpetas
 */
function updateFolderCounters() {
  const activeCount = employeesData.filter(e => e.status !== 'INACTIVE' && e.status !== 'SUSPENDED').length;
  const inactiveCount = employeesData.filter(e => e.status === 'INACTIVE' || e.status === 'SUSPENDED').length;

  const badgeActive = document.getElementById('badge-count-active');
  const badgeInactive = document.getElementById('badge-count-inactive');

  if (badgeActive) badgeActive.textContent = activeCount;
  if (badgeInactive) badgeInactive.textContent = inactiveCount;
}

/**
 * Renderizar tabla según la carpeta y filtros
 */
function renderEmployeesTable(list) {
  const tbody = document.getElementById('employees-table-body');
  if (!tbody) return;

  if (list.length === 0) {
    const emptyMsg = currentFolder === 'ACTIVE' 
      ? 'No se encontraron colaboradores activos con los filtros aplicados.' 
      : 'No hay colaboradores en la carpeta de bajas / cesados.';
    tbody.innerHTML = `<tr><td colspan="7" class="px-6 py-12 text-center text-slate-500 text-xs">${emptyMsg}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(emp => {
    const isInactive = emp.status === 'INACTIVE' || emp.status === 'SUSPENDED';
    const docType = emp.document_type || (emp.document_number && emp.document_number.length === 9 ? 'CEX' : 'DNI');
    const positionName = emp.position_name || 'OPERARIO DE PRODUCCIÓN';
    
    // Tag de color según puesto
    let posBadgeColor = 'text-slate-400 bg-slate-800/40 border-slate-700/50';
    if (positionName.includes('TROQUELADO')) {
      posBadgeColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
    } else if (positionName.includes('EXTERIOR') || positionName.includes('EXTERNA')) {
      posBadgeColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
    } else if (positionName.includes('GERENTE')) {
      posBadgeColor = 'text-purple-400 bg-purple-500/10 border-purple-500/30';
    } else if (positionName.includes('SUPERVISOR')) {
      posBadgeColor = 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    }

    const area = (positionName.toUpperCase().includes('TROQUELADO')) 
      ? 'Troquelado de Anillas' 
      : (emp.department_name || 'Producción');

    return `
      <tr class="hover:bg-slate-900/50 transition">
        <!-- Colaborador con Foto Ampliada -->
        <td class="px-6 py-4 flex items-center gap-4 min-w-[280px]">
          <div class="relative group">
            <img src="${emp.photo_url || DEFAULT_AVATAR}" width="56" height="56" loading="lazy" class="w-14 h-14 min-w-[56px] min-h-[56px] rounded-2xl object-cover border-2 border-slate-700/80 shadow-md transition transform group-hover:scale-105" onerror="this.onerror=null; this.src=DEFAULT_AVATAR;">
          </div>
          <div>
            <p class="font-extrabold text-white text-sm uppercase tracking-tight leading-snug">${(emp.last_name && emp.first_name) ? `${emp.last_name}, ${emp.first_name}`.toUpperCase() : `${emp.first_name || ''} ${emp.last_name || ''}`.trim().toUpperCase()}</p>
            <p class="text-xs text-slate-400 font-mono mt-0.5">${emp.employee_code} <span class="text-slate-600">•</span> ${emp.email || 'DALUPEZMAR'}</p>
          </div>
        </td>

        <!-- Documento -->
        <td class="px-6 py-4 min-w-[140px]">
          <span class="inline-block px-2 py-0.5 rounded text-[11px] font-black text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 mb-1">${docType}</span>
          <p class="font-mono font-extrabold text-sm text-slate-200">${emp.document_number}</p>
        </td>

        <!-- Área / Cargo -->
        <td class="px-6 py-4 min-w-[200px]">
          <p class="font-extrabold text-slate-200 text-xs uppercase">${area}</p>
          <span class="inline-block mt-1 px-2.5 py-0.5 rounded-lg text-[11px] font-bold border ${posBadgeColor}">
            ${positionName}
          </span>
        </td>

        <!-- Sede / Planta -->
        <td class="px-6 py-4 min-w-[140px]">
          <p class="font-black text-sm text-blue-400">PECEPE</p>
          <p class="text-xs font-bold text-slate-400">S.A.C.</p>
        </td>

        <!-- Turno Asignado -->
        <td class="px-6 py-4 min-w-[170px]">
          ${(String(emp.shift_name || emp.shift_type || '').toLowerCase().includes('noct') || emp.shift_id === 2 || String(emp.shift_id) === '2')
            ? '<span class="inline-block px-3 py-1.5 rounded-xl bg-purple-950/50 border border-purple-700/60 font-bold text-xs text-purple-300">🌙 Nocturno (19:30 - 07:00)</span>'
            : '<span class="inline-block px-3 py-1.5 rounded-xl bg-sky-950/50 border border-sky-700/60 font-bold text-xs text-sky-300">☀️ Diurno (07:30 - 19:00)</span>'
          }
        </td>

        <!-- Estado -->
        <td class="px-6 py-4 min-w-[130px]">
          <span class="inline-block px-3 py-1 rounded-full text-xs font-extrabold ${!isInactive ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'}">
            ${!isInactive ? 'ACTIVO' : 'CESADO / BAJA'}
          </span>
        </td>

        <!-- Acciones -->
        <td class="px-6 py-4 text-center min-w-[140px]">
          <div class="flex items-center justify-center gap-2.5">
            
            <!-- Ver Fotocheck Oficial vinculado -->
            <a href="/badge-designer.html?id=${emp.id}" title="Ver y Diseñar Fotocheck" class="p-2.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/25 transition cursor-pointer">
              <i data-lucide="badge-check" class="w-4.5 h-4.5"></i>
            </a>

            <!-- Editar Ficha y Foto -->
            <button onclick="openEmployeeModal(${emp.id})" title="Editar Datos y Foto" class="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer">
              <i data-lucide="pencil" class="w-4.5 h-4.5"></i>
            </button>

            ${!isInactive ? `
              <!-- Botón Dar de Baja (Mover a Carpeta de Bajas) -->
              <button onclick="openTerminateModal(${emp.id})" title="Dar de Baja a Personal Cesado" class="p-2.5 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/25 transition cursor-pointer">
                <i data-lucide="user-minus" class="w-4.5 h-4.5"></i>
              </button>
            ` : `
              <!-- Botón Reactivar (Mover a Carpeta de Activos) -->
              <button onclick="reactivateEmployee(${emp.id})" title="Reincorporar a Personal Activo" class="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer">
                <i data-lucide="user-check" class="w-4 h-4"></i> Reactivar
              </button>
            `}

          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

/**
 * Aplicar filtros de búsqueda, departamento y modalidad
 */
function applyFilters() {
  const search = document.getElementById('emp-search')?.value.toLowerCase().trim() || '';
  const deptVal = document.getElementById('emp-filter-dept')?.value.toLowerCase().trim() || '';
  const mode = document.getElementById('emp-filter-mode')?.value;

  const filtered = employeesData.filter(emp => {
    // 1. Filtro por Carpeta Activos / Bajas
    const isTerminated = emp.status === 'INACTIVE' || emp.status === 'SUSPENDED';
    const matchFolder = (currentFolder === 'ACTIVE') ? !isTerminated : isTerminated;
    if (!matchFolder) return false;

    // 2. Filtro por Búsqueda (Nombre, Apellidos, DNI, CEX, Código)
    const matchSearch = !search || 
      (emp.first_name && emp.first_name.toLowerCase().includes(search)) || 
      (emp.last_name && emp.last_name.toLowerCase().includes(search)) || 
      (emp.document_number && emp.document_number.includes(search)) || 
      (emp.employee_code && emp.employee_code.toLowerCase().includes(search));

    // 3. Filtro Inteligente por Área / Cargo
    const matchDept = !deptVal ||
      (emp.department_name && emp.department_name.toLowerCase().includes(deptVal)) ||
      (emp.position_name && emp.position_name.toLowerCase().includes(deptVal)) ||
      ((deptVal.includes('troquelado') || deptVal.includes('anillas')) && emp.position_name && emp.position_name.toLowerCase().includes('troquelado')) ||
      ((deptVal.includes('exterior') || deptVal.includes('externa')) && ((emp.position_name && (emp.position_name.toLowerCase().includes('exterior') || emp.position_name.toLowerCase().includes('externa'))) || (emp.department_name && (emp.department_name.toLowerCase().includes('exterior') || emp.department_name.toLowerCase().includes('externa')))));

    // 4. Filtro por Modalidad
    const matchMode = !mode || emp.work_mode === mode;

    return matchSearch && matchDept && matchMode;
  });

  // Ordenar en orden alfabético A-Z estrictamente por Apellidos y Nombres
  filtered.sort((a, b) => {
    const nameA = `${a.last_name || ''}, ${a.first_name || ''}`.trim().toLowerCase();
    const nameB = `${b.last_name || ''}, ${b.first_name || ''}`.trim().toLowerCase();
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
  });

  renderEmployeesTable(filtered);
}

/**
 * Abrir Modal de Cese / Dar de Baja
 */
window.openTerminateModal = function(empId) {
  const emp = employeesData.find(e => e.id === empId);
  if (!emp) return;

  targetTerminateEmpId = empId;
  const displayName = (emp.last_name && emp.first_name)
    ? `${emp.last_name}, ${emp.first_name}`.toUpperCase()
    : `${emp.first_name || ''} ${emp.last_name || ''}`.trim().toUpperCase();
  document.getElementById('terminate-emp-name').textContent = `${displayName} (${emp.document_type || 'DNI'}: ${emp.document_number})`;
  document.getElementById('terminate-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('modal-terminate-emp')?.classList.remove('hidden');
};

/**
 * Confirmar Cese y Mover a Carpeta de Bajas
 */
async function handleConfirmTerminate() {
  if (!targetTerminateEmpId) return;

  const emp = employeesData.find(e => e.id === targetTerminateEmpId);
  if (!emp) return;

  const reason = document.getElementById('terminate-reason')?.value || 'Cese Laboral';
  const termDate = document.getElementById('terminate-date')?.value || new Date().toISOString().split('T')[0];

  const formData = new FormData();
  formData.append('first_name', emp.first_name);
  formData.append('last_name', emp.last_name);
  formData.append('document_type', emp.document_type || 'DNI');
  formData.append('document_number', emp.document_number);
  formData.append('branch_id', emp.branch_id || 1);
  formData.append('department_id', emp.department_id || 1);
  formData.append('position_id', emp.position_id || 1);
  formData.append('shift_id', emp.shift_id || 1);
  formData.append('work_mode', emp.work_mode || 'PRESENTIAL');
  formData.append('status', 'INACTIVE'); // Marcar como Inactivo / Cesado

  try {
    showToast('Procesando baja del trabajador...', 'info');
    const res = await api.employees.update(targetTerminateEmpId, formData);

    if (res && res.success) {
      showToast(`¡Colaborador dado de baja correctamente y guardado en la Carpeta de Bajas!`, 'success');
      document.getElementById('modal-terminate-emp')?.classList.add('hidden');
      targetTerminateEmpId = null;
      await loadEmployeesList();
    } else {
      showToast(res.message || 'Error al procesar la baja.', 'error');
    }
  } catch (error) {
    showToast('Error: ' + error.message, 'error');
  }
}

/**
 * Reactivar / Reincorporar trabajador cesado
 */
window.reactivateEmployee = async function(empId) {
  const emp = employeesData.find(e => e.id === empId);
  if (!emp) return;

  const formData = new FormData();
  formData.append('first_name', emp.first_name);
  formData.append('last_name', emp.last_name);
  formData.append('document_type', emp.document_type || 'DNI');
  formData.append('document_number', emp.document_number);
  formData.append('branch_id', emp.branch_id || 1);
  formData.append('department_id', emp.department_id || 1);
  formData.append('position_id', emp.position_id || 1);
  formData.append('shift_id', emp.shift_id || 1);
  formData.append('work_mode', emp.work_mode || 'PRESENTIAL');
  formData.append('status', 'ACTIVE'); // Reactivar

  try {
    showToast('Reincorporando colaborador a planta...', 'info');
    const res = await api.employees.update(empId, formData);

    if (res && res.success) {
      showToast(`¡Colaborador reactivado con éxito y movido a la Carpeta de Activos!`, 'success');
      await loadEmployeesList();
    } else {
      showToast(res.message || 'Error al reactivar.', 'error');
    }
  } catch (error) {
    showToast('Error al reactivar: ' + error.message, 'error');
  }
};

let employeeCameraStream = null;
let currentCameraFacing = 'user'; // 'user' (frontal) o 'environment' (trasera)
let capturedPhotoBlob = null;
let currentPhotoMode = 'file'; // 'file' o 'camera'

/**
 * Cambiar entre modo Archivo y modo Cámara
 */
window.setEmployeePhotoMode = function(mode) {
  currentPhotoMode = mode;
  const btnFile = document.getElementById('btn-photo-mode-file');
  const btnCamera = document.getElementById('btn-photo-mode-camera');
  const containerFile = document.getElementById('container-photo-file');
  const containerCamera = document.getElementById('container-photo-camera');

  if (mode === 'camera') {
    btnCamera.className = 'px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 border transition bg-cyan-600/20 text-cyan-400 border-cyan-500/40 cursor-pointer';
    btnFile.className = 'px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 border transition bg-slate-800 text-slate-400 border-slate-700 hover:text-white cursor-pointer';
    containerCamera.classList.remove('hidden');
    containerFile.classList.add('hidden');
  } else {
    btnFile.className = 'px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 border transition bg-blue-600/20 text-blue-400 border-blue-500/40 cursor-pointer';
    btnCamera.className = 'px-3 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 border transition bg-slate-800 text-slate-400 border-slate-700 hover:text-white cursor-pointer';
    containerFile.classList.remove('hidden');
    containerCamera.classList.add('hidden');
    stopEmployeeCamera();
  }
  lucide.createIcons();
};

/**
 * Previsualizar foto cargada desde Archivo / Galería
 */
window.previewEmployeeFilePhoto = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  capturedPhotoBlob = null; // Priorizar archivo
  const reader = new FileReader();
  reader.onload = function(e) {
    const previewImg = document.getElementById('emp-photo-preview-img');
    const statusEl = document.getElementById('emp-photo-status');
    if (previewImg) previewImg.src = e.target.result;
    if (statusEl) statusEl.textContent = `Archivo seleccionado: ${file.name}`;
  };
  reader.readAsDataURL(file);
};

/**
 * Iniciar Cámara en Vivo del Dispositivo
 */
window.startEmployeeCamera = async function() {
  const video = document.getElementById('emp-camera-video');
  const placeholder = document.getElementById('emp-camera-placeholder');
  const btnStart = document.getElementById('btn-start-emp-camera');
  const btnSwitch = document.getElementById('btn-switch-emp-camera');
  const btnCapture = document.getElementById('btn-capture-emp-camera');

  stopEmployeeCamera();

  try {
    const constraints = {
      video: {
        facingMode: currentCameraFacing,
        width: { ideal: 640 },
        height: { ideal: 640 }
      },
      audio: false
    };

    employeeCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = employeeCameraStream;
    video.classList.remove('hidden');
    placeholder.classList.add('hidden');

    btnStart.classList.add('hidden');
    btnSwitch.classList.remove('hidden');
    btnCapture.classList.remove('hidden');
  } catch (err) {
    showToast('No se pudo acceder a la cámara: ' + err.message, 'error');
  }
};

/**
 * Alternar entre Cámara Frontal y Trasera
 */
window.switchEmployeeCameraFacing = async function() {
  currentCameraFacing = currentCameraFacing === 'user' ? 'environment' : 'user';
  await startEmployeeCamera();
};

/**
 * Capturar Foto desde el Video Stream
 */
window.captureEmployeePhoto = function() {
  const video = document.getElementById('emp-camera-video');
  if (!video || !employeeCameraStream) return;

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 480;
  canvas.height = video.videoHeight || 480;

  const ctx = canvas.getContext('2d');
  // Si es frontal, voltear horizontalmente para efecto espejo natural
  if (currentCameraFacing === 'user') {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob((blob) => {
    capturedPhotoBlob = blob;
    const previewImg = document.getElementById('emp-photo-preview-img');
    const statusEl = document.getElementById('emp-photo-status');

    if (previewImg) previewImg.src = URL.createObjectURL(blob);
    if (statusEl) statusEl.textContent = '📸 Foto capturada con cámara en vivo';

    showToast('¡Foto capturada con éxito!', 'success');
    stopEmployeeCamera();
  }, 'image/jpeg', 0.9);
};

/**
 * Detener y liberar Cámara del Dispositivo
 */
window.stopEmployeeCamera = function() {
  if (employeeCameraStream) {
    employeeCameraStream.getTracks().forEach(track => track.stop());
    employeeCameraStream = null;
  }
  const video = document.getElementById('emp-camera-video');
  const placeholder = document.getElementById('emp-camera-placeholder');
  const btnStart = document.getElementById('btn-start-emp-camera');
  const btnSwitch = document.getElementById('btn-switch-emp-camera');
  const btnCapture = document.getElementById('btn-capture-emp-camera');

  if (video) video.classList.add('hidden');
  if (placeholder) placeholder.classList.remove('hidden');
  if (btnStart) btnStart.classList.remove('hidden');
  if (btnSwitch) btnSwitch.classList.add('hidden');
  if (btnCapture) btnCapture.classList.add('hidden');
};

/**
 * Modal de Creación / Edición
 */
window.openEmployeeModal = function(empId = null) {
  const form = document.getElementById('form-employee');
  const title = document.getElementById('modal-emp-title');
  const previewImg = document.getElementById('emp-photo-preview-img');
  const statusEl = document.getElementById('emp-photo-status');
  form.reset();
  capturedPhotoBlob = null;
  setEmployeePhotoMode('file');
  stopEmployeeCamera();

  if (empId) {
    const emp = employeesData.find(e => e.id === empId);
    if (!emp) return;

    title.innerHTML = `<i data-lucide="pencil" class="w-5 h-5 text-cyan-400"></i> Editar Colaborador`;
    document.getElementById('emp-form-id').value = emp.id;
    document.getElementById('emp-first-name').value = emp.first_name;
    document.getElementById('emp-last-name').value = emp.last_name;
    document.getElementById('emp-doc-type').value = emp.document_type || (emp.document_number.length === 9 ? 'CEX' : 'DNI');
    document.getElementById('emp-doc-number').value = emp.document_number;
    document.getElementById('emp-blood-type').value = emp.blood_type || 'O+';
    document.getElementById('emp-branch').value = emp.branch_id || 1;
    document.getElementById('emp-department').value = emp.department_id || 1;
    document.getElementById('emp-position').value = emp.position_id || 1;
    const shiftInput = document.getElementById('shiftType') || document.getElementById('emp-shift');
    if (shiftInput) {
      const isNight = String(emp.shift_name || emp.shift_type || emp.shiftType || '').toLowerCase().includes('noct') || String(emp.shift_id) === '2';
      shiftInput.value = isNight ? 'nocturno' : 'diurno';
    }
    document.getElementById('emp-work-mode').value = emp.work_mode || 'PRESENTIAL';
    document.getElementById('emp-emergency-name').value = emp.emergency_contact_name || '';
    document.getElementById('emp-emergency-phone').value = emp.emergency_contact_phone || '';

    if (previewImg) previewImg.src = emp.photo_url || DEFAULT_AVATAR;
    if (statusEl) statusEl.textContent = 'Foto actual del colaborador';
  } else {
    title.innerHTML = `<i data-lucide="user-plus" class="w-5 h-5 text-blue-400"></i> Registrar Nuevo Colaborador`;
    document.getElementById('emp-form-id').value = '';
    document.getElementById('emp-doc-type').value = 'DNI';
    document.getElementById('emp-branch').value = '1'; // PECEPE S.A.C.
    document.getElementById('emp-blood-type').value = 'O+';
    const shiftInput = document.getElementById('shiftType') || document.getElementById('emp-shift');
    if (shiftInput) shiftInput.value = 'diurno';

    if (previewImg) previewImg.src = DEFAULT_AVATAR;
    if (statusEl) statusEl.textContent = 'Foto predeterminada';
  }

  document.getElementById('modal-employee')?.classList.remove('hidden');
  lucide.createIcons();
};

// Cerrar cámara si se cancela el modal
document.getElementById('btn-cancel-emp-modal')?.addEventListener('click', () => {
  stopEmployeeCamera();
  document.getElementById('modal-employee')?.classList.add('hidden');
});

async function handleEmployeeFormSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const empId = document.getElementById('emp-form-id').value;

  const formData = new FormData();
  formData.append('first_name', document.getElementById('emp-first-name').value.trim());
  formData.append('last_name', document.getElementById('emp-last-name').value.trim());
  formData.append('document_type', document.getElementById('emp-doc-type').value);
  formData.append('document_number', document.getElementById('emp-doc-number').value.trim());
  formData.append('blood_type', document.getElementById('emp-blood-type').value);
  formData.append('branch_id', document.getElementById('emp-branch').value);
  formData.append('department_id', document.getElementById('emp-department').value);
  formData.append('position_id', document.getElementById('emp-position').value);
  const selectedShiftVal = (document.getElementById('shiftType') || document.getElementById('emp-shift')).value;
  const isNight = String(selectedShiftVal) === '2' || String(selectedShiftVal).toLowerCase().includes('noct');
  formData.append('shift_id', isNight ? '2' : '1');
  formData.append('shiftType', isNight ? 'nocturno' : 'diurno');
  formData.append('shift_type', isNight ? 'nocturno' : 'diurno');
  formData.append('turno', isNight ? 'nocturno' : 'diurno');
  formData.append('work_mode', document.getElementById('emp-work-mode').value);
  formData.append('emergency_contact_name', document.getElementById('emp-emergency-name').value.trim());
  formData.append('emergency_contact_phone', document.getElementById('emp-emergency-phone').value.trim());

  // Adjuntar foto: ya sea capturada por cámara o seleccionada de archivo
  if (capturedPhotoBlob) {
    formData.append('photo', capturedPhotoBlob, 'camera-photo.jpg');
  } else {
    const photoFile = document.getElementById('emp-photo')?.files[0];
    if (photoFile) {
      formData.append('photo', photoFile);
    }
  }

  try {
    showToast('Guardando datos del colaborador...', 'info');
    let res;
    if (empId) {
      res = await api.employees.update(empId, formData);
    } else {
      res = await api.employees.create(formData);
    }

    if (res && res.success) {
      showToast(empId ? 'Colaborador actualizado exitosamente.' : '¡Colaborador registrado y fotocheck emitido!', 'success');
      stopEmployeeCamera();
      document.getElementById('modal-employee')?.classList.add('hidden');
      await loadEmployeesList();
    } else {
      showToast(res.message || 'Error al guardar colaborador.', 'error');
    }
  } catch (error) {
    showToast(error.message || 'Error al guardar colaborador.', 'error');
  }
}

