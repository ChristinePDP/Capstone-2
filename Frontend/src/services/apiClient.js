import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export const apiClient = axios.create({
  baseURL: `${API_BASE}/inventory`,
  withCredentials: true, // <-- Importante: awtomatikong isasama ng browser ang HttpOnly cookie dito!
});

// Auto-logout kapag expired ang token
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('isLoggedIn'); // Burahin ang flag
      window.location.href = '/login'; // I-redirect sa login
    }
    return Promise.reject(error);
  }
);