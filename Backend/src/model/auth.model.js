import 'dotenv/config';
import { supabase } from '../config/supabase.js';

const AuthModel = {
  signIn: (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),

  getAdminById: (userId) =>
    supabase
      .from('admins')
      .select('id, name, email, created_at')
      .eq('id', userId)
      .single(),
};

export { AuthModel };