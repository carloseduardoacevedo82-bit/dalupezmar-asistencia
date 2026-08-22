/**
 * ============================================================================
 * CLIENTE API CENTRALIZADO DALUPEZMAR CON PERSISTENCIA POSTGRESQL Y STATUS REAL
 * ============================================================================
 * Conecta el frontend con el backend refactorizado en Render / PostgreSQL.
 * Incluye monitor de salud de base de datos y alerta visual si la BD está desconectada.
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

      if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/worker-login')) {
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

  // Healthcheck y Estado de la Base de Datos
  health: {
    async checkDb() {
      try {
        const res = await fetch('/api/v1/health');
        const data = await res.json();
        const isDbConnected = res.ok && data.database === 'connected';
        api.health.renderDbStatusBanner(isDbConnected, data.error);
        return { isConnected: isDbConnected, data };
      } catch (err) {
        api.health.renderDbStatusBanner(false, 'Servidor no responde');
        return { isConnected: false, error: err.message };
      }
    },

    renderDbStatusBanner(isConnected, errorMessage) {
      let banner = document.getElementById('db-status-alert-banner');
      if (!isConnected) {
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'db-status-alert-banner';
          banner.className = 'fixed top-0 left-0 right-0 z-50 bg-rose-600 text-white px-4 py-2 text-xs md:text-sm font-semibold flex items-center justify-between shadow-lg animate-pulse';
          document.body.prepend(banner);
        }
        banner.innerHTML = `
          <div class="flex items-center space-x-2">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            <span>⚠️ <strong>Base de datos no disponible:</strong> El servidor backend no puede comunicarse con la base de datos persistente en la nube. ${errorMessage ? `(${errorMessage})` : ''}</span>
          </div>
          <button onclick="api.health.checkDb()" class="bg-rose-800 hover:bg-rose-900 px-3 py-1 rounded text-xs transition">Reintentar</button>
        `;
        banner.style.display = 'flex';
      } else if (banner) {
        banner.style.display = 'none';
      }
    }
  },

  // Endpoints de Autenticación
  auth: {
    login: (credentials) => api.request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    workerLogin: (credentials) => api.request('/auth/worker-login', { method: 'POST', body: JSON.stringify(credentials) }),
    profile: () => api.request('/auth/profile'),
    register: (userData) => api.request('/auth/register', { method: 'POST', body: JSON.stringify(userData) }),
    getUsers: () => api.request('/auth/users'),
    updateUser: (id, data) => api.request(`/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteUser: (id) => api.request(`/auth/users/${id}`, { method: 'DELETE' })
  },

  // Endpoints de Empleados
  employees: {
    getAll: async (params = {}) => {
      const query = new URLSearchParams(params).toString();
      try {
        const res = await api.request(`/employees?${query}`);
        if (res && res.data) {
          localStorage.setItem(LOCAL_STORAGE_KEYS.EMPLOYEES_CACHE, JSON.stringify(res.data));
        }
        return res;
      } catch (err) {
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
    delete: (id) => api.request(`/employees/${id}`, { method: 'DELETE' }),
    getCatalogs: () => api.request('/employees/catalogs'),
    getBranches: () => api.request('/employees/branches'),
    updateBranchGeofence: (id, data) => api.request(`/employees/branches/${id}/geofence`, { method: 'PUT', body: JSON.stringify(data) }),
    assignBranch: (employeeId, branchId) => api.request(`/employees/${employeeId}/branch`, { method: 'PUT', body: JSON.stringify({ branch_id: branchId }) })
  },

  // Endpoints de Credenciales
  badges: {
    getByEmployeeId: (empId) => api.request(`/badges/employee/${empId}`),
    regenerate: (empId, data) => api.request(`/badges/employee/${empId}/regenerate`, { method: 'POST', body: JSON.stringify(data) }),
    verify: (token) => api.request('/badges/verify', { method: 'POST', body: JSON.stringify({ token }) })
  },

  // Endpoints de Asistencia
  attendance: {
    punch: async (payload) => {
      const nowIso = new Date().toISOString();
      try {
        const res = await api.request('/attendance/punch', { method: 'POST', body: JSON.stringify(payload) });
        if (res && res.success) {
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
        if (err.status && err.status >= 400) {
          throw err;
        }

        console.warn('Fallo real de red: guardando marcación en almacenamiento local temporal...');
        const cachedEmployeesStr = localStorage.getItem(LOCAL_STORAGE_KEYS.EMPLOYEES_CACHE) || '[]';
        const cachedEmployees = JSON.parse(cachedEmployeesStr);
        
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
          localStorage.setItem(LOCAL_STORAGE_KEYS.TODAY_LOGS, JSON.stringify(res.data));
          api.syncPendingPunches();
          return res;
        }
        return res;
      } catch (err) {
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
    getJustificaciones: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return api.request(`/attendance/justifications?${query}`);
    },
    createJustification: (formData) => api.request('/attendance/justifications', { method: 'POST', body: formData }),
    reviewJustification: (id, data) => api.request(`/attendance/justifications/${id}/review`, { method: 'PUT', body: JSON.stringify(data) })
  },

  // Endpoints de Portal de Firmas y Documentos
  signatures: {
    send: (data) => api.request('/signatures/send', { method: 'POST', body: JSON.stringify(data) }),
    retry: (documentId) => api.request('/signatures/retry', { method: 'POST', body: JSON.stringify({ document_id: documentId }) }),
    getByWorker: (workerId) => api.request(`/signatures/worker/${workerId}`),
    getAll: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return api.request(`/signatures/all?${query}`);
    }
  },

  dashboard: {
    getStats: () => api.request('/dashboard/stats')
  }
};

// Monitoreo de salud al iniciar la página y cada 30 segundos
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    api.health.checkDb();
    api.syncPendingPunches();
  });

  window.addEventListener('online', () => {
    api.health.checkDb();
    api.syncPendingPunches();
  });

  setInterval(() => {
    api.health.checkDb();
    api.syncPendingPunches();
  }, 30000);
}
