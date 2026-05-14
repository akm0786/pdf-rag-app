import axios from 'axios';

// 1. Define the base URL
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// 2. Create an axios client
const apiClient = axios.create({ baseURL: `${BASE_URL}/api` });

// 3. Request Interceptor: Automatically attach the token to every request
apiClient.interceptors.request.use((config) => {

    const token = localStorage.getItem('token');

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;

}, (error) => {
    return Promise.reject(error);
});

// 4. Export grouped API functions

export const authService = {
    login: (credentials) => apiClient.post('/auth/login', credentials),
    register: (userData) => apiClient.post('auth/register', userData)
}

export const documentService = {
    upload: (FormData) => apiClient.post('/docs/process', FormData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    getAll: () => apiClient.get('/docs'),
    delete: (filename) => apiClient.delete(`/docs/${filename}`)
}

export const chatService = {
    ask: (question) => apiClient.post('/chat/ask', { question }),
    getHistory: () => apiClient.get('/chat/history')
}