/**
 * Cliente API centralizado para el frontend con Persistencia Permanente Offline-First
 * Garantiza que las marcaciones, lecturas de fotochecks y datos de trabajadores
 * NO se pierdan al cerrar el aplicativo en el celular o reiniciarlo.
 */
const API_BASE = '/api/v1';

const LOCAL_STORAGE_KEYS = {
  TOKEN: 'agy_jwt_token',
  USER: 'agy_user',
  EMPLOYEES_CACHE: 'dalupezmar_cached_employees',
  TODAY_LOGS: 'dalupezmar_today_logs',
  PENDING_PUNCHES: 'dalupezmar_pending_sync_punches',
  LAST_SCANNED_INFO: 'dalupezmar_last_scanned_worker'
};

const api = {
  getToken() {
    return localStorage.getItem(LOCAL_STORAGE_KEYS.TOKEN);
  },

  setToken(token) {
    localStorage.setItem(LOCAL_STORAGE_KEYS.TOKEN, token);
  },

  getUser() {
    const userStr = localStorage.getItem(LOCAL_STORAGE_KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
  },

  setUser(user) {
    localStorage.setItem(LOCAL_STORAGE_KEYS.USER, JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem(LOCAL_STORAGE_KEYS.TOKEN);
    localStorage.removeItem(LOCAL_STORAGE_KEYS.USER);
  },

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();

      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        this.clearSession();
        window.location.href = '/index.html?expired=1';
        return null;
      }

      if (!response.ok) {
        const err = new Error(data.message || 'Error en la petición al servidor.');
        err.status = response.status;
        err.data = data.data;
        throw err;
      }

      return data;
    } catch (error) {
      if (error.status) {
        // Es un error legítimo de la API (403, 404, 400, etc.)
        throw error;
      }
      console.warn(`[API Network Offline Fallback] ${endpoint}:`, error.message);
      throw error;
    }
  },

  // Sincronización en segundo plano de marcaciones pendientes guardadas en el celular
  async syncPendingPunches() {
    try {
      const pendingStr = localStorage.getItem(LOCAL_STORAGE_KEYS.PENDING_PUNCHES);
      if (!pendingStr) return;

      const pending = JSON.parse(pendingStr);
      if (!Array.isArray(pending) || pending.length === 0) return;

      console.log(`[Sync] Sincronizando ${pending.length} marcaciones pendientes con la base de datos...`);
      const remaining = [];

      for (const item of pending) {
        try {
          await this.request('/attendance/punch', {
            method: 'POST',
            body: JSON.stringify(item.payload)
          });
        } catch (err) {
          if (err.status && err.status >= 400 && err.status < 500) {
            console.warn('[Sync] Marcación descartada de cola por rechazo del servidor:', err.message);
          } else {
            remaining.push(item);
          }
        }
      }

      localStorage.setItem(LOCAL_STORAGE_KEYS.PENDING_PUNCHES, JSON.stringify(remaining));
      if (remaining.length === 0) {
        console.log('✅ Todas las marcaciones móviles han sido sincronizadas en el servidor.');
      }
    } catch (e) {
      console.warn('[Sync Error]', e);
    }
  },

  // Endpoints específicos
  auth: {
    login: (credentials) => api.request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    workerLogin: (credentials) => api.request('/auth/worker-login', { method: 'POST', body: JSON.stringify(credentials) }),
    profile: () => api.request('/auth/profile'),
    register: (userData) => api.request('/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
    getUsers: () => api.request('/auth/users'),
    updateUser: (id, data) => api.request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id) => api.request(`/auth/users/${id}`, { method: 'DELETE' })
  },

  employees: {
    getAll: async (params = {}) => {
      const query = new URLSearchParams(params).toString();
      try {
        const res = await api.request(`/employees?${query}`);
        if (res && res.data) {
          // Guardar copia permanente en localStorage del celular
          localStorage.setItem(LOCAL_STORAGE_KEYS.EMPLOYEES_CACHE, JSON.stringify(res.data));
        }
        return res;
      } catch (err) {
        // Fallback local permanente si no hay conexión o se reabre la app
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.EMPLOYEES_CACHE);
        if (cached) {
          return { success: true, count: JSON.parse(cached).length, data: JSON.parse(cached), offline: true };
        }
        throw err;
      }
    },
    getById: async (id) => {
      try {
        return await api.request(`/employees/${id}`);
      } catch (err) {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.EMPLOYEES_CACHE);
        if (cached) {
          const list = JSON.parse(cached);
          const found = list.find(e => String(e.id) === String(id) || String(e.document_number) === String(id));
          if (found) return { success: true, data: found, offline: true };
        }
        throw err;
      }
    },
    create: (formData) => api.request('/employees', { method: 'POST', body: formData }),
    update: (id, formData) => api.request(`/employees/${id}`, { method: 'PUT', body: formData }),
    getCatalogs: () => api.request('/employees/catalogs'),
    getBranches: () => api.request('/employees/branches'),
    updateBranchGeofence: (id, data) => api.request(`/employees/branches/${id}/geofence`, { method: 'PUT', body: JSON.stringify(data) }),
    assignBranch: (employeeId, branchId) => api.request(`/employees/${employeeId}/branch`, { method: 'PUT', body: JSON.stringify({ branch_id: branchId }) })
  },

  badges: {
    getByEmployeeId: (empId) => api.request(`/badges/employee/${empId}`),
    regenerate: (empId, data) => api.request(`/badges/employee/${empId}/regenerate`, { method: 'POST', body: JSON.stringify(data) }),
    verify: (token) => api.request('/badges/verify', { method: 'POST', body: JSON.stringify({ token }) })
  },

  attendance: {
    punch: async (payload) => {
      const nowIso = new Date().toISOString();

      // Guardar inmediatamente en cola de persistencia local
      try {
        const res = await api.request('/attendance/punch', { method: 'POST', body: JSON.stringify(payload) });
        
        if (res && res.success) {
          // Guardar en el historial local persistente de hoy
          const todayLogsStr = localStorage.getItem(LOCAL_STORAGE_KEYS.TODAY_LOGS) || '[]';
          let todayLogs = JSON.parse(todayLogsStr);
          if (!Array.isArray(todayLogs)) todayLogs = [];

          const newLog = {
            id: 'local_' + Date.now(),
            employee_id: res.data.employee.id,
            first_name: res.data.employee.name.split(' ')[0] || 'Colaborador',
            last_name: res.data.employee.name.split(' ').slice(1).join(' ') || '',
            document_number: res.data.employee.document_number,
            position_name: res.data.employee.position,
            branch_name: res.data.employee.branch_name,
            photo_url: res.data.employee.photo_url,
            punch_type: res.data.punch.type,
            punch_time: res.data.punch.time || nowIso,
            source: payload.punch_source || 'MOBILE_SCAN',
            status: 'REGISTERED'
          };

          todayLogs.unshift(newLog);
          localStorage.setItem(LOCAL_STORAGE_KEYS.TODAY_LOGS, JSON.stringify(todayLogs.slice(0, 100)));
          localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SCANNED_INFO, JSON.stringify(res.data));
        }
        return res;
      } catch (err) {
        // Si el servidor respondió con un error de validación o rechazo (403 INACTIVO, 404 NO ENCONTRADO, etc.)
        // NUNCA crear marcación offline ni guardarla localmente: relanzar el error directamente al UI
        if (err.status && err.status >= 400) {
          throw err;
        }

        // Solo en caso de fallo real de red (offline / desconectado)
        console.warn('Fallo real de red: guardando marcación en almacenamiento local temporal (Offline Safe)...');
        
        const cachedEmployeesStr = localStorage.getItem(LOCAL_STORAGE_KEYS.EMPLOYEES_CACHE) || '[]';
        const cachedEmployees = JSON.parse(cachedEmployeesStr);
        
        // Buscar empleado localmente por DNI o código
        const rawToken = String(payload.token || '');
        const matchedEmp = cachedEmployees.find(e => 
          rawToken.includes(e.document_number) || 
          rawToken.includes(e.employee_code) ||
          e.document_number === rawToken
        ) || {
          id: 0,
          first_name: 'Colaborador',
          last_name: `(${rawToken.substring(0, 15)})`,
          document_number: rawToken,
          position_name: 'Operario de Planta',
          photo_url: '/uploads/photos/default-avatar.png'
        };

        const offlinePunch = {
          success: true,
          offline: true,
          message: 'Marcación guardada en el celular (Sincronización automática)',
          data: {
            employee: {
              id: matchedEmp.id,
              name: `${matchedEmp.first_name} ${matchedEmp.last_name}`.trim(),
              document_number: matchedEmp.document_number,
              position: matchedEmp.position_name || 'Operario',
              photo_url: matchedEmp.photo_url || '/uploads/photos/default-avatar.png',
              branch_name: 'DALUPEZMAR Planta Principal'
            },
            punch: {
              type: payload.punch_type === 'AUTO' ? 'ENTRY' : payload.punch_type,
              time: nowIso,
              tardiness_minutes: 0,
              distance_meters: 0
            }
          }
        };

        // Guardar en logs locales
        const todayLogsStr = localStorage.getItem(LOCAL_STORAGE_KEYS.TODAY_LOGS) || '[]';
        let todayLogs = JSON.parse(todayLogsStr);
        if (!Array.isArray(todayLogs)) todayLogs = [];

        todayLogs.unshift({
          id: 'offline_' + Date.now(),
          first_name: matchedEmp.first_name,
          last_name: matchedEmp.last_name,
          document_number: matchedEmp.document_number,
          position_name: matchedEmp.position_name,
          photo_url: matchedEmp.photo_url,
          punch_type: offlinePunch.data.punch.type,
          punch_time: nowIso,
          source: payload.punch_source || 'MOBILE_SCAN',
          status: 'OFFLINE_PENDING'
        });
        localStorage.setItem(LOCAL_STORAGE_KEYS.TODAY_LOGS, JSON.stringify(todayLogs.slice(0, 100)));

        // Guardar en cola de sincronización pendiente
        const pendingStr = localStorage.getItem(LOCAL_STORAGE_KEYS.PENDING_PUNCHES) || '[]';
        let pending = JSON.parse(pendingStr);
        if (!Array.isArray(pending)) pending = [];
        pending.push({ payload, time: nowIso });
        localStorage.setItem(LOCAL_STORAGE_KEYS.PENDING_PUNCHES, JSON.stringify(pending));
        localStorage.setItem(LOCAL_STORAGE_KEYS.LAST_SCANNED_INFO, JSON.stringify(offlinePunch.data));

        return offlinePunch;
      }
    },

    getTodayLogs: async () => {
      try {
        const res = await api.request('/attendance/today-logs');
        if (res && res.data) {
          // Fusionar con logs locales si existen
          const localLogsStr = localStorage.getItem(LOCAL_STORAGE_KEYS.TODAY_LOGS) || '[]';
          const localLogs = JSON.parse(localLogsStr);
          
          // Guardar los datos actualizados
          localStorage.setItem(LOCAL_STORAGE_KEYS.TODAY_LOGS, JSON.stringify(res.data));
          
          // Sincronizar en segundo plano si hay pendientes
          api.syncPendingPunches();
          return res;
        }
        return res;
      } catch (err) {
        // Cargar desde persistencia local del celular
        const cached = localStorage.getItem(LOCAL_STORAGE_KEYS.TODAY_LOGS);
        if (cached) {
          return { success: true, count: JSON.parse(cached).length, data: JSON.parse(cached), offline: true };
        }
        return { success: true, count: 0, data: [], offline: true };
      }
    },

    getReport: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return api.request(`/attendance/report?${query}`);
    },
    updateRecord: (id, data) => api.request(`/attendance/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteRecord: (id) => api.request(`/attendance/records/${id}`, { method: 'DELETE' }),
    createManualRecord: (data) => api.request('/attendance/manual-record', { method: 'POST', body: JSON.stringify(data) }),
    getJustifications: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return api.request(`/attendance/justifications?${query}`);
    },
    createJustification: (formData) => api.request('/attendance/justifications', { method: 'POST', body: formData }),
    reviewJustification: (id, data) => api.request(`/attendance/justifications/${id}/review`, { method: 'PUT', body: JSON.stringify(data) })
  },

  dashboard: {
    getStats: () => api.request('/dashboard/stats')
  }
};

// Activar listener de sincronización cuando el celular recupera conexión a internet
window.addEventListener('online', () => {
  api.syncPendingPunches();
});

// Sincronización periódica cada 30 segundos
setInterval(() => {
  api.syncPendingPunches();
}, 30000);
