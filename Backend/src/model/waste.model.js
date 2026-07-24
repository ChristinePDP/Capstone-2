import { supabase } from '../config/supabase.js';

const WasteModel = {
  findAll: (limit = 50) =>
    supabase.from('waste_logs')
      .select('*')
      .order('logged_at', { ascending: false })
      .limit(limit),

  create: (data) => supabase.from('waste_logs').insert(data).select().single(),
};

export { WasteModel };