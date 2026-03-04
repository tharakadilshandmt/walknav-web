import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('walknav_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Handle 401 responses (redirect to login)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('walknav_token');
            localStorage.removeItem('walknav_user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// ============================================
// Auth API
// ============================================
export const authAPI = {
    register: (email, password, name) =>
        api.post('/auth/register', { email, password, name }),

    login: (email, password) =>
        api.post('/auth/login', { email, password }),

    getProfile: () =>
        api.get('/auth/me'),
};

// ============================================
// Routes API
// ============================================
export const routesAPI = {
    calculate: (origin, destination, mode = 'walk') =>
        api.post('/routes/calculate', { origin, destination, mode }),

    snap: (lat, lng) =>
        api.post('/routes/snap', { lat, lng }),

    getGraph: () =>
        api.get('/routes/graph'),

    saveHistory: (data) =>
        api.post('/routes/history', data),

    getHistory: (limit = 20, offset = 0) =>
        api.get(`/routes/history?limit=${limit}&offset=${offset}`),
};

// ============================================
// Zones API
// ============================================
export const zonesAPI = {
    list: () => api.get('/zones'),
    getGraph: (zoneId) => api.get(`/zones/${zoneId}/graph`),
    getStats: (zoneId) => api.get(`/zones/${zoneId}/stats`),
    getQR: (zoneId) => api.get(`/zones/${zoneId}/qr`),
};

// ============================================
// Weather API
// ============================================
export const weatherAPI = {
    get: (lat, lng) =>
        api.get(`/weather?lat=${lat}&lng=${lng}`),
};

// ============================================
// Admin API (admin role required)
// ============================================
export const adminAPI = {
    getStats: () => api.get('/admin/stats'),
    getUsers: (limit = 50, offset = 0) => api.get(`/admin/users?limit=${limit}&offset=${offset}`),
    updateUserRole: (userId, role) => api.patch(`/admin/users/${userId}/role`, { role }),
    getAnalytics: () => api.get('/admin/analytics'),
};

export default api;

