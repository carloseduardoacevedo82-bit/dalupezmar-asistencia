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
      populateSelect('emp-shift', catalogs.shifts, 'id', (s) => `${s.name} (${s.entry_time.slice(0,5)} - ${s.exit_time.slice(0,5)})`);
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
    const area = (emp.position_name && emp.position_name.toUpperCase().includes('TROQUELADO')) 
      ? 'Troquelado de Anillas' 
      : (emp.department_name || 'Producción');

    return `
      <tr class="hover:bg-slate-900/50 transition">
        <td class="px-6 py-4 flex items-center gap-3">
          <img src="${emp.photo_url || DEFAULT_AVATAR}" width="40" height="40" loading="lazy" class="w-10 h-10 min-w-[40px] rounded-2xl object-cover border border-slate-700 shadow-sm" onerror="this.onerror=null; this.src=DEFAULT_AVATAR;">
          <div>
            <p class="font-bold text-white uppercase text-xs">${emp.first_name} ${emp.last_name}</p>
            <p class="text-[10px] text-slate-400 font-mono">${emp.employee_code} • ${emp.email || 'DALUPEZMAR'}</p>
          </div>
        </td>
        <td class="px-6 py-4 font-mono font-bold text-slate-200">
          <span class="text-[10px] text-cyan-400 font-bold block">${docType}</span>
          ${emp.document_number}
        </td>
        <td class="px-6 py-4">
          <p class="font-semibold text-slate-200 text-xs">${area}</p>
          <p class="text-[10px] ${emp.position_name && emp.position_name.includes('TROQUELADO') ? 'text-emerald-400 font-bold' : 'text-slate-400'}">${emp.position_name || 'OPERARIO DE PRODUCCIÓN'}</p>
        </td>
        <td class="px-6 py-4 font-bold text-xs text-cyan-300">
          PECEPE S.A.C.
        </td>
        <td class="px-6 py-4">
          <span class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-300">
            ${emp.shift_name ? emp.shift_name.split('(')[0] : 'Estándar 07:00-16:00'}
          </span>
        </td>
        <td class="px-6 py-4">
          <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold ${!isInactive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}">
            ${!isInactive ? 'ACTIVO' : 'CESADO / BAJA'}
          </span>
        </td>
        <td class="px-6 py-4 text-center">
          <div class="flex items-center justify-center gap-2">
            
            <!-- Ver Fotocheck Oficial vinculado -->
            <a href="/badge-designer.html?id=${emp.id}" title="Ver y Diseñar Fotocheck" class="p-2 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 transition cursor-pointer">
              <i data-lucide="badge-check" class="w-4 h-4"></i>
            </a>

            <!-- Editar Ficha y Foto -->
            <button onclick="openEmployeeModal(${emp.id})" title="Editar Datos y Foto" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer">
              <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>

            ${!isInactive ? `
              <!-- Botón Dar de Baja (Mover a Carpeta de Bajas) -->
              <button onclick="openTerminateModal(${emp.id})" title="Dar de Baja a Personal Cesado" class="p-2 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 transition cursor-pointer">
                <i data-lucide="user-minus" class="w-4 h-4"></i>
              </button>
            ` : `
              <!-- Botón Reactivar (Mover a Carpeta de Activos) -->
              <button onclick="reactivateEmployee(${emp.id})" title="Reincorporar a Personal Activo" class="px-3 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 font-bold text-[10px] flex items-center gap-1.5 transition cursor-pointer">
                <i data-lucide="user-check" class="w-3.5 h-3.5"></i> Reactivar
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

  // Ordenar en orden alfabético A-Z por Nombres y Apellidos
  filtered.sort((a, b) => {
    const nameA = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
    const nameB = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
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
  document.getElementById('terminate-emp-name').textContent = `${emp.first_name} ${emp.last_name} (${emp.document_type || 'DNI'}: ${emp.document_number})`;
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

/**
 * Modal de Creación / Edición
 */
window.openEmployeeModal = function(empId = null) {
  const form = document.getElementById('form-employee');
  const title = document.getElementById('modal-emp-title');
  form.reset();

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
    document.getElementById('emp-shift').value = emp.shift_id || 1;
    document.getElementById('emp-work-mode').value = emp.work_mode || 'PRESENTIAL';
    document.getElementById('emp-emergency-name').value = emp.emergency_contact_name || '';
    document.getElementById('emp-emergency-phone').value = emp.emergency_contact_phone || '';
  } else {
    title.innerHTML = `<i data-lucide="user-plus" class="w-5 h-5 text-blue-400"></i> Registrar Nuevo Colaborador`;
    document.getElementById('emp-form-id').value = '';
    document.getElementById('emp-doc-type').value = 'DNI';
    document.getElementById('emp-branch').value = '1'; // PECEPE S.A.C.
    document.getElementById('emp-blood-type').value = 'O+';
  }

  document.getElementById('modal-employee')?.classList.remove('hidden');
  lucide.createIcons();
};

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
  formData.append('shift_id', document.getElementById('emp-shift').value);
  formData.append('work_mode', document.getElementById('emp-work-mode').value);
  formData.append('emergency_contact_name', document.getElementById('emp-emergency-name').value.trim());
  formData.append('emergency_contact_phone', document.getElementById('emp-emergency-phone').value.trim());

  const photoFile = document.getElementById('emp-photo').files[0];
  if (photoFile) {
    formData.append('photo', photoFile);
  }

  try {
    let res;
    if (empId) {
      res = await api.employees.update(empId, formData);
    } else {
      res = await api.employees.create(formData);
    }

    if (res && res.success) {
      showToast(empId ? 'Colaborador actualizado exitosamente.' : '¡Colaborador registrado y fotocheck emitido!', 'success');
      document.getElementById('modal-employee')?.classList.add('hidden');
      await loadEmployeesList();
    }
  } catch (error) {
    showToast(error.message || 'Error al guardar colaborador.', 'error');
  }
}

