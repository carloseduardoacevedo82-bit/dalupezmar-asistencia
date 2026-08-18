const db = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');

/**
 * Obtener estadísticas en tiempo real del día y tendencias semanales
 */
const getDashboardStats = (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Total empleados activos
    const totalActiveEmployees = db.prepare("SELECT COUNT(*) as count FROM employees WHERE status = 'ACTIVE'").get().count;

    // 2. Estadísticas de hoy
    const todayStats = db.prepare(`
      SELECT 
        COUNT(CASE WHEN status IN ('PRESENT', 'LATE') THEN 1 END) as present_count,
        COUNT(CASE WHEN status = 'LATE' THEN 1 END) as late_count,
        COUNT(CASE WHEN status = 'JUSTIFIED' THEN 1 END) as justified_count,
        COALESCE(SUM(total_minutes_late), 0) as total_late_minutes,
        COALESCE(SUM(total_minutes_overtime), 0) as total_overtime_minutes
      FROM attendances
      WHERE attendance_date = ?
    `).get(today);

    // 3. Ausentes estimados (Activos - Registrados hoy)
    const registeredTodayCount = db.prepare("SELECT COUNT(*) as count FROM attendances WHERE attendance_date = ?").get(today).count;
    const absentCount = Math.max(0, totalActiveEmployees - registeredTodayCount);

    // 4. Justificaciones pendientes
    const pendingJustifications = db.prepare("SELECT COUNT(*) as count FROM justifications WHERE status = 'PENDING'").get().count;

    // 5. Distribución de asistencia por departamento hoy
    const departmentBreakdown = db.prepare(`
      SELECT 
        d.name as department_name,
        COUNT(e.id) as total_employees,
        COUNT(a.id) as present_employees,
        COUNT(CASE WHEN a.status = 'LATE' THEN 1 END) as late_employees
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'ACTIVE'
      LEFT JOIN attendances a ON e.id = a.employee_id AND a.attendance_date = ?
      WHERE d.is_active = 1
      GROUP BY d.id
      ORDER BY total_employees DESC
    `).all(today);

    // 6. Tendencia de los últimos 7 días
    const weeklyTrend = db.prepare(`
      SELECT 
        attendance_date,
        COUNT(CASE WHEN status IN ('PRESENT', 'LATE') THEN 1 END) as present,
        COUNT(CASE WHEN status = 'LATE' THEN 1 END) as late
      FROM attendances
      WHERE attendance_date >= date(?, '-7 days')
      GROUP BY attendance_date
      ORDER BY attendance_date ASC
    `).all(today);

    // 7. Últimas 10 marcaciones en vivo
    const recentLogs = db.prepare(`
      SELECT 
        l.id,
        l.punch_type,
        l.punch_time,
        l.punch_source,
        e.employee_code,
        e.first_name,
        e.last_name,
        e.photo_url,
        d.name as department_name,
        p.name as position_name
      FROM attendance_logs l
      INNER JOIN employees e ON l.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      LEFT JOIN positions p ON e.position_id = p.id
      WHERE DATE(l.punch_time) = ?
      ORDER BY l.punch_time DESC
      LIMIT 8
    `).all(today);

    return successResponse(res, 'Métricas del dashboard recuperadas.', {
      overview: {
        total_active_employees: totalActiveEmployees,
        present_today: todayStats.present_count,
        late_today: todayStats.late_count,
        absent_today: absentCount,
        justified_today: todayStats.justified_count,
        total_late_minutes: todayStats.total_late_minutes,
        total_overtime_minutes: todayStats.total_overtime_minutes,
        pending_justifications: pendingJustifications,
        attendance_rate: totalActiveEmployees > 0 ? Math.round((todayStats.present_count / totalActiveEmployees) * 100) : 0
      },
      department_breakdown: departmentBreakdown,
      weekly_trend: weeklyTrend,
      recent_logs: recentLogs
    });
  } catch (error) {
    console.error('Error al generar métricas del dashboard:', error);
    return errorResponse(res, 'Error al calcular métricas en tiempo real.', error.message);
  }
};

module.exports = {
  getDashboardStats
};
