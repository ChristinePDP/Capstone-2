import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';

export async function login(email, password) {
  try {
    const res = await axios.post(`${API_BASE}/login`, { email, password }, {
      withCredentials: true // <-- Pinapadala / Tinatanggap ang cookie
    });
    
    // Simpleng flag na lang sa local storage para sa React Router UI natin
    localStorage.setItem('isLoggedIn', 'true');
    return res.data.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || 'Login failed', { cause: err });
  }
}

export async function logout() {
  try {
    const res = await axios.post(`${API_BASE}/logout`, null, {
      withCredentials: true // <-- Para maipadala ang token at ma-clear ng backend
    });
    return res.data;
  } finally {
    // Tanggalin ang flag kapag nag-logout
    localStorage.removeItem('isLoggedIn');
  }
}