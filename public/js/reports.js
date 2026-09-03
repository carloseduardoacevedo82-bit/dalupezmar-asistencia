/**
 * Lógica del Módulo de Reportes y Exportador a Excel para Planillas
 */
let reportData = [];

document.addEventListener('DOMContentLoaded', () => {
  initReportDates();

  // Vinculación INMEDIATA de botones de exportación y acciones
  document.getElementById('btn-query-report')?.addEventListener('click', executeReportQuery);
  document.getElementById('btn-export-excel')?.addEventListener('click', exportToExcel);
  document.getElementById('btn-export-csv')?.addEventListener('click', exportToCsv);
  document.getElementById('btn-print-report')?.addEventListener('click', handleDailyExportPdf);

  // Botones de reporte diario por áreas
  document.getElementById('btn-daily-export-excel')?.addEventListener('click', handleDailyExportExcel);
  document.getElementById('btn-daily-export-pdf')?.addEventListener('click', handleDailyExportPdf);

  initAttendanceModals();

  // Cargas iniciales asíncronas independientes
  loadDepartmentsFilter().catch(e => console.error('Error cargando departamentos:', e));
  executeReportQuery().catch(e => console.error('Error consulta inicial:', e));
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
    
    let totalHoras = 0;
    if (row.first_entry_time && row.last_exit_time) {
      const entryMs = new Date(row.first_entry_time).getTime();
      let exitMs = new Date(row.last_exit_time).getTime();
      if (exitMs <= entryMs) exitMs += 24 * 60 * 60 * 1000;
      const grossMin = Math.max(0, Math.floor((exitMs - entryMs) / 60000));
      const netMin = Math.max(0, grossMin - 60);
      totalHoras = Number((netMin / 60).toFixed(2));
    } else if (row.total_minutes_worked && Number(row.total_minutes_worked) > 0) {
      const netMin = Math.max(0, Number(row.total_minutes_worked) - 60);
      totalHoras = Number((netMin / 60).toFixed(2));
      if (totalHoras === 0) totalHoras = 10.50;
    } else if (row.status === 'PRESENT' || row.status === 'COMPLETED' || row.status === 'PUNTUAL' || row.status === 'LATE') {
      totalHoras = 10.50;
    }

    const horasBase = Number(Math.min(8.00, totalHoras).toFixed(2));
    const exceso = Math.max(0, totalHoras - 8.00);
    const he25 = Number(Math.min(2.00, exceso).toFixed(2));
    const he35 = Number(Math.max(0, totalHoras - 10.00).toFixed(2));

    const isNight = String(row.shift_name || row.shift_type || '').toLowerCase().includes('noct') || String(row.shift_name || '').includes('19:30') || String(row.shift_id) === '2';
    const shiftBadge = isNight
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-500/10 text-purple-400 border border-purple-500/20">🌙 Nocturno</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-500/10 text-sky-400 border border-sky-500/20">☀️ Diurno</span>';

    return `
      <tr class="hover:bg-slate-900/40 transition text-xs">
        <td class="px-4 py-3 font-bold text-slate-200">${String(row.attendance_date || '').split('T')[0]}</td>
        <td class="px-4 py-3 font-sans">
          <p class="font-extrabold text-white text-xs uppercase">${row.first_name} ${row.last_name}</p>
          <p class="text-[10px] text-slate-400 font-mono">${row.employee_code} • DNI ${row.document_number}</p>
        </td>
        <td class="px-4 py-3 font-sans">
          <p class="font-bold text-slate-300 text-xs">${row.department_name || 'General'}</p>
          <p class="text-[10px] text-cyan-400 font-semibold">${row.position_name || '-'}</p>
        </td>
        <td class="px-4 py-3 text-center">${shiftBadge}</td>
        <td class="px-4 py-3 text-center text-cyan-300 font-black">${formatTime(row.first_entry_time)}</td>
        <td class="px-4 py-3 text-center text-cyan-300 font-black">${formatTime(row.last_exit_time)}</td>
        <td class="px-4 py-3 text-right text-emerald-400 font-black">${totalHoras.toFixed(2)}</td>
        <td class="px-4 py-3 text-right text-slate-300 font-mono">${horasBase.toFixed(2)}</td>
        <td class="px-4 py-3 text-right text-amber-400 font-bold font-mono">${he25.toFixed(2)}</td>
        <td class="px-4 py-3 text-right text-orange-400 font-bold font-mono">${he35.toFixed(2)}</td>
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
 * Exportar a Excel (.xlsx) con Formato de Tabla y Fuente
 */
async function exportToExcel() {
  await handleDailyExportExcel();
}
window.exportToExcel = exportToExcel;

/**
 * Exportar a CSV con las 16 columnas canónicas de Asistencia y Totales
 */
async function exportToCsv() {
  const dateInput = document.getElementById('daily-rep-date')?.value || document.getElementById('rep-start-date')?.value || formatLocalYMD();
  const areaSelect = document.getElementById('daily-rep-area')?.value || '';

  showToast('Generando archivo CSV oficial...', 'info');

  try {
    const list = await fetchDailyAttendanceData(dateInput, areaSelect);
    if (list.length === 0) {
      showToast('No hay datos para exportar.', 'warning');
      return;
    }

    const areaTag = areaSelect ? `_${areaSelect.replace(/\s+/g, '_')}` : '_Todas_Areas';
    const fileName = `Asistencia_Diaria_PECEPE_${dateInput}${areaTag}.csv`;

    const headers = [
      'Planta',
      'Área',
      'Tipo Doc',
      'N° Documento',
      'Código ID',
      'Apellidos y Nombres',
      'Cargo / Puesto',
      'Turno Asignado',
      'Hora Ingreso',
      'Hora Salida',
      'Total Horas Trabajadas',
      'Horas Ordinarias',
      'Horas Extras 25%',
      'Horas Extras 35%',
      'Tardanza (Min)',
      'Estado Asistencia'
    ];

    let sumTot = 0, sumOrd = 0, sum25 = 0, sum35 = 0, sumLate = 0;
    const csvRows = [headers.join(',')];

    list.forEach(item => {
      sumTot += item.totalWorkedHours;
      sumOrd += item.regularHours;
      sum25 += item.overtime25Hours;
      sum35 += item.overtime35Hours;
      sumLate += item.lateMins;

      const statusText = item.status === 'PRESENT' ? 'PUNTUAL' : (item.status === 'LATE' ? 'TARDANZA' : (item.status === 'JUSTIFIED' ? 'JUSTIFICADO' : 'FALTA'));

      const row = [
        `"${item.branch}"`,
        `"${item.area}"`,
        item.docType,
        item.docNumber,
        item.code,
        `"${item.fullName}"`,
        `"${item.position}"`,
        `"${item.shiftName}"`,
        item.firstEntry,
        item.lastExit,
        item.totalWorkedHours.toFixed(2),
        item.regularHours.toFixed(2),
        item.overtime25Hours.toFixed(2),
        item.overtime35Hours.toFixed(2),
        item.lateMins,
        statusText
      ];
      csvRows.push(row.join(','));
    });

    // Fila de Totales Generales
    csvRows.push([
      '"TOTALES GENERALES"',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      '""',
      sumTot.toFixed(2),
      sumOrd.toFixed(2),
      sum25.toFixed(2),
      sum35.toFixed(2),
      sumLate,
      '""'
    ].join(','));

    const blob = new Blob(["\uFEFF" + csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast('¡Archivo CSV descargado exitosamente!', 'success');
  } catch (error) {
    showToast('Error al exportar CSV: ' + error.message, 'error');
  }
}
window.exportToCsv = exportToCsv;

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

    const isNight = String(emp.shift_name || emp.shift_type || '').toLowerCase().includes('noct') || String(emp.shift_id) === '2';
    const shiftName = isNight ? 'Nocturno (19:30 - 07:00)' : 'Diurno (07:30 - 19:00)';

    const firstEntry = att && att.first_entry_time ? new Date(att.first_entry_time).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
    const lastExit = att && att.last_exit_time ? new Date(att.last_exit_time).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
    const lateMins = att ? (att.total_minutes_late || 0) : 0;
    const status = att ? att.status : 'ABSENT';

    // Desglose legal de horas de trabajo (D.L. 854 / MYPE Micro)
    let totalWorkedHours = 0;
    let regularHours = 0;
    let overtime25Hours = 0;
    let overtime35Hours = 0;

    if (att && att.first_entry_time && att.last_exit_time) {
      const entryMs = new Date(att.first_entry_time).getTime();
      let exitMs = new Date(att.last_exit_time).getTime();
      if (exitMs <= entryMs) exitMs += 24 * 60 * 60 * 1000;
      const grossMinutes = Math.max(0, Math.floor((exitMs - entryMs) / (1000 * 60)));
      const effMinutes = Math.max(0, grossMinutes - 60); // Descuento 1h refrigerio
      totalWorkedHours = Number((effMinutes / 60).toFixed(2));
      regularHours = Number(Math.min(8.00, totalWorkedHours).toFixed(2));
      const excess = Math.max(0, totalWorkedHours - 8.00);
      overtime25Hours = Number(Math.min(2.00, excess).toFixed(2));
      overtime35Hours = Number(Math.max(0, totalWorkedHours - 10.00).toFixed(2));
    } else if (att && (att.status === 'PRESENT' || att.status === 'PUNTUAL' || att.status === 'COMPLETED')) {
      // Jornada estándar completa trabajada (11.5h - 1h refrigerio = 10.50h computable)
      totalWorkedHours = 10.50;
      regularHours = 8.00;
      overtime25Hours = 2.00;
      overtime35Hours = 0.50;
    } else if (att && att.total_minutes_worked > 0) {
      const gross = att.total_minutes_worked / 60;
      totalWorkedHours = Number(Math.max(0, gross - 1.00).toFixed(2));
      regularHours = Number(Math.min(8.00, totalWorkedHours).toFixed(2));
      const excess = Math.max(0, totalWorkedHours - 8.00);
      overtime25Hours = Number(Math.min(2.00, excess).toFixed(2));
      overtime35Hours = Number(Math.max(0, totalWorkedHours - 10.00).toFixed(2));
    }

    return {
      id: emp.id,
      code: emp.employee_code || `DAL-${emp.id}`,
      docType,
      docNumber: emp.document_number,
      fullName: `${emp.last_name}, ${emp.first_name}`.toUpperCase(),
      area,
      position: emp.position_name || 'OPERARIO DE PRODUCCIÓN',
      branch: 'PECEPE S.A.C.',
      shiftName,
      firstEntry,
      lastExit,
      hoursWorked: totalWorkedHours.toFixed(2),
      totalWorkedHours,
      regularHours,
      overtime25Hours,
      overtime35Hours,
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
 * Estructura oficial de 16 columnas con Planta al inicio y totales automáticos
 */
async function handleDailyExportExcel() {
  const dateInput = document.getElementById('daily-rep-date')?.value || document.getElementById('rep-start-date')?.value || formatLocalYMD();
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

      const worksheet = workbook.addWorksheet('Asistencia Diaria', {
        views: [{ showGridLines: true }]
      });

      const columns = [
        { name: 'Planta', width: 16 },
        { name: 'Área', width: 24 },
        { name: 'Tipo Doc', width: 11 },
        { name: 'N° Documento', width: 16 },
        { name: 'Código ID', width: 14 },
        { name: 'Apellidos y Nombres', width: 38 },
        { name: 'Cargo / Puesto', width: 30 },
        { name: 'Turno Asignado', width: 28 },
        { name: 'Hora Ingreso', width: 15 },
        { name: 'Hora Salida', width: 15 },
        { name: 'Total Horas Trabajadas', width: 22 },
        { name: 'Horas Ordinarias', width: 18 },
        { name: 'Horas Extras 25%', width: 18 },
        { name: 'Horas Extras 35%', width: 18 },
        { name: 'Tardanza (Min)', width: 16 },
        { name: 'Estado Asistencia', width: 18 }
      ];

      const rows = list.map((item) => [
        item.branch,
        item.area,
        item.docType,
        item.docNumber,
        item.code,
        item.fullName,
        item.position,
        item.shiftName,
        item.firstEntry,
        item.lastExit,
        Number(item.totalWorkedHours.toFixed(2)),
        Number(item.regularHours.toFixed(2)),
        Number(item.overtime25Hours.toFixed(2)),
        Number(item.overtime35Hours.toFixed(2)),
        item.lateMins,
        item.status === 'PRESENT' ? 'PUNTUAL' : (item.status === 'LATE' ? 'TARDANZA' : (item.status === 'JUSTIFIED' ? 'JUSTIFICADO' : 'FALTA'))
      ]);

      // Fila de inicio de datos
      worksheet.addRow(columns.map(c => c.name));
      const startRow = 2;
      rows.forEach(r => worksheet.addRow(r));
      const endRow = startRow + rows.length - 1;

      // Fila de Totales Generales con Fórmulas Nativas SUM de Excel
      const totalRow = worksheet.addRow([
        'TOTALES GENERALES',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        { formula: `SUM(K${startRow}:K${endRow})` }, // Suma Total Horas Trabajadas
        { formula: `SUM(L${startRow}:L${endRow})` }, // Suma Horas Ordinarias
        { formula: `SUM(M${startRow}:M${endRow})` }, // Suma Horas Extras 25%
        { formula: `SUM(N${startRow}:N${endRow})` }, // Suma Horas Extras 35%
        { formula: `SUM(O${startRow}:O${endRow})` }, // Suma Tardanzas
        ''
      ]);

      columns.forEach((c, i) => {
        worksheet.getColumn(i + 1).width = c.width;
      });

      worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        row.height = rowNumber === 1 ? 26 : (rowNumber === endRow + 1 ? 24 : 20);

        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          // Encabezado
          if (rowNumber === 1) {
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.alignment = { vertical: 'middle', horizontal: colNumber >= 11 && colNumber <= 15 ? 'right' : 'center' };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF94A3B8' } },
              bottom: { style: 'medium', color: { argb: 'FF475569' } },
              left: { style: 'thin', color: { argb: 'FF94A3B8' } },
              right: { style: 'thin', color: { argb: 'FF94A3B8' } }
            };
            return;
          }

          // Fila de Totales Generales
          if (rowNumber === endRow + 1) {
            cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
              bottom: { style: 'double', color: { argb: 'FFFFFFFF' } }
            };
            if (colNumber >= 11 && colNumber <= 15) {
              cell.numFmt = '0.00';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if (colNumber === 1) {
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }
            return;
          }

          // Filas de Datos
          cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } };
          const isLeftAlign = colNumber === 1 || colNumber === 2 || colNumber === 6 || colNumber === 7;
          cell.alignment = {
            vertical: 'middle',
            horizontal: (colNumber >= 11 && colNumber <= 15) ? 'right' : (isLeftAlign ? 'left' : 'center'),
            wrapText: false
          };

          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };

          // Formato numérico decimal puro (0.00)
          if (colNumber >= 11 && colNumber <= 14) {
            cell.numFmt = '0.00';
            if (colNumber === 11) cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF047857' } };
            if (colNumber === 13) cell.font = { name: 'Calibri', size: 11, color: { argb: 'FFB45309' } };
            if (colNumber === 14) cell.font = { name: 'Calibri', size: 11, color: { argb: 'FFC2410C' } };
          }

          if (colNumber === 16) {
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

      showToast('¡Excel de asistencia diaria descargado exitosamente!', 'success');
      return;
    }

    // Fallback con SheetJS
    let sumTot = 0, sumOrd = 0, sum25 = 0, sum35 = 0, sumLate = 0;
    const exportRows = list.map((item) => {
      sumTot += item.totalWorkedHours;
      sumOrd += item.regularHours;
      sum25 += item.overtime25Hours;
      sum35 += item.overtime35Hours;
      sumLate += item.lateMins;
      return {
        'Planta': item.branch,
        'Área': item.area,
        'Tipo Doc': item.docType,
        'N° Documento': item.docNumber,
        'Código ID': item.code,
        'Apellidos y Nombres': item.fullName,
        'Cargo / Puesto': item.position,
        'Turno Asignado': item.shiftName,
        'Hora Ingreso': item.firstEntry,
        'Hora Salida': item.lastExit,
        'Total Horas Trabajadas': Number(item.totalWorkedHours.toFixed(2)),
        'Horas Ordinarias': Number(item.regularHours.toFixed(2)),
        'Horas Extras 25%': Number(item.overtime25Hours.toFixed(2)),
        'Horas Extras 35%': Number(item.overtime35Hours.toFixed(2)),
        'Tardanza (Min)': item.lateMins,
        'Estado Asistencia': item.status === 'PRESENT' ? 'PUNTUAL' : (item.status === 'LATE' ? 'TARDANZA' : 'FALTA')
      };
    });

    // Fila de totales generales
    exportRows.push({
      'Planta': 'TOTALES GENERALES',
      'Área': '',
      'Tipo Doc': '',
      'N° Documento': '',
      'Código ID': '',
      'Apellidos y Nombres': '',
      'Cargo / Puesto': '',
      'Turno Asignado': '',
      'Hora Ingreso': '',
      'Hora Salida': '',
      'Total Horas Trabajadas': Number(sumTot.toFixed(2)),
      'Horas Ordinarias': Number(sumOrd.toFixed(2)),
      'Horas Extras 25%': Number(sum25.toFixed(2)),
      'Horas Extras 35%': Number(sum35.toFixed(2)),
      'Tardanza (Min)': sumLate,
      'Estado Asistencia': ''
    });

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistencia Diaria');
    XLSX.writeFile(workbook, fileName);

    showToast('¡Excel de asistencia diaria descargado exitosamente!', 'success');
  } catch (error) {
    showToast('Error al exportar Excel: ' + error.message, 'error');
  }
}
window.handleDailyExportExcel = handleDailyExportExcel;

/**
 * Descargar / Imprimir Reporte PDF Oficial de Asistencia Diaria en Orientación Horizontal (Landscape)
 * Garantiza que la información ingrese 100% completa a la hoja sin desbordes.
 */
async function handleDailyExportPdf() {
  const dateInput = document.getElementById('daily-rep-date')?.value || document.getElementById('rep-start-date')?.value || formatLocalYMD();
  const areaSelect = document.getElementById('daily-rep-area')?.value || '';
  const areaTitle = areaSelect ? areaSelect.toUpperCase() : 'TODAS LAS ÁREAS (CONSOLIDADO)';

  showToast('Preparando reporte para impresión horizontal / PDF...', 'info');

  try {
    const list = await fetchDailyAttendanceData(dateInput, areaSelect);

    if (list.length === 0) {
      showToast('No se encontraron registros de trabajadores.', 'warning');
      return;
    }

    const totalCount = list.length;
    const presentCount = list.filter(i => i.status === 'PRESENT').length;
    const lateCount = list.filter(i => i.status === 'LATE').length;
    const absentCount = list.filter(i => i.status === 'ABSENT' || !i.status).length;

    let sumTot = 0, sumOrd = 0, sum25 = 0, sum35 = 0, sumLate = 0;
    list.forEach(i => {
      sumTot += i.totalWorkedHours;
      sumOrd += i.regularHours;
      sum25 += i.overtime25Hours;
      sum35 += i.overtime35Hours;
      sumLate += i.lateMins;
    });

    const rowsHtml = list.map((item, index) => {
      const isNight = item.shiftName.includes('Nocturno') || item.shiftName.includes('19:30');
      const shiftShort = isNight ? 'Nocturno (19:30 - 07:00)' : 'Diurno (07:30 - 19:00)';
      const statusText = item.status === 'PRESENT' ? 'PUNTUAL' : (item.status === 'LATE' ? `TARDANZA (${item.lateMins}m)` : (item.status === 'JUSTIFIED' ? 'JUSTIFICADO' : 'FALTA'));
      const statusColor = item.status === 'PRESENT' ? '#059669' : (item.status === 'LATE' ? '#d97706' : '#dc2626');

      return `
        <tr>
          <td style="text-align: center; font-weight: bold;">${index + 1}</td>
          <td>${item.branch}</td>
          <td style="font-weight: 600;">${item.area}</td>
          <td style="text-align: center;">${item.docType}</td>
          <td style="text-align: center; font-family: monospace;">${item.docNumber}</td>
          <td style="text-align: center; font-family: monospace; font-weight: bold; color: #002855;">${item.code}</td>
          <td style="font-weight: 700; text-transform: uppercase;">${item.fullName}</td>
          <td>${item.position}</td>
          <td style="text-align: center; font-size: 6.2pt;">${shiftShort}</td>
          <td style="text-align: center; font-family: monospace;">${item.firstEntry}</td>
          <td style="text-align: center; font-family: monospace;">${item.lastExit}</td>
          <td style="text-align: right; font-weight: 800; font-family: monospace; color: #047857;">${item.totalWorkedHours.toFixed(2)}</td>
          <td style="text-align: right; font-family: monospace;">${item.regularHours.toFixed(2)}</td>
          <td style="text-align: right; font-family: monospace; color: #b45309; font-weight: bold;">${item.overtime25Hours.toFixed(2)}</td>
          <td style="text-align: right; font-family: monospace; color: #c2410c; font-weight: bold;">${item.overtime35Hours.toFixed(2)}</td>
          <td style="text-align: right; font-family: monospace;">${item.lateMins}</td>
          <td style="text-align: center; font-weight: 800; color: ${statusColor}; font-size: 6.5pt;">${statusText}</td>
        </tr>
      `;
    }).join('');

    let printContainer = document.getElementById('print-attendance-sheet');
    if (!printContainer) {
      printContainer = document.createElement('div');
      printContainer.id = 'print-attendance-sheet';
      document.body.appendChild(printContainer);
    }

    printContainer.innerHTML = `
      <div style="padding: 0 0 6px 0; border-bottom: 2px solid #002855; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h1 style="font-size: 11pt; font-weight: 900; color: #002855; margin: 0; letter-spacing: 0.5px;">DALUPEZMAR SERVICIOS INDUSTRIALES S.A.C.</h1>
          <p style="font-size: 6.8pt; color: #475569; margin: 1px 0 0 0; font-weight: bold;">RUC: 20615714128 • PLANTA PRINCIPAL PECEPE S.A.C.</p>
        </div>
        <div style="text-align: center;">
          <h2 style="font-size: 9.5pt; font-weight: 900; color: #0f172a; margin: 0; text-transform: uppercase;">PARTE DIARIO CONSOLIDADO DE ASISTENCIA Y HORAS EXTRAS</h2>
          <p style="font-size: 6.8pt; color: #0284c7; margin: 1px 0 0 0; font-weight: bold;">Área: ${areaTitle} • Jornadas Fijas: Diurno (07:30 - 19:00) / Nocturno (19:30 - 07:00) • 1h Refrigerio Descontada</p>
        </div>
        <div style="text-align: right; font-size: 6.8pt; color: #64748b;">
          <p style="margin: 0;"><b>Fecha Reporte:</b> ${dateInput}</p>
          <p style="margin: 1px 0 0 0;"><b>Total Personal:</b> ${totalCount} colaboradores</p>
        </div>
      </div>

      <!-- Tarjetas de Resumen KPI -->
      <div style="display: flex; gap: 6px; margin-bottom: 6px;">
        <div style="flex: 1; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 3px 6px; text-align: center;">
          <span style="font-size: 6.5pt; font-weight: 800; color: #475569; text-transform: uppercase;">Total Personal: </span>
          <span style="font-size: 8pt; font-weight: 900; color: #002855;">${totalCount}</span>
        </div>
        <div style="flex: 1; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px; padding: 3px 6px; text-align: center;">
          <span style="font-size: 6.5pt; font-weight: 800; color: #065f46; text-transform: uppercase;">Puntuales: </span>
          <span style="font-size: 8pt; font-weight: 900; color: #059669;">${presentCount}</span>
        </div>
        <div style="flex: 1; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 3px 6px; text-align: center;">
          <span style="font-size: 6.5pt; font-weight: 800; color: #92400e; text-transform: uppercase;">Tardanzas: </span>
          <span style="font-size: 8pt; font-weight: 900; color: #d97706;">${lateCount}</span>
        </div>
        <div style="flex: 1; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; padding: 3px 6px; text-align: center;">
          <span style="font-size: 6.5pt; font-weight: 800; color: #991b1b; text-transform: uppercase;">Faltas: </span>
          <span style="font-size: 8pt; font-weight: 900; color: #dc2626;">${absentCount}</span>
        </div>
      </div>

      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 2.5%;">#</th>
            <th style="width: 6%;">Planta</th>
            <th style="width: 8.5%;">Área</th>
            <th style="width: 3.5%;">Doc</th>
            <th style="width: 6.5%;">N° Doc</th>
            <th style="width: 5.5%;">Código ID</th>
            <th style="width: 16.5%;">Apellidos y Nombres</th>
            <th style="width: 11%;">Cargo / Puesto</th>
            <th style="width: 9.5%;">Turno Asignado</th>
            <th style="width: 5.5%;">Hora Ingreso</th>
            <th style="width: 5.5%;">Hora Salida</th>
            <th style="width: 4.2%;">Total Horas</th>
            <th style="width: 3.8%;">Horas Ord.</th>
            <th style="width: 3.8%;">HE 25%</th>
            <th style="width: 3.8%;">HE 35%</th>
            <th style="width: 3.5%;">Tard. (Min)</th>
            <th style="width: 4.7%;">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="11" style="text-align: center; font-weight: 900; letter-spacing: 1px;">TOTALES GENERALES</td>
            <td style="text-align: right; font-family: monospace;">${sumTot.toFixed(2)}</td>
            <td style="text-align: right; font-family: monospace;">${sumOrd.toFixed(2)}</td>
            <td style="text-align: right; font-family: monospace;">${sum25.toFixed(2)}</td>
            <td style="text-align: right; font-family: monospace;">${sum35.toFixed(2)}</td>
            <td style="text-align: right; font-family: monospace;">${sumLate}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>

      <div style="margin-top: 14px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 6.8pt; color: #475569; page-break-inside: avoid;">
        <div>
          <p style="margin: 0;">Impreso / Generado: ${new Date().toLocaleString('es-PE')} | Sistema Integral DALUPEZMAR</p>
          <p style="margin: 1px 0 0 0; color: #94a3b8;">Cálculos automáticos basados en el D.L. 854 y D.S. 007-2002-TR (Microempresa / General).</p>
        </div>
        <div style="display: flex; gap: 40px;">
          <div style="border-top: 1px solid #475569; width: 140px; text-align: center; padding-top: 2px;">
            <p style="margin: 0; font-weight: bold; color: #0f172a;">SUPERVISOR DE TURNO</p>
            <p style="margin: 0; font-size: 6pt; color: #64748b;">Firma y Sello</p>
          </div>
          <div style="border-top: 1px solid #475569; width: 140px; text-align: center; padding-top: 2px;">
            <p style="margin: 0; font-weight: bold; color: #0f172a;">RECURSOS HUMANOS</p>
            <p style="margin: 0; font-size: 6pt; color: #64748b;">V° B° DALUPEZMAR</p>
          </div>
        </div>
      </div>
    `;

    setTimeout(() => {
      window.print();
    }, 150);

  } catch (error) {
    showToast('Error al generar PDF: ' + error.message, 'error');
  }
}
window.handleDailyExportPdf = handleDailyExportPdf;

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

