/**
 * Cliente API centralizado para el frontend
 */
const API_BASE = '/api/v1';

const api = {
  getToken() {
    return localStorage.getItem('agy_jwt_token');
  },

  setToken(token) {
    localStorage.setItem('agy_jwt_token', token);
  },

  getUser() {
    const userStr = localStorage.getItem('agy_user');
    return userStr ? JSON.parse(userStr) : null;
  },

  setUser(user) {
    localStorage.setItem('agy_user', JSON.stringify(user));
  },

  clearSession() {
    localStorage.removeItem('agy_jwt_token');
    localStorage.removeItem('agy_user');
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

    // Si el body es FormData, remover Content-Type para que el navegador configure el boundary
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
        throw new Error(data.message || 'Error en la petición al servidor.');
      }

      return data;
    } catch (error) {
      console.error(`Error en API [${endpoint}]:`, error);
      throw error;
    }
  },

  // Endpoints específicos
  auth: {
    login: (credentials) => api.request('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }),
    profile: () => api.request('/auth/profile')
  },

  employees: {
    getAll: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return api.request(`/employees?${query}`);
    },
    getById: (id) => api.request(`/employees/${id}`),
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
    punch: (data) => api.request('/attendance/punch', { method: 'POST', body: JSON.stringify(data) }),
    getTodayLogs: () => api.request('/attendance/today-logs'),
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
