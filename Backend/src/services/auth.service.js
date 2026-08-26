import jwt from 'jsonwebtoken';
import { AuthModel } from '../model/auth.model.js';

async function login(email, password) {
  const { data: authData, error: authError } = await AuthModel.signIn(email, password);
  if (authError || !authData?.user) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const { data: admin, error: adminError } = await AuthModel.getAdminById(authData.user.id);
  if (adminError || !admin) {
    const err = new Error('Admin account not found');
    err.statusCode = 403;
    throw err;
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  return { token, admin };
}

async function getProfile(adminId) {
  const { data, error } = await AuthModel.getAdminById(adminId);
  if (error || !data) {
    const err = new Error('Admin not found');
    err.statusCode = 404;
    throw err;
  }
  return data;
}

// hakbang 1 — magpadala ng OTP sa email
async function requestPasswordReset(email) {
  const { error } = await AuthModel.requestPasswordReset(email);
  if (error) {
    const err = new Error('Unable to send reset code. Please try again.');
    err.statusCode = 400;
    throw err;
  }
  return { message: 'OTP sent to email' };
}

// ✅ BAGONG FUNCTION: hakbang 1.5 — i-verify lang yung OTP 
async function verifyOtpOnly(email, otp) {
  const { data, error } = await AuthModel.verifyRecoveryOtp(email, otp);
  if (error || !data?.user) {
    const err = new Error('Invalid or expired OTP');
    err.statusCode = 401;
    throw err;
  }
  return { message: 'OTP is valid' };
}

// hakbang 2 — i-verify yung OTP tapos i-update ang password
async function verifyResetOtp(email, otp, newPassword) {
  const { data, error } = await AuthModel.verifyRecoveryOtp(email, otp);
  if (error || !data?.user) {
    const err = new Error('Invalid or expired OTP');
    err.statusCode = 401;
    throw err;
  }

  const { error: updateError } = await AuthModel.updatePasswordByUserId(
    data.user.id,
    newPassword
  );
  if (updateError) {
    const err = new Error('Failed to update password');
    err.statusCode = 500;
    throw err;
  }

  return { message: 'Password updated successfully' };
}

const AuthService = { login, getProfile, requestPasswordReset, verifyOtpOnly, verifyResetOtp };

export { login, getProfile, requestPasswordReset, verifyOtpOnly, verifyResetOtp, AuthService };