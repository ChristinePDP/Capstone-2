import { supabase } from '../config/supabase.js';

const ProductionModel = {
  findAll: (limit = 50) =>
    supabase.from('production_logs')
      .select('*, production_deductions(*)')
      .order('produced_at', { ascending: false })
      .limit(limit),

  create: (data) => supabase.from('production_logs').insert(data).select().single(),

  insertDeductions: (logId, deductions) =>
    supabase.from('production_deductions')
      .insert(deductions.map(d => ({ ...d, production_log_id: logId }))),
};

export { ProductionModel };