/**
 * Lógica del Dashboard Administrativo en Vivo y Analítica
 */
let trendChart = null;
let deptChart = null;
let activeJustifId = null;

document.addEventListener('DOMContentLoaded', async () => {
  displayCurrentDate();
  await loadDashboardData();
  await loadJustifications();

  document.getElementById('btn-refresh-stats')?.addEventListener('click', async () => {
    showToast('Actualizando métricas...', 'info');
    await loadDashboardData();
    await loadJustifications();
  });

  // Modal de revisión de justificaciones
  document.getElementById('btn-close-justif-modal')?.addEventListener('click', () => {
    document.getElementById('modal-review-justification')?.classList.add('hidden');
  });

  document.getElementById('btn-approve-justif')?.addEventListener('click', () => handleReviewJustification('APPROVED'));
  document.getElementById('btn-reject-justif')?.addEventListener('click', () => handleReviewJustification('REJECTED'));

  // Polling automático cada 20 segundos
  setInterval(loadDashboardData, 20000);
});

function displayCurrentDate() {
  const el = document.getElementById('dashboard-date-display');
  if (el) {
    const now = new Date();
    el.textContent = now.toLocaleDateString('es-PE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).toUpperCase();
  }
}

/**
 * Cargar estadísticas y métricas del Dashboard
 */
async function loadDashboardData() {
  try {
    const response = await api.dashboard.getStats();
    if (!response || !response.data) return;

    const { overview, department_breakdown, weekly_trend, recent_logs } = response.data;

    // Actualizar KPIs
    document.getElementById('kpi-present-count').textContent = overview.present_today;
    document.getElementById('kpi-attendance-rate').textContent = `${overview.attendance_rate}%`;
    document.getElementById('kpi-total-employees').textContent = overview.total_active_employees;
    document.getElementById('kpi-late-count').textContent = overview.late_today;
    document.getElementById('kpi-late-minutes').textContent = overview.total_late_minutes;
    document.getElementById('kpi-absent-count').textContent = overview.absent_today;
    document.getElementById('kpi-justified-count').textContent = overview.justified_today;
    document.getElementById('kpi-pending-justifications').textContent = overview.pending_justifications;
    document.getElementById('kpi-overtime-minutes').textContent = `${(overview.total_overtime_minutes / 60).toFixed(1)}h`;

    // Renderizar Gráficos
    renderWeeklyTrendChart(weekly_trend);
    renderDepartmentChart(department_breakdown);

    // Renderizar Feed de Marcaciones
    renderRecentLogs(recent_logs);
  } catch (error) {
    console.error('Error al cargar datos del dashboard:', error);
  }
}

/**
 * Gráfico de Tendencia Semanal (Chart.js)
 */
function renderWeeklyTrendChart(trendData) {
  const ctx = document.getElementById('chart-weekly-trend')?.getContext('2d');
  if (!ctx) return;

  const labels = trendData.map(t => {
    const d = new Date(t.attendance_date + 'T00:00:00');
    return d.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' });
  });

  const presents = trendData.map(t => t.present);
  const lates = trendData.map(t => t.late);

  if (trendChart) trendChart.destroy();

  trendChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels.length > 0 ? labels : ['Hoy'],
      datasets: [
        {
          label: 'Puntuales',
          data: presents.length > 0 ? presents : [0],
          backgroundColor: '#3b82f6',
          borderRadius: 8
        },
        {
          label: 'Tardanzas',
          data: lates.length > 0 ? lates : [0],
          backgroundColor: '#f59e0b',
          borderRadius: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#cbd5e1', font: { family: 'Plus Jakarta Sans', size: 11 } }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 10 } }
        },
        y: {
          grid: { color: '#334155' },
          ticks: { color: '#94a3b8', stepSize: 1, font: { family: 'Plus Jakarta Sans', size: 10 } }
        }
      }
    }
  });
}

/**
 * Gráfico de Cobertura por Departamento
 */
function renderDepartmentChart(deptData) {
  const ctx = document.getElementById('chart-departments')?.getContext('2d');
  if (!ctx) return;

  const labels = deptData.map(d => d.department_name);
  const dataPresent = deptData.map(d => d.present_employees);

  if (deptChart) deptChart.destroy();

  deptChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataPresent.length > 0 ? dataPresent : [1],
        backgroundColor: ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#cbd5e1', font: { family: 'Plus Jakarta Sans', size: 11 }, boxWidth: 12 }
        }
      },
      cutout: '68%'
    }
  });
}

/**
 * Renderizar marcaciones recientes
 */
function renderRecentLogs(logs) {
  const container = document.getElementById('dashboard-recent-logs');
  if (!container) return;

  if (!logs || logs.length === 0) {
    container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">Sin registros de marcación hoy.</div>`;
    return;
  }

  const typeMap = {
    ENTRY: '<span class="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-500/20">ENTRADA</span>',
    LUNCH_START: '<span class="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded text-[10px] font-bold border border-amber-500/20">REFRIGERIO</span>',
    LUNCH_END: '<span class="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded text-[10px] font-bold border border-cyan-500/20">RETORNO</span>',
    EXIT: '<span class="text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded text-[10px] font-bold border border-rose-500/20">SALIDA</span>'
  };

  container.innerHTML = logs.map(log => {
    const time = new Date(log.punch_time).toLocaleTimeString('es-PE', { hour12: true });
    return `
      <div class="flex items-center justify-between p-2.5 rounded-2xl bg-slate-900/60 border border-slate-800">
        <div class="flex items-center gap-3">
          <img src="${log.photo_url || '/uploads/photos/default-avatar.png'}" class="w-8 h-8 rounded-xl object-cover border border-slate-700">
          <div>
            <p class="text-xs font-bold text-white leading-tight">${log.first_name} ${log.last_name}</p>
            <p class="text-[10px] text-slate-400 font-mono">${log.employee_code} • ${log.department_name || 'General'}</p>
          </div>
        </div>
        <div class="text-right flex flex-col items-end gap-0.5">
          ${typeMap[log.punch_type] || log.punch_type}
          <span class="text-[10px] text-slate-400 font-mono font-semibold">${time}</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Cargar y mostrar lista de justificaciones pendientes
 */
async function loadJustifications() {
  try {
    const response = await api.attendance.getJustifications({ status: 'PENDING' });
    const container = document.getElementById('dashboard-justifications-list');
    if (!container) return;

    if (!response || !response.data || response.data.length === 0) {
      container.innerHTML = `<div class="text-center py-6 text-slate-500 text-xs">No hay solicitudes de justificación pendientes.</div>`;
      return;
    }

    const list = response.data;
    container.innerHTML = list.map(j => `
      <div class="p-3 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-3">
        <div>
          <p class="text-xs font-bold text-white">${j.first_name} ${j.last_name} <span class="text-[10px] text-purple-400 font-mono font-semibold">(${j.reason_type})</span></p>
          <p class="text-[10px] text-slate-400">Periodo: ${j.start_date} al ${j.end_date}</p>
          <p class="text-[11px] text-slate-300 italic mt-0.5 line-clamp-1">"${j.description}"</p>
        </div>
        <button onclick="openReviewModal(${j.id}, '${j.first_name} ${j.last_name}', '${j.reason_type}', '${j.start_date} al ${j.end_date}', '${encodeURIComponent(j.description)}')" class="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold transition">
          Revisar
        </button>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error al cargar justificaciones:', error);
  }
}

function openReviewModal(id, empName, reason, dates, descEncoded) {
  activeJustifId = id;
  document.getElementById('justif-modal-emp').textContent = empName;
  document.getElementById('justif-modal-reason').textContent = reason;
  document.getElementById('justif-modal-dates').textContent = dates;
  document.getElementById('justif-modal-desc').textContent = decodeURIComponent(descEncoded);
  document.getElementById('justif-modal-comment').value = '';
  document.getElementById('modal-review-justification')?.classList.remove('hidden');
}

async function handleReviewJustification(status) {
  if (!activeJustifId) return;
  const comment = document.getElementById('justif-modal-comment').value.trim();

  try {
    const response = await api.attendance.reviewJustification(activeJustifId, {
      status,
      reviewer_comment: comment
    });

    if (response && response.success) {
      showToast(`Solicitud ${status === 'APPROVED' ? 'aprobada' : 'rechazada'} exitosamente.`, 'success');
      document.getElementById('modal-review-justification')?.classList.add('hidden');
      await loadDashboardData();
      await loadJustifications();
    }
  } catch (error) {
    showToast('Error al procesar revisión: ' + error.message, 'error');
  }
}
