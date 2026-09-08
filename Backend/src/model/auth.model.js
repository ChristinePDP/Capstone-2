import 'dotenv/config';
import { supabase } from '../config/supabase.js';

const AuthModel = {
  signIn: (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),

  // Verify the current password and establish the Supabase user session needed for the update call.
  signInWithPassword: (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),

  // Change the password for the user established by the verification call above.
  updatePassword: (newPassword) =>
    supabase.auth.updateUser({ password: newPassword }),

  getAdminById: (userId) =>
    supabase
      .from('admins')
      .select('id, name, email, created_at')
      .eq('id', userId)
      .single(),

  // NEW: nagpapadala ng OTP email (gagamitin yung "Reset Password" template natin)
  requestPasswordReset: (email) =>
    supabase.auth.resetPasswordForEmail(email),

  // NEW: i-verify yung 6-digit OTP na nireceive ng user
  verifyRecoveryOtp: (email, token) =>
    supabase.auth.verifyOtp({ email, token, type: 'recovery' }),

  // NEW: i-update ang password gamit ang service role (admin) privileges
  updatePasswordByUserId: (userId, newPassword) =>
    supabase.auth.admin.updateUserById(userId, { password: newPassword }),
};

export { AuthModel };