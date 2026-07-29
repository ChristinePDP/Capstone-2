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

  // Ginagamit ng "View History" sa Raw Materials / Celebration Materials
  // tabs — para makita kung saan napunta ang bawat restock, production
  // deduction, at waste (walang "butas" sa pagsubaybay ng stock).
  getHistory: async ({ startDate, endDate, itemName, limit = 100 } = {}) => {
    let query = supabase
      .from('inventory_logs')
      .select('item_type, item_name, transaction_type, quantity, cost, action, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    if (itemName) query = query.eq('item_name', itemName);

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
};

export { InventoryLogModel };