/**
 * Lógica del Módulo de Reportes y Exportador a Excel para Planillas
 */
let reportData = [];

document.addEventListener('DOMContentLoaded', async () => {
  initReportDates();
  await loadDepartmentsFilter();
  await executeReportQuery();
  initAttendanceModals();

  document.getElementById('btn-query-report')?.addEventListener('click', executeReportQuery);
  document.getElementById('btn-export-excel')?.addEventListener('click', exportToExcel);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportToCsv);

  // Botones de reporte diario por áreas
  document.getElementById('btn-daily-export-excel')?.addEventListener('click', handleDailyExportExcel);
  document.getElementById('btn-daily-export-pdf')?.addEventListener('click', handleDailyExportPdf);
});

function formatLocalYMD(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initReportDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  const startInput = document.getElementById('rep-start-date');
  const endInput = document.getElementById('rep-end-date');
  const dailyDateInput = document.getElementById('daily-rep-date');

  if (startInput) startInput.value = formatLocalYMD(firstDay);
  if (endInput) endInput.value = formatLocalYMD(today);
  if (dailyDateInput) dailyDateInput.value = formatLocalYMD(today);
}

async function loadDepartmentsFilter() {
  try {
    const res = await api.employees.getCatalogs();
    if (res && res.data && res.data.departments) {
      const select = document.getElementById('rep-filter-dept');
      if (select) {
        select.innerHTML = '<option value="">Todos los Departamentos</option>' +
          res.data.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
      }
    }
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Consultar reporte de tareo según filtros
 */
async function executeReportQuery() {
  const startDate = document.getElementById('rep-start-date')?.value;
  const endDate = document.getElementById('rep-end-date')?.value;
  const deptId = document.getElementById('rep-filter-dept')?.value;
  const status = document.getElementById('rep-filter-status')?.value;

  const params = {};
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  if (deptId) params.department_id = deptId;
  if (status) params.status = status;

  try {
    const res = await api.attendance.getReport(params);
    if (res && res.data) {
      reportData = res.data;
      renderReportTable(reportData);
      calculateTotals(reportData);
    }
  } catch (error) {
    showToast('Error al consultar tareo: ' + error.message, 'error');
  }
}

function renderReportTable(data) {
  const tbody = document.getElementById('report-table-body');
  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="px-6 py-8 text-center text-slate-500 font-sans">No se encontraron registros de tareo para los filtros seleccionados.</td></tr>`;
    return;
  }

  const statusTags = {
    PRESENT: '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">PUNTUAL</span>',
    LATE: '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20">TARDANZA</span>',
    JUSTIFIED: '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/10 text-purple-400 border border-purple-500/20">JUSTIFICADO</span>',
    ABSENT: '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/10 text-rose-400 border border-rose-500/20">FALTA</span>'
  };

  tbody.innerHTML = data.map(row => {
    const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const hoursWorked = (Number(row.total_minutes_worked || 0) / 60).toFixed(1);
    const hoursOvertime = (Number(row.total_minutes_overtime || 0) / 60).toFixed(1);

    return `
      <tr class="hover:bg-slate-900/40 transition text-xs">
        <td class="px-4 py-3 font-bold text-slate-200">${row.attendance_date}</td>
        <td class="px-4 py-3 font-sans">
          <p class="font-extrabold text-white text-xs uppercase">${row.first_name} ${row.last_name}</p>
          <p class="text-[10px] text-slate-400 font-mono">${row.employee_code} • DNI ${row.document_number}</p>
        </td>
        <td class="px-4 py-3 font-sans">
          <p class="font-bold text-slate-300 text-xs">${row.department_name || 'General'}</p>
          <p class="text-[10px] text-cyan-400 font-semibold">${row.position_name || '-'}</p>
        </td>
        <td class="px-4 py-3 text-center text-cyan-300 font-black">${formatTime(row.first_entry_time)}</td>
        <td class="px-4 py-3 text-center text-slate-400">${formatTime(row.lunch_start_time)}</td>
        <td class="px-4 py-3 text-center text-slate-400">${formatTime(row.lunch_end_time)}</td>
        <td class="px-4 py-3 text-center text-cyan-300 font-black">${formatTime(row.last_exit_time)}</td>
        <td class="px-4 py-3 text-center text-emerald-400 font-black">${hoursWorked} h</td>
        <td class="px-4 py-3 text-center ${row.total_minutes_late > 0 ? 'text-amber-400 font-black' : 'text-slate-500'}">
          ${row.total_minutes_late > 0 ? row.total_minutes_late + ' m' : '0'}
        </td>
        <td class="px-4 py-3 text-center ${row.total_minutes_overtime > 0 ? 'text-cyan-400 font-black' : 'text-slate-500'}">
          ${row.total_minutes_overtime > 0 ? hoursOvertime + ' h' : '0'}
        </td>
        <td class="px-4 py-3 text-center font-sans">
          ${statusTags[row.status] || row.status}
        </td>
        <td class="px-4 py-3 text-center no-print">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="openEditAttendanceModal(${row.id})" title="Modificar Horas / Asistencia" class="p-1.5 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 transition cursor-pointer">
              <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="handleDeleteAttendance(${row.id})" title="Eliminar Marcación" class="p-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 transition cursor-pointer">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function calculateTotals(data) {
  let lateMins = 0;
  let overtimeMins = 0;

  data.forEach(r => {
    lateMins += Number(r.total_minutes_late || 0);
    overtimeMins += Number(r.total_minutes_overtime || 0);
  });

  document.getElementById('tot-records').textContent = data.length;
  document.getElementById('tot-late-mins').textContent = `${lateMins} min`;
  document.getElementById('tot-overtime-hrs').textContent = `${(overtimeMins / 60).toFixed(1)} h`;
}

/**
 * Exportar a Excel (.xlsx) con Formato de Tabla y Fuente Tamaño 11
 */
async function exportToExcel() {
  if (reportData.length === 0) {
    showToast('No hay datos para exportar.', 'warning');
    return;
  }

  const sortedData = [...reportData].sort((a, b) => {
    const rankA = getAreaHierarchyRank(a.position_name, a.department_name);
    const rankB = getAreaHierarchyRank(b.position_name, b.department_name);

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    const nameA = `${a.last_name || ''}, ${a.first_name || ''}`.trim().toLowerCase();
    const nameB = `${b.last_name || ''}, ${b.first_name || ''}`.trim().toLowerCase();
    return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
  });

  const fileName = `Tareo_Asistencia_${new Date().toISOString().split('T')[0]}.xlsx`;

  if (window.ExcelJS) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'DALUPEZMAR SERVICIOS INDUSTRIALES S.A.C.';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Tareo_General', {
      views: [{ showGridLines: true }]
    });

    const columns = [
      { name: 'N°', width: 6 },
      { name: 'Fecha', width: 14 },
      { name: 'Código Empleado', width: 16 },
      { name: 'Documento', width: 16 },
      { name: 'Apellidos y Nombres', width: 38 },
      { name: 'Departamento / Área', width: 26 },
      { name: 'Cargo / Puesto', width: 28 },
      { name: 'Turno', width: 18 },
      { name: 'Hora Entrada', width: 14 },
      { name: 'Inicio Refrigerio', width: 16 },
      { name: 'Fin Refrigerio', width: 16 },
      { name: 'Hora Salida', width: 14 },
      { name: 'Horas Trabajadas', width: 18 },
      { name: 'Minutos Tardanza', width: 16 },
      { name: 'Horas Extras', width: 16 },
      { name: 'Estado Asistencia', width: 18 }
    ];

    const rows = sortedData.map((r, index) => [
      index + 1,
      r.attendance_date,
      r.employee_code,
      r.document_number,
      `${r.last_name}, ${r.first_name}`.toUpperCase(),
      r.department_name || '',
      r.position_name || '',
      r.shift_name || '',
      r.first_entry_time ? new Date(r.first_entry_time).toLocaleTimeString('es-PE') : '',
      r.lunch_start_time ? new Date(r.lunch_start_time).toLocaleTimeString('es-PE') : '',
      r.lunch_end_time ? new Date(r.lunch_end_time).toLocaleTimeString('es-PE') : '',
      r.last_exit_time ? new Date(r.last_exit_time).toLocaleTimeString('es-PE') : '',
      Number((r.total_minutes_worked / 60).toFixed(2)),
      r.total_minutes_late || 0,
      Number((r.total_minutes_overtime / 60).toFixed(2)),
      r.status
    ]);

    worksheet.addTable({
      name: 'TablaTareoGeneral',
      ref: 'A1',
      headerRow: true,
      totalsRow: false,
      style: {
        theme: 'TableStyleMedium9',
        showRowStripes: true,
      },
      columns: columns.map(c => ({ name: c.name, filterButton: true })),
      rows: rows
    });

    columns.forEach((c, i) => {
      worksheet.getColumn(i + 1).width = c.width;
    });

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.height = rowNumber === 1 ? 24 : 20;

      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        cell.font = {
          name: 'Calibri',
          size: 11,
          bold: rowNumber === 1,
          color: rowNumber === 1 ? { argb: 'FFFFFFFF' } : { argb: 'FF0F172A' }
        };

        const isLeftAlign = colNumber === 5 || colNumber === 6 || colNumber === 7;
        cell.alignment = {
          vertical: 'middle',
          horizontal: isLeftAlign ? 'left' : 'center',
          wrapText: false
        };

        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(downloadUrl);

    showToast('¡Archivo Excel (.xlsx) en formato tabla exportado exitosamente!', 'success');
    return;
  }

  // Fallback
  const exportRows = sortedData.map((r, index) => ({
    'N°': index + 1,
    'Fecha': r.attendance_date,
    'Código Empleado': r.employee_code,
    'Documento': r.document_number,
    'Apellidos y Nombres': `${r.last_name}, ${r.first_name}`.toUpperCase(),
    'Departamento / Área': r.department_name || '',
    'Cargo / Puesto': r.position_name || '',
    'Turno': r.shift_name || '',
    'Hora Entrada': r.first_entry_time ? new Date(r.first_entry_time).toLocaleTimeString('es-PE') : '',
    'Inicio Refrigerio': r.lunch_start_time ? new Date(r.lunch_start_time).toLocaleTimeString('es-PE') : '',
    'Fin Refrigerio': r.lunch_end_time ? new Date(r.lunch_end_time).toLocaleTimeString('es-PE') : '',
    'Hora Salida': r.last_exit_time ? new Date(r.last_exit_time).toLocaleTimeString('es-PE') : '',
    'Horas Trabajadas': Number((r.total_minutes_worked / 60).toFixed(2)),
    'Minutos Tardanza': r.total_minutes_late || 0,
    'Horas Extras': Number((r.total_minutes_overtime / 60).toFixed(2)),
    'Estado Asistencia': r.status
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tareo_Asistencia');
  XLSX.writeFile(workbook, fileName);
  showToast('¡Archivo Excel (.xlsx) exportado exitosamente!', 'success');
}

/**
 * Exportar a CSV
 */
function exportToCsv() {
  if (reportData.length === 0) {
    showToast('No hay datos para exportar.', 'warning');
    return;
  }

  const headers = ['Fecha', 'Codigo', 'Documento', 'Nombres', 'Apellidos', 'Area', 'Cargo', 'Entrada', 'Salida', 'HorasTrabajadas', 'TardanzaMin', 'HorasExtras', 'Estado'];
  
  const csvRows = [headers.join(',')];

  reportData.forEach(r => {
    const row = [
      r.attendance_date,
      r.employee_code,
      r.document_number,
      `"${r.first_name}"`,
      `"${r.last_name}"`,
      `"${r.department_name || ''}"`,
      `"${r.position_name || ''}"`,
      r.first_entry_time ? new Date(r.first_entry_time).toLocaleTimeString('es-PE') : '',
      r.last_exit_time ? new Date(r.last_exit_time).toLocaleTimeString('es-PE') : '',
      (r.total_minutes_worked / 60).toFixed(2),
      r.total_minutes_late,
      (r.total_minutes_overtime / 60).toFixed(2),
      r.status
    ];
    csvRows.push(row.join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `Tareo_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast('Archivo CSV descargado.', 'success');
}

/**
 * =========================================================================
 * DESCARGA DIARIA DE ASISTENCIA POR ÁREAS (EXCEL & PDF)
 * =========================================================================
 */

/**
 * Jerarquía de cargos por áreas:
 * 1. Gerencia (Gerente General, Administración, etc.)
 * 2. Supervisores (Supervisor General, Jefes, etc.)
 * 3. Troquelado de Anillas
/**
 * Determina si un colaborador pertenece a Gerencia General o Supervisores Generales
 */
function isManagementOrSupervisor(positionName, departmentName) {
  const p = (positionName || '').toUpperCase();
  const d = (departmentName || '').toUpperCase();

  // Gerencia / Dirección / Administración
  const isGerencia = p.includes('GEREN') || d.includes('GEREN') || p.includes('DIRECT') || p.includes('ADMINISTRA');

  // Supervisores Generales / Supervisores / Jefaturas
  const isSupervisor = p.includes('SUPERVIS') || d.includes('SUPERVIS') || p.includes('JEFE') || p.includes('COORDINAD');

  return isGerencia || isSupervisor;
}

/**
 * Jerarquía de cargos por áreas para partes de asistencia diaria:
 * 1. Troquelado de Anillas
 * 2. Área Exterior
 * 3. Operarios de Producción
 * 4. Otros cargos operativos
 */
function getAreaHierarchyRank(posName, deptName) {
  const p = (posName || '').toUpperCase();
  const d = (deptName || '').toUpperCase();

  if (p.includes('TROQUELAD') || d.includes('TROQUELAD') || p.includes('ANILLA')) {
    return 1;
  }
  if (p.includes('EXTERIOR') || d.includes('EXTERIOR')) {
    return 2;
  }
  if (p.includes('OPERARIO') || p.includes('PRODUC') || d.includes('PRODUC')) {
    return 3;
  }
  return 4;
}

/**
 * Obtener lista consolidada del personal para el reporte diario
 * (Excluye automáticamente a Gerencia General y Supervisores Generales)
 */
async function fetchDailyAttendanceData(dateStr, selectedArea) {
  // 1. Obtener todos los colaboradores activos y EXCLUIR Gerencia General y Supervisores
  const empRes = await api.employees.getAll();
  const allEmployees = (empRes && empRes.data) 
    ? empRes.data.filter(e => (e.status || 'ACTIVE') === 'ACTIVE' && !isManagementOrSupervisor(e.position_name, e.department_name)) 
    : [];

  // 2. Obtener marcas de asistencia del día
  const attRes = await api.attendance.getReport({ start_date: dateStr, end_date: dateStr });
  const dayAttendances = (attRes && attRes.data) ? attRes.data : [];

  // Indexar asistencias por employee_id
  const attMap = new Map();
  dayAttendances.forEach(att => {
    attMap.set(att.employee_id, att);
  });

  // 3. Cruzar colaboradores con sus marcas
  let dailyList = allEmployees.map(emp => {
    const att = attMap.get(emp.id);
    const docType = emp.document_type || (emp.document_number && emp.document_number.length === 9 ? 'CEX' : 'DNI');
    const posUpper = (emp.position_name || '').toUpperCase();
    const area = posUpper.includes('TROQUELADO') 
      ? 'Troquelado de Anillas' 
      : (posUpper.includes('EXTERIOR') ? 'Área Exterior' : (emp.department_name || 'Producción'));

    const firstEntry = att && att.first_entry_time ? new Date(att.first_entry_time).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
    const lastExit = att && att.last_exit_time ? new Date(att.last_exit_time).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
    const hoursWorked = att ? (att.total_minutes_worked / 60).toFixed(2) : '0.00';
    const lateMins = att ? (att.total_minutes_late || 0) : 0;
    const status = att ? att.status : 'ABSENT';

    return {
      id: emp.id,
      code: emp.employee_code || `DAL-${emp.id}`,
      docType,
      docNumber: emp.document_number,
      fullName: `${emp.last_name}, ${emp.first_name}`.toUpperCase(),
      area,
      position: emp.position_name || 'OPERARIO DE PRODUCCIÓN',
      branch: 'PECEPE S.A.C.',
      firstEntry,
      lastExit,
      hoursWorked,
      lateMins,
      status
    };
  });

  // Filtrar por área si se seleccionó una
  if (selectedArea && selectedArea.trim() !== '') {
    dailyList = dailyList.filter(item => 
      item.area.toLowerCase().includes(selectedArea.toLowerCase()) || 
      item.position.toLowerCase().includes(selectedArea.toLowerCase())
    );
  }

  // 4. Ordenar jerárquicamente por áreas (Troquelado de Anillas -> Operarios) y luego en orden alfabético A-Z
  dailyList.sort((a, b) => {
    const rankA = getAreaHierarchyRank(a.position, a.area);
    const rankB = getAreaHierarchyRank(b.position, b.area);

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    return a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' });
  });

  return dailyList;
}

/**
 * Exportar Asistencia Diaria a Excel (.xlsx) con Formato de Tabla y Fuente Tamaño 11
 */
async function handleDailyExportExcel() {
  const dateInput = document.getElementById('daily-rep-date')?.value || new Date().toISOString().split('T')[0];
  const areaSelect = document.getElementById('daily-rep-area')?.value || '';

  showToast('Generando archivo Excel con formato de tabla...', 'info');

  try {
    const list = await fetchDailyAttendanceData(dateInput, areaSelect);

    if (list.length === 0) {
      showToast('No se encontraron trabajadores para el área seleccionada.', 'warning');
      return;
    }

    const areaTag = areaSelect ? `_${areaSelect.replace(/\s+/g, '_')}` : '_Todas_Areas';
    const fileName = `Asistencia_Diaria_PECEPE_${dateInput}${areaTag}.xlsx`;

    // Si ExcelJS está disponible, generar tabla nativa con fuentes Calibri 11 y tema institucional
    if (window.ExcelJS) {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'DALUPEZMAR SERVICIOS INDUSTRIALES S.A.C.';
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet('Asistencia_Diaria', {
        views: [{ showGridLines: true }]
      });

      const columns = [
        { name: 'N°', width: 6 },
        { name: 'Fecha', width: 14 },
        { name: 'Planta', width: 16 },
        { name: 'Área', width: 24 },
        { name: 'Tipo Doc', width: 11 },
        { name: 'N° Documento', width: 16 },
        { name: 'Código ID', width: 14 },
        { name: 'Apellidos y Nombres', width: 38 },
        { name: 'Cargo / Puesto', width: 30 },
        { name: 'Hora Ingreso', width: 15 },
        { name: 'Hora Salida', width: 15 },
        { name: 'Horas Trabajadas', width: 18 },
        { name: 'Tardanza (Min)', width: 16 },
        { name: 'Estado Asistencia', width: 18 }
      ];

      const rows = list.map((item, index) => [
        index + 1,
        dateInput,
        item.branch,
        item.area,
        item.docType,
        item.docNumber,
        item.code,
        item.fullName,
        item.position,
        item.firstEntry,
        item.lastExit,
        Number(item.hoursWorked),
        item.lateMins,
        item.status === 'PRESENT' ? 'PUNTUAL' : (item.status === 'LATE' ? 'TARDANZA' : (item.status === 'JUSTIFIED' ? 'JUSTIFICADO' : 'FALTA'))
      ]);

      worksheet.addTable({
        name: 'TablaAsistenciaDiaria',
        ref: 'A1',
        headerRow: true,
        totalsRow: false,
        style: {
          theme: 'TableStyleMedium9', // Tema Azul Institucional de Tabla Excel
          showRowStripes: true,
        },
        columns: columns.map(c => ({ name: c.name, filterButton: true })),
        rows: rows
      });

      columns.forEach((c, i) => {
        worksheet.getColumn(i + 1).width = c.width;
      });

      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        row.height = rowNumber === 1 ? 24 : 20;

        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          // Tamaño de letra 11 obligatorio
          cell.font = {
            name: 'Calibri',
            size: 11,
            bold: rowNumber === 1,
            color: rowNumber === 1 ? { argb: 'FFFFFFFF' } : { argb: 'FF0F172A' }
          };

          const isLeftAlign = colNumber === 4 || colNumber === 8 || colNumber === 9; // Área, Nombres, Cargo
          cell.alignment = {
            vertical: 'middle',
            horizontal: isLeftAlign ? 'left' : 'center',
            wrapText: false
          };

          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };

          if (rowNumber > 1 && colNumber === 14) {
            const val = String(cell.value || '');
            if (val === 'PUNTUAL') {
              cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF059669' } };
            } else if (val === 'TARDANZA') {
              cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFD97706' } };
            } else if (val === 'FALTA') {
              cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFDC2626' } };
            }
          }
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = fileName;
      link.click();
      window.URL.revokeObjectURL(downloadUrl);

      showToast('¡Excel en formato tabla (Tamaño 11) descargado exitosamente!', 'success');
      return;
    }

    // Fallback con SheetJS
    const exportRows = list.map((item, index) => ({
      'N°': index + 1,
      'Fecha': dateInput,
      'Planta': item.branch,
      'Área': item.area,
      'Tipo Doc': item.docType,
      'N° Documento': item.docNumber,
      'Código ID': item.code,
      'Apellidos y Nombres': item.fullName,
      'Cargo / Puesto': item.position,
      'Hora Ingreso': item.firstEntry,
      'Hora Salida': item.lastExit,
      'Horas Trabajadas': Number(item.hoursWorked),
      'Tardanza (Min)': item.lateMins,
      'Estado Asistencia': item.status === 'PRESENT' ? 'PUNTUAL' : (item.status === 'LATE' ? 'TARDANZA' : (item.status === 'JUSTIFIED' ? 'JUSTIFICADO' : 'FALTA'))
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistencia_Diaria');
    XLSX.writeFile(workbook, fileName);

    showToast('¡Excel de asistencia diaria descargado exitosamente!', 'success');
  } catch (error) {
    showToast('Error al exportar Excel: ' + error.message, 'error');
  }
}

/**
 * Descargar / Imprimir Reporte PDF Oficial de Asistencia Diaria
 */
async function handleDailyExportPdf() {
  const dateInput = document.getElementById('daily-rep-date')?.value || new Date().toISOString().split('T')[0];
  const areaSelect = document.getElementById('daily-rep-area')?.value || '';
  const areaTitle = areaSelect ? areaSelect.toUpperCase() : 'TODAS LAS ÁREAS (GENERAL)';

  showToast('Generando vista oficial para exportar a PDF...', 'info');

  try {
    const list = await fetchDailyAttendanceData(dateInput, areaSelect);

    if (list.length === 0) {
      showToast('No se encontraron registros de trabajadores.', 'warning');
      return;
    }

    const totalCount = list.length;
    const presentCount = list.filter(i => i.status === 'PRESENT').length;
    const lateCount = list.filter(i => i.status === 'LATE').length;
    const absentCount = list.filter(i => i.status === 'ABSENT').length;

    const rowsHtml = list.map((item, index) => {
      const statusBadge = item.status === 'PRESENT' 
        ? '<span style="color:#059669; font-weight:800;">PUNTUAL</span>' 
        : (item.status === 'LATE' 
          ? '<span style="color:#d97706; font-weight:800;">TARDANZA (' + item.lateMins + 'm)</span>' 
          : (item.status === 'JUSTIFIED' 
            ? '<span style="color:#7c3aed; font-weight:800;">JUSTIFICADO</span>' 
            : '<span style="color:#dc2626; font-weight:800;">FALTA</span>'));

      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 8.5pt; ${index % 2 === 0 ? 'background:#f8fafc;' : 'background:#ffffff;'}">
          <td style="padding: 5px 6px; text-align: center; font-weight: bold; color: #475569;">${index + 1}</td>
          <td style="padding: 5px 6px; font-family: monospace; font-weight: bold; color: #002855;">${item.code}</td>
          <td style="padding: 5px 6px; font-family: monospace; font-weight: bold;">${item.docType}: ${item.docNumber}</td>
          <td style="padding: 5px 6px; font-weight: 800; color: #0f172a;">${item.fullName}</td>
          <td style="padding: 5px 6px; color: #0369a1; font-weight: 700;">${item.area}</td>
          <td style="padding: 5px 6px; color: #334155;">${item.position}</td>
          <td style="padding: 5px 6px; text-align: center; font-family: monospace; font-weight: 700; color: #0284c7;">${item.firstEntry}</td>
          <td style="padding: 5px 6px; text-align: center; font-family: monospace; font-weight: 700; color: #0284c7;">${item.lastExit}</td>
          <td style="padding: 5px 6px; text-align: center; font-weight: bold;">${item.hoursWorked} h</td>
          <td style="padding: 5px 6px; text-align: center;">${statusBadge}</td>
        </tr>
      `;
    }).join('');

    const pdfWindow = window.open('', '_blank');
    pdfWindow.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>DALUPEZMAR - Parte Diario de Asistencia (${dateInput})</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 8mm 8mm;
          }
          * {
            box-sizing: border-box;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            font-family: 'Segoe UI', Arial, sans-serif;
            margin: 0;
            padding: 0;
            color: #0f172a;
            background: #ffffff;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2.5px solid #002855;
            padding-bottom: 8px;
            margin-bottom: 12px;
          }
          .company-info h1 {
            margin: 0;
            font-size: 14pt;
            font-weight: 900;
            color: #002855;
            letter-spacing: 0.5px;
          }
          .company-info p {
            margin: 2px 0 0 0;
            font-size: 8pt;
            color: #475569;
          }
          .report-badge {
            text-align: right;
          }
          .report-badge h2 {
            margin: 0;
            font-size: 11pt;
            font-weight: 900;
            color: #0284c7;
          }
          .report-badge p {
            margin: 2px 0 0 0;
            font-size: 8.5pt;
            font-weight: bold;
            color: #334155;
          }
          .kpi-container {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-bottom: 12px;
          }
          .kpi-box {
            background: #f1f5f9;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 6px 10px;
            text-align: center;
          }
          .kpi-title {
            font-size: 7.5pt;
            font-weight: 800;
            color: #475569;
            text-transform: uppercase;
          }
          .kpi-val {
            font-size: 13pt;
            font-weight: 900;
            margin-top: 2px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th {
            background: #002855;
            color: #ffffff;
            font-size: 8pt;
            font-weight: 800;
            text-transform: uppercase;
            padding: 6px 6px;
            text-align: left;
          }
          .footer {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
            font-size: 7.5pt;
            color: #64748b;
            border-top: 1px solid #cbd5e1;
            padding-top: 8px;
          }
          .signature-box {
            margin-top: 35px;
            display: flex;
            justify-content: space-around;
            text-align: center;
          }
          .sig-line {
            width: 180px;
            border-top: 1px solid #334155;
            padding-top: 4px;
            font-size: 8pt;
            font-weight: bold;
            color: #334155;
          }
        </style>
      </head>
      <body onload="window.print()">
        <div class="header">
          <div class="company-info">
            <h1>DALUPEZMAR SERVICIOS INDUSTRIALES S.A.C.</h1>
            <p>RUC: 20615714128 • <b>PLANTA PRINCIPAL: PECEPE S.A.C.</b></p>
            <p>P.J. Calle Asoc De Fam Santa Rosa De Villa Lomo De Corvina Mz.F, Lt 2, Villa El Salvador</p>
          </div>
          <div class="report-badge">
            <h2>PARTE DIARIO DE ASISTENCIA</h2>
            <p>FECHA: ${dateInput} | ÁREA: ${areaTitle}</p>
          </div>
        </div>

        <div class="kpi-container">
          <div class="kpi-box">
            <div class="kpi-title">Total Personal</div>
            <div class="kpi-val" style="color: #002855;">${totalCount}</div>
          </div>
          <div class="kpi-box" style="background: #ecfdf5; border-color: #a7f3d0;">
            <div class="kpi-title" style="color: #065f46;">Presentes Puntuales</div>
            <div class="kpi-val" style="color: #059669;">${presentCount}</div>
          </div>
          <div class="kpi-box" style="background: #fffbeb; border-color: #fde68a;">
            <div class="kpi-title" style="color: #92400e;">Tardanzas</div>
            <div class="kpi-val" style="color: #d97706;">${lateCount}</div>
          </div>
          <div class="kpi-box" style="background: #fef2f2; border-color: #fecaca;">
            <div class="kpi-title" style="color: #991b1b;">Inasistencias</div>
            <div class="kpi-val" style="color: #dc2626;">${absentCount}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 25px; text-align: center;">#</th>
              <th style="width: 60px;">Código</th>
              <th style="width: 90px;">Documento</th>
              <th>Apellidos y Nombres</th>
              <th>Área</th>
              <th>Puesto / Cargo</th>
              <th style="width: 60px; text-align: center;">Entrada</th>
              <th style="width: 60px; text-align: center;">Salida</th>
              <th style="width: 50px; text-align: center;">Horas</th>
              <th style="width: 90px; text-align: center;">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="signature-box">
          <div class="sig-line">Supervisor de Turno / Planta</div>
          <div class="sig-line">Responsable de RRHH / Asistencia</div>
        </div>

        <div class="footer">
          <span>Emitido por Sistema Integrado de Control de Asistencia y Fotochecks DALUPEZMAR</span>
          <span>Planta Principal PECEPE S.A.C. • Impreso: ${new Date().toLocaleString('es-PE')}</span>
        </div>
      </body>
      </html>
    `);

    pdfWindow.document.close();
  } catch (error) {
    showToast('Error al generar PDF: ' + error.message, 'error');
  }
}

/**
 * ============================================================================
 * GESTIÓN DIRECTA DE ASISTENCIA: EDICIÓN, ELIMINACIÓN Y REGISTRO MANUAL
 * ============================================================================
 */

function initAttendanceModals() {
  const modalEdit = document.getElementById('modal-edit-attendance');
  const modalManual = document.getElementById('modal-manual-attendance');

  // Botones cerrar y cancelar
  document.getElementById('btn-close-edit-att')?.addEventListener('click', () => modalEdit?.classList.add('hidden'));
  document.getElementById('btn-cancel-edit-att')?.addEventListener('click', () => modalEdit?.classList.add('hidden'));

  document.getElementById('btn-close-manual-att')?.addEventListener('click', () => modalManual?.classList.add('hidden'));
  document.getElementById('btn-cancel-man-att')?.addEventListener('click', () => modalManual?.classList.add('hidden'));

  // Abrir modal de asistencia manual
  document.getElementById('btn-open-manual-att')?.addEventListener('click', async () => {
    modalManual?.classList.remove('hidden');
    const dateInput = document.getElementById('man-att-date');
    if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    await loadManualEmployeesDropdown();
  });

  // Guardar edición de asistencia
  document.getElementById('form-edit-attendance')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('edit-att-id')?.value;
    const entryTimeVal = document.getElementById('edit-att-entry')?.value;
    const exitTimeVal = document.getElementById('edit-att-exit')?.value;
    const lunchStartVal = document.getElementById('edit-att-lunch-start')?.value;
    const lunchEndVal = document.getElementById('edit-att-lunch-end')?.value;
    const statusVal = document.getElementById('edit-att-status')?.value;

    const row = reportData.find(r => r.id == id);
    const dateStr = row ? row.attendance_date : new Date().toISOString().split('T')[0];

    const toIso = (timeStr) => timeStr ? `${dateStr}T${timeStr}:00` : null;

    try {
      showToast('Guardando modificaciones...', 'info');
      await api.attendance.updateRecord(id, {
        first_entry_time: toIso(entryTimeVal),
        last_exit_time: toIso(exitTimeVal),
        lunch_start_time: toIso(lunchStartVal),
        lunch_end_time: toIso(lunchEndVal),
        status: statusVal
      });

      showToast('Marcación actualizada exitosamente.', 'success');
      modalEdit?.classList.add('hidden');
      await executeReportQuery();
    } catch (err) {
      showToast('Error al actualizar: ' + err.message, 'error');
    }
  });

  // Guardar registro manual
  document.getElementById('form-manual-attendance')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const empId = document.getElementById('man-att-emp-id')?.value;
    const dateVal = document.getElementById('man-att-date')?.value;
    const entryTimeVal = document.getElementById('man-att-entry')?.value;
    const exitTimeVal = document.getElementById('man-att-exit')?.value;
    const statusVal = document.getElementById('man-att-status')?.value;

    if (!empId || !dateVal) {
      showToast('Selecciona colaborador y fecha.', 'warning');
      return;
    }

    const toIso = (timeStr) => timeStr ? `${dateVal}T${timeStr}:00` : null;

    try {
      showToast('Registrando asistencia manual...', 'info');
      await api.attendance.createManualRecord({
        employee_id: empId,
        attendance_date: dateVal,
        first_entry_time: toIso(entryTimeVal),
        last_exit_time: toIso(exitTimeVal),
        status: statusVal
      });

      showToast('Asistencia manual registrada con éxito.', 'success');
      modalManual?.classList.add('hidden');
      await executeReportQuery();
    } catch (err) {
      showToast('Error al crear asistencia: ' + err.message, 'error');
    }
  });
}

/**
 * Cargar lista de colaboradores en el dropdown del modal manual
 */
async function loadManualEmployeesDropdown() {
  const select = document.getElementById('man-att-emp-id');
  if (!select) return;

  try {
    const res = await api.employees.getAll();
    if (res && res.data) {
      const activeOnly = res.data.filter(e => e.status === 'ACTIVE');
      select.innerHTML = '<option value="">-- Seleccionar Colaborador --</option>' +
        activeOnly.map(e => `<option value="${e.id}">${e.last_name}, ${e.first_name} (DNI: ${e.document_number}) - ${e.position_name || 'Operario'}</option>`).join('');
    }
  } catch (e) {
    console.warn(e);
  }
}

/**
 * Abrir modal para editar registro de asistencia
 */
window.openEditAttendanceModal = function(id) {
  const row = reportData.find(r => r.id == id);
  if (!row) return;

  const modal = document.getElementById('modal-edit-attendance');
  document.getElementById('edit-att-id').value = row.id;
  document.getElementById('edit-att-emp-name').textContent = `${row.first_name} ${row.last_name} (${row.employee_code} • DNI ${row.document_number})`;

  const getTime = (iso) => iso ? new Date(iso).toTimeString().substring(0, 5) : '';

  document.getElementById('edit-att-entry').value = getTime(row.first_entry_time) || '07:00';
  document.getElementById('edit-att-exit').value = getTime(row.last_exit_time) || '19:00';
  document.getElementById('edit-att-lunch-start').value = getTime(row.lunch_start_time) || '12:00';
  document.getElementById('edit-att-lunch-end').value = getTime(row.lunch_end_time) || '13:00';
  document.getElementById('edit-att-status').value = row.status || 'PRESENT';

  modal?.classList.remove('hidden');
};

/**
 * Eliminar marcación de asistencia
 */
window.handleDeleteAttendance = async function(id) {
  const row = reportData.find(r => r.id == id);
  const name = row ? `${row.first_name} ${row.last_name}` : 'este colaborador';

  if (!confirm(`¿Estás seguro de que deseas eliminar la marcación de ${name} del día ${row ? row.attendance_date : ''}? Esta acción no se puede deshacer.`)) {
    return;
  }

  try {
    showToast('Eliminando marcación...', 'info');
    await api.attendance.deleteRecord(id);
    showToast('Marcación eliminada exitosamente.', 'success');
    await executeReportQuery();
  } catch (err) {
    showToast('Error al eliminar marcación: ' + err.message, 'error');
  }
};

