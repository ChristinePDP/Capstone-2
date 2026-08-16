import { supabase } from '../config/supabase.js';

const InventoryLogModel = {
  logHistory: async (data) => {
    const { data: inserted, error } = await supabase
      .from('inventory_logs')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('ERROR SAVING LOG:', error); // Lalabas sa terminal kung bakit hindi pumasok
      return null;
    }
    return inserted;
  },

  // Kunin ang isang partikular na log entry — ginagamit ito ng
  // void-restock flow para malaman kung ano talaga ang ii-reverse
  // (item_name, item_type, quantity) bago tayo gumalaw sa stock.
  findById: async (id) => {
    const { data, error } = await supabase
      .from('inventory_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  // Kanselahin (void) ang isang restock entry — hindi totoong "delete",
  // naka-mark na lang bilang voided_at para manatili ang audit trail,
  // pareho ng ginagawa na natin sa WasteModel.markVoided.
  markVoided: async (id) => {
    const { data, error } = await supabase
      .from('inventory_logs')
      .update({ voided_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  getByDateRange: async (startDate, endDate, { ascending = true } = {}) => {
    const { data, error } = await supabase
      .from('inventory_logs')
      .select('id, item_type, item_name, transaction_type, quantity, cost, action, created_at, voided_at')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at', { ascending });

    if (error) throw error;
    return data;
  },

  getHistory: async ({ startDate, endDate, itemName, itemType, limit = 100 } = {}) => {
      let query = supabase
        .from('inventory_logs')
        // DAGDAG: expiration_date
        .select('id, item_type, item_name, transaction_type, quantity, cost, action, created_at, voided_at, expiration_date')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);
      if (itemName) query = query.eq('item_name', itemName);
      if (itemType) query = query.eq('item_type', itemType);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },

    getNearExpiring: async (daysAhead = 14) => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const future = new Date(today);
    future.setDate(future.getDate() + daysAhead);
    const futureStr = future.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('inventory_logs')
      .select('id, item_type, item_name, transaction_type, quantity, cost, action, created_at, expiration_date')
      .eq('transaction_type', 'IN')
      .is('voided_at', null)
      .not('expiration_date', 'is', null)
      .gte('expiration_date', todayStr)
      .lte('expiration_date', futureStr)
      .order('expiration_date', { ascending: true });

    if (error) throw error;
    return data;
  },
};

export { InventoryLogModel };