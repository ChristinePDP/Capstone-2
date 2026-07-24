import { supabase } from '../config/supabase.js';

const InventoryLogModel = {
  logHistory: async (data) => {
    const { error } = await supabase.from('inventory_logs').insert(data);
    if (error) {
      console.error('ERROR SAVING LOG:', error); // Lalabas sa terminal kung bakit hindi pumasok
    }
  },

  getByDateRange: async (startDate, endDate, { ascending = true } = {}) => {
    const { data, error } = await supabase
      .from('inventory_logs') 
      .select('item_type, item_name, transaction_type, quantity, cost, action, created_at')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending });

    if (error) throw error;
    return data;
  },
};

export { InventoryLogModel };