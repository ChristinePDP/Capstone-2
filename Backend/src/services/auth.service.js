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

const AuthService = { login, getProfile };


export { login, getProfile, AuthService };