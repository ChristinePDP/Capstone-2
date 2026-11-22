import { supabase } from '../config/supabase.js';

const TABLE = 'waste_logs';

const WasteLogsModel = {
  getRecent: async (startDate, endDate) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select('waste_type, item_name, quantity, unit, reason, notes, cost, logged_at, voided_at')
      .is('voided_at', null)
      .gte('logged_at', startDate)
      .lte('logged_at', endDate)
      .order('logged_at', { ascending: false });

    if (error) throw error;
    return data;
  },
};

export { WasteLogsModel };