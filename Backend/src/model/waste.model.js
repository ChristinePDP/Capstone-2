import { supabase } from '../config/supabase.js';

const WasteModel = {
  // IMPORTANT: hindi na kasama dito ang mga naka-void na record (naka-
  // filter out sa pamamagitan ng .is('voided_at', null)) — para hindi
  // na kasama sa normal na listahan at sa "Tantiya ng Lugi" total, pero
  // NANANATILI PA RIN sila sa database (audit trail).
  findAll: (limit = 50) =>
    supabase.from('waste_logs')
      .select('*')
      .is('voided_at', null)
      .order('logged_at', { ascending: false })
      .limit(limit),

  findById: (id) => supabase.from('waste_logs').select('*').eq('id', id).single(),

  create: (data) => supabase.from('waste_logs').insert(data).select().single(),

  markVoided: (id) =>
    supabase.from('waste_logs')
      .update({ voided_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single(),
};

export { WasteModel };