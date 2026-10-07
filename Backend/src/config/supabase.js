import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'fake-secret-for-testing';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

// Service role ang PRIORIDAD. Dati, tahimik na bumabagsak sa anon key kapag
// walang SUPABASE_SERVICE_ROLE_KEY (o walang laman / may typo sa .env o sa
// hosting env vars) — at dahil naka-RLS ang storage, "Object not found" ang
// lumalabas sa createSignedUrl kahit nandoon naman ang file. Kaya ngayon,
// maingay na ang babala at makikita agad sa startup kung anong key ang gamit.
const supabaseKey = serviceRoleKey || anonKey;
const usingServiceRole = Boolean(serviceRoleKey);

if (!supabaseUrl || !supabaseKey) {
  console.error('[SUPABASE] BABALA: Walang nakitang Supabase credentials. Pakicheck ang iyong .env file!');
}

if (!usingServiceRole) {
  console.error(
    '[SUPABASE] ⚠️  SUPABASE_SERVICE_ROLE_KEY is missing/empty — gumagamit ng ANON key. ' +
    'Hindi gagana ang private storage signing (payment proofs) at maaaring ma-block ng RLS ang ibang queries.'
  );
}

// Alamin kung anong role talaga ang nasa key (para sa startup log lang).
// Ang legacy keys ay JWT (may "role" claim); ang bagong "sb_secret_..." /
// "sb_publishable_..." keys ay hindi JWT.
const describeKey = (key) => {
  if (!key) return 'none';
  if (key.startsWith('sb_secret_')) return 'service_role (sb_secret)';
  if (key.startsWith('sb_publishable_')) return 'anon (sb_publishable)';
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
    return payload.role || 'unknown';
  } catch {
    return 'unknown';
  }
};

const activeRole = describeKey(supabaseKey);
console.log(`[SUPABASE] Client initialized. Key role: ${activeRole}`);

if (usingServiceRole && activeRole === 'anon') {
  console.error(
    '[SUPABASE] ⚠️  Ang nakalagay sa SUPABASE_SERVICE_ROLE_KEY ay ANON key pala! ' +
    'Kunin ang "service_role" key sa Dashboard → Project Settings → API.'
  );
}

// Backend-only client. HUWAG i-expose ang service role key sa frontend.
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const getSupabase = () => {
  return supabase;
};

export { supabase, getSupabase, usingServiceRole };