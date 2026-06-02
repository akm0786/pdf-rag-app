// frontend/src/services/api.js
import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// Create an Axios client
const apiClient = axios.create({ baseURL: `${BASE_URL}/api` });

// Request Interceptor: Automatically attach the access token to every request
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

// Response Interceptor: Handle Token Expiration (401/403) and refresh automatically
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If error is 401/403 and request hasn't been retried yet
        if (error.response && (error.response.status === 401 || error.response.status === 403) && !originalRequest._retry) {
            
            // Skip refresh for auth routes to prevent loops
            if (originalRequest.url.includes('/auth/refresh') || originalRequest.url.includes('/auth/login')) {
                return Promise.reject(error);
            }

            // Queue concurrent requests while token is refreshing
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                .then(token => {
                    originalRequest.headers['Authorization'] = 'Bearer ' + token;
                    return apiClient(originalRequest);
                })
                .catch(err => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) {
                handleForcedLogout();
                return Promise.reject(error);
            }

            try {
                // Call endpoint directly using standard axios to avoid recursion
                const res = await axios.post(`${BASE_URL}/api/auth/refresh`, { refreshToken });
                const { token: newAccessToken } = res.data;

                localStorage.setItem('token', newAccessToken);
                apiClient.defaults.headers.common['Authorization'] = 'Bearer ' + newAccessToken;
                originalRequest.headers['Authorization'] = 'Bearer ' + newAccessToken;

                processQueue(null, newAccessToken);
                isRefreshing = false;

                return apiClient(originalRequest);
            } catch (refreshErr) {
                processQueue(refreshErr, null);
                isRefreshing = false;
                handleForcedLogout();
                return Promise.reject(refreshErr);
            }
        }
        return Promise.reject(error);
    }
);

function handleForcedLogout() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userEmail');
    window.location.reload(); // Force reload to trigger Auth screen
}

// Export API services
export const authService = {
    login: (credentials) => apiClient.post('/auth/login', credentials),
    register: (userData) => apiClient.post('/auth/register', userData),
    googleLogin: (idToken) => apiClient.post('/auth/google-login', { idToken }),
    logout: (refreshToken) => apiClient.post('/auth/logout', { refreshToken }),
}

export const documentService = {
    upload: (formData) => apiClient.post('/docs/process', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getAll: () => apiClient.get('/docs'),
    delete: (filename) => apiClient.delete(`/docs/${filename}`),
    getJobs: () => apiClient.get('/docs/jobs') // New route to query background jobs status
}

export const chatService = {
    ask: (question) => apiClient.post('/chat/ask', { question }), // Note: UI will use fetch directly for streaming ask endpoint
    getHistory: () => apiClient.get('/chat/history')
}