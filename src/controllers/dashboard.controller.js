const db = require('../../database/database');
const { successResponse, errorResponse } = require('../utils/responseHandler');
const { getPeruDateString } = require('../utils/timeCalculations');

/**
 * Obtener estadísticas en tiempo real del día y tendencias semanales (Async PostgreSQL)
 */
const getDashboardStats = async (req, res) => {
  try {
    const today = getPeruDateString(new Date());

    // 1. Total empleados activos
    const totalActiveRes = await db.query("SELECT COUNT(*) as count FROM employees WHERE status = 'ACTIVE'");
    const totalActiveEmployees = parseInt(totalActiveRes.rows[0].count, 10);

    // 2. Estadísticas de hoy
    const todayStatsRes = await db.query(`
      SELECT 
        COUNT(CASE WHEN status IN ('PRESENT', 'LATE') THEN 1 END) as present_count,
        COUNT(CASE WHEN status = 'LATE' THEN 1 END) as late_count,
        COUNT(CASE WHEN status = 'JUSTIFIED' THEN 1 END) as justified_count,
        COALESCE(SUM(total_minutes_late), 0) as total_late_minutes,
        COALESCE(SUM(total_minutes_overtime), 0) as total_overtime_minutes
      FROM attendances
      WHERE attendance_date = $1
    `, [today]);
    const todayStats = todayStatsRes.rows[0];

    // 3. Ausentes estimados (Activos - Registrados hoy)
    const registeredTodayRes = await db.query("SELECT COUNT(*) as count FROM attendances WHERE attendance_date = $1", [today]);
    const registeredTodayCount = parseInt(registeredTodayRes.rows[0].count, 10);
    const absentCount = Math.max(0, totalActiveEmployees - registeredTodayCount);

    // 4. Justificaciones pendientes
    const pendingJustRes = await db.query("SELECT COUNT(*) as count FROM justifications WHERE status = 'PENDING'");
    const pendingJustifications = parseInt(pendingJustRes.rows[0].count, 10);

    // 5. Distribución de asistencia por departamento hoy
    const deptBreakdownRes = await db.query(`
      SELECT 
        d.name as department_name,
        COUNT(e.id) as total_employees,
        COUNT(a.id) as present_employees,
        COUNT(CASE WHEN a.status = 'LATE' THEN 1 END) as late_employees
      FROM departments d
      LEFT JOIN employees e ON d.id = e.department_id AND e.status = 'ACTIVE'
      LEFT JOIN attendances a ON e.id = a.employee_id AND a.attendance_date = $1
      WHERE d.is_active = 1
      GROUP BY d.id, d.name
      ORDER BY total_employees DESC
    `, [today]);

    // 6. Tendencia de los últimos 7 días
    const weeklyTrendRes = await db.query(`
      SELECT 
        attendance_date,
        COUNT(CASE WHEN status IN ('PRESENT', 'LATE') THEN 1 END) as present,
        COUNT(CASE WHEN status = 'LATE' THEN 1 END) as late
      FROM attendances
      WHERE attendance_date >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY attendance_date
      ORDER BY attendance_date ASC
    `);

    // 7. Últimas marcaciones en vivo
    const recentLogsRes = await db.query(`
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
      WHERE l.punch_time LIKE $1 || '%'
      ORDER BY l.punch_time DESC
      LIMIT 10
    `, [today]);

    const presentCount = parseInt(todayStats.present_count, 10) || 0;

    return successResponse(res, 'Métricas del dashboard recuperadas.', {
      overview: {
        total_active_employees: totalActiveEmployees,
        present_today: presentCount,
        late_today: parseInt(todayStats.late_count, 10) || 0,
        absent_today: absentCount,
        justified_today: parseInt(todayStats.justified_count, 10) || 0,
        total_late_minutes: parseInt(todayStats.total_late_minutes, 10) || 0,
        total_overtime_minutes: parseInt(todayStats.total_overtime_minutes, 10) || 0,
        pending_justifications: pendingJustifications,
        attendance_rate: totalActiveEmployees > 0 ? Math.round((presentCount / totalActiveEmployees) * 100) : 0
      },
      department_breakdown: deptBreakdownRes.rows,
      weekly_trend: weeklyTrendRes.rows,
      recent_logs: recentLogsRes.rows
    });
  } catch (error) {
    console.error('Error al generar métricas del dashboard:', error);
    return errorResponse(res, 'Error al calcular métricas en tiempo real.', error.message);
  }
};

module.exports = {
  getDashboardStats
};
