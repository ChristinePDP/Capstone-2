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

      // IMPORTANT: huwag nang mag-redirect kung nasa /login page na tayo.
      // Dati, kahit nasa /login na, patuloy pa ring nagre-redirect papunta
      // sa /login (full page reload). Yun ang sanhi ng INFINITE LOOP: bawat
      // reload, tumatakbo ulit ang AppProvider's fetchAll() (kasi naka-wrap
      // din ang login page dito), lahat ng requests ay 401 dahil wala pang
      // naka-login, kaya mag-re-redirect na naman -> reload -> walang
      // katapusan.
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);