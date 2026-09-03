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
      { name: 'Departamento / Área', width: 24 },
      { name: 'Cargo / Puesto', width: 28 },
      { name: 'Turno Asignado', width: 28 },
      { name: 'Hora Entrada', width: 15 },
      { name: 'Hora Salida', width: 15 },
      { name: 'Total Horas Trabajadas', width: 22 },
      { name: 'Horas Ordinarias', width: 18 },
      { name: 'Horas Extras 25%', width: 18 },
      { name: 'Horas Extras 35%', width: 18 },
      { name: 'Minutos Tardanza', width: 16 },
      { name: 'Estado Asistencia', width: 18 }
    ];

    const rows = sortedData.map((r, index) => {
      const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';
      
      let totalHoras = 0;
      if (r.first_entry_time && r.last_exit_time) {
        const entryMs = new Date(r.first_entry_time).getTime();
        let exitMs = new Date(r.last_exit_time).getTime();
        if (exitMs <= entryMs) exitMs += 24 * 60 * 60 * 1000;
        const grossMin = Math.max(0, Math.floor((exitMs - entryMs) / 60000));
        const netMin = Math.max(0, grossMin - 60); // Descuento 1h de refrigerio
        totalHoras = Number((netMin / 60).toFixed(2));
      } else if (r.total_minutes_worked && Number(r.total_minutes_worked) > 0) {
        const netMin = Math.max(0, Number(r.total_minutes_worked) - 60);
        totalHoras = Number((netMin / 60).toFixed(2));
        if (totalHoras === 0) totalHoras = 10.50;
      } else if (r.status === 'PRESENT' || r.status === 'COMPLETED' || r.status === 'PUNTUAL' || r.status === 'LATE') {
        totalHoras = 10.50; // Jornada completa computable estándar
      }

      const horasBase = Number(Math.min(8.00, totalHoras).toFixed(2));
      const exceso = Math.max(0, totalHoras - 8.00);
      const he25 = Number(Math.min(2.00, exceso).toFixed(2));
      const he35 = Number(Math.max(0, totalHoras - 10.00).toFixed(2));

      const isNight = String(r.shift_name || r.shift_type || '').toLowerCase().includes('noct') || String(r.shift_name || '').includes('19:30') || String(r.shift_id) === '2';
      const shiftName = isNight ? 'Nocturno (19:30 - 07:00)' : 'Diurno (07:30 - 19:00)';

      return [
        index + 1,
        String(r.attendance_date || '').split('T')[0],
        r.employee_code,
        r.document_number,
        `${r.last_name}, ${r.first_name}`.toUpperCase(),
        r.department_name || '',
        r.position_name || '',
        shiftName,
        formatTime(r.first_entry_time),
        formatTime(r.last_exit_time),
        totalHoras,
        horasBase,
        he25,
        he35,
        r.total_minutes_late || 0,
        r.status === 'PRESENT' ? 'PUNTUAL' : (r.status === 'LATE' ? 'TARDANZA' : (r.status === 'JUSTIFIED' ? 'JUSTIFICADO' : 'FALTA'))
      ];
    });

    // Fila de inicio de datos
    worksheet.addRow(columns.map(c => c.name));
    const startDataRow = 2;
    rows.forEach(r => worksheet.addRow(r));
    const endDataRow = startDataRow + rows.length - 1;

    // Fila de totales generales al final con fórmulas nativas SUM de Excel
    const totalRow = worksheet.addRow([
      '',
      'TOTALES GENERALES',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      { formula: `SUM(K${startDataRow}:K${endDataRow})` }, // Suma Total Horas Trabajadas
      { formula: `SUM(L${startDataRow}:L${endDataRow})` }, // Suma Horas Ordinarias
      { formula: `SUM(M${startDataRow}:M${endDataRow})` }, // Suma Horas Extras 25%
      { formula: `SUM(N${startDataRow}:N${endDataRow})` }, // Suma Horas Extras 35%
      { formula: `SUM(O${startDataRow}:O${endDataRow})` }, // Suma Tardanzas
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
          } else if (colNumber === 2) {
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
          return;
        }

        // Filas de Datos
        cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } };
        const isLeftAlign = colNumber === 5 || colNumber === 6 || colNumber === 7 || colNumber === 8;
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

    showToast('¡Archivo Excel (.xlsx) con distribución de horas exportado exitosamente!', 'success');
    return;
  }

  // Fallback con SheetJS
  let fTot = 0, fOrd = 0, f25 = 0, f35 = 0, fLate = 0;
  const exportRows = sortedData.map((r, index) => {
    const formatTime = (iso) => iso ? new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--';

    let totalHoras = 0;
    if (r.first_entry_time && r.last_exit_time) {
      const entryMs = new Date(r.first_entry_time).getTime();
      let exitMs = new Date(r.last_exit_time).getTime();
      if (exitMs <= entryMs) exitMs += 24 * 60 * 60 * 1000;
      const grossMin = Math.max(0, Math.floor((exitMs - entryMs) / 60000));
      const netMin = Math.max(0, grossMin - 60);
      totalHoras = Number((netMin / 60).toFixed(2));
    } else if (r.total_minutes_worked && Number(r.total_minutes_worked) > 0) {
      const netMin = Math.max(0, Number(r.total_minutes_worked) - 60);
      totalHoras = Number((netMin / 60).toFixed(2));
      if (totalHoras === 0) totalHoras = 10.50;
    } else if (r.status === 'PRESENT' || r.status === 'COMPLETED' || r.status === 'PUNTUAL' || r.status === 'LATE') {
      totalHoras = 10.50;
    }

    const horasBase = Number(Math.min(8.00, totalHoras).toFixed(2));
    const exceso = Math.max(0, totalHoras - 8.00);
    const he25 = Number(Math.min(2.00, exceso).toFixed(2));
    const he35 = Number(Math.max(0, totalHoras - 10.00).toFixed(2));
    const late = Number(r.total_minutes_late || 0);

    fTot += totalHoras;
    fOrd += horasBase;
    f25 += he25;
    f35 += he35;
    fLate += late;

    const isNight = String(r.shift_name || r.shift_type || '').toLowerCase().includes('noct') || String(r.shift_name || '').includes('19:30') || String(r.shift_id) === '2';
    const shiftName = isNight ? 'Nocturno (19:30 - 07:00)' : 'Diurno (07:30 - 19:00)';

    return {
      'N°': index + 1,
      'Fecha': String(r.attendance_date || '').split('T')[0],
      'Código Empleado': r.employee_code,
      'Documento': r.document_number,
      'Apellidos y Nombres': `${r.last_name}, ${r.first_name}`.toUpperCase(),
      'Departamento / Área': r.department_name || '',
      'Cargo / Puesto': r.position_name || '',
      'Turno Asignado': shiftName,
      'Hora Entrada': formatTime(r.first_entry_time),
      'Hora Salida': formatTime(r.last_exit_time),
      'Total Horas Trabajadas': totalHoras,
      'Horas Ordinarias': horasBase,
      'Horas Extras 25%': he25,
      'Horas Extras 35%': he35,
      'Minutos Tardanza': late,
      'Estado Asistencia': r.status === 'PRESENT' ? 'PUNTUAL' : (r.status === 'LATE' ? 'TARDANZA' : (r.status === 'JUSTIFIED' ? 'JUSTIFICADO' : 'FALTA'))
    };
  });

  exportRows.push({
    'N°': '',
    'Fecha': 'TOTALES GENERALES',
    'Código Empleado': '',
    'Documento': '',
    'Apellidos y Nombres': '',
    'Departamento / Área': '',
    'Cargo / Puesto': '',
    'Turno Asignado': '',
    'Hora Entrada': '',
    'Hora Salida': '',
    'Total Horas Trabajadas': Number(fTot.toFixed(2)),
    'Horas Ordinarias': Number(fOrd.toFixed(2)),
    'Horas Extras 25%': Number(f25.toFixed(2)),
    'Horas Extras 35%': Number(f35.toFixed(2)),
    'Minutos Tardanza': fLate,
    'Estado Asistencia': ''
  });

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
        '',
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
        '',
        { formula: `SUM(M${startRow}:M${endRow})` }, // Suma Total Horas Trabajadas
        { formula: `SUM(N${startRow}:N${endRow})` }, // Suma Horas Ordinarias
        { formula: `SUM(O${startRow}:O${endRow})` }, // Suma Horas Extras 25%
        { formula: `SUM(P${startRow}:P${endRow})` }, // Suma Horas Extras 35%
        { formula: `SUM(Q${startRow}:Q${endRow})` }, // Suma Tardanzas
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
            cell.alignment = { vertical: 'middle', horizontal: colNumber >= 13 && colNumber <= 17 ? 'right' : 'center' };
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
            if (colNumber >= 13 && colNumber <= 17) {
              cell.numFmt = '0.00';
              cell.alignment = { vertical: 'middle', horizontal: 'right' };
            } else if (colNumber === 2) {
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }
            return;
          }

          // Filas de Datos
          cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF0F172A' } };
          const isLeftAlign = colNumber === 4 || colNumber === 8 || colNumber === 9 || colNumber === 10;
          cell.alignment = {
            vertical: 'middle',
            horizontal: (colNumber >= 13 && colNumber <= 17) ? 'right' : (isLeftAlign ? 'left' : 'center'),
            wrapText: false
          };

          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };

          // Formato numérico decimal puro (0.00)
          if (colNumber >= 13 && colNumber <= 16) {
            cell.numFmt = '0.00';
            if (colNumber === 13) cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF047857' } };
            if (colNumber === 15) cell.font = { name: 'Calibri', size: 11, color: { argb: 'FFB45309' } };
            if (colNumber === 16) cell.font = { name: 'Calibri', size: 11, color: { argb: 'FFC2410C' } };
          }

          if (colNumber === 18) {
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

      showToast('¡Excel en formato tabla con horas extras descargado exitosamente!', 'success');
      return;
    }

    // Fallback con SheetJS
    let sumTot = 0, sumOrd = 0, sum25 = 0, sum35 = 0;
    const exportRows = list.map((item, index) => {
      sumTot += item.totalWorkedHours;
      sumOrd += item.regularHours;
      sum25 += item.overtime25Hours;
      sum35 += item.overtime35Hours;
      return {
        'N°': index + 1,
        'Fecha': dateInput,
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
      'N°': '',
      'Fecha': 'TOTALES GENERALES',
      'Planta': '',
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
      'Tardanza (Min)': '',
      'Estado Asistencia': ''
    });

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

