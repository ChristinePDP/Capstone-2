import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export async function login(email, password) {
  try {
    const res = await axios.post(`${API_BASE}/login`, { email, password }, {
      withCredentials: true 
    });
    localStorage.setItem('isLoggedIn', 'true');

    // Save the admin data returned by the backend so the header (and other
    // parts of the app) can show the real logged-in account, not a fallback.
    if (res.data?.data?.admin) {
      localStorage.setItem('admin', JSON.stringify(res.data.data.admin));
    }

    return res.data.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || 'Login failed', { cause: err });
  }
}

export async function logout() {
  try {
    const res = await axios.post(`${API_BASE}/logout`, null, {
      withCredentials: true
    });
    return res.data;
  } finally {
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('admin');
  }
}

export async function requestPasswordReset(email) {
  try {
    const res = await axios.post(`${API_BASE}/forgot-password`, { email });
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || 'Failed to send OTP', { cause: err });
  }
}

// ✅ BAGONG FUNCTION: I-che-check lang ang OTP kung tama
export async function verifyOtpOnly(email, otp) {
  try {
    const res = await axios.post(`${API_BASE}/verify-otp`, { email, otp });
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || 'Invalid or expired OTP', { cause: err });
  }
}

// Para sa final step: I-sa-save na ang bagong password
export async function resetPasswordWithOtp(email, otp, newPassword) {
  try {
    const res = await axios.post(`${API_BASE}/reset-password`, { email, otp, newPassword });
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || 'Failed to reset password', { cause: err });
  }
}