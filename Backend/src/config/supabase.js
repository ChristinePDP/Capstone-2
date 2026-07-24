import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'fake-secret-for-testing';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("BABALA: Walang nakitang Supabase credentials. Pakicheck ang iyong .env file!");
}

// Direkta na nating i-initialize dahil inalis na natin ang fallback
const supabase = createClient(supabaseUrl, supabaseKey);

const getSupabase = () => {
  return supabase;
};

// Gamitin ang tamang ES Module export syntax!
export { supabase, getSupabase };