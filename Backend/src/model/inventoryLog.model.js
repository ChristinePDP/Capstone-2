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

  // FIX: idinagdag ang `.is('voided_at', null)` — ito ang ginagamit ng
  // Four KPI (totalExpenses) at Stacked Bar services. Dati, kasama pa
  // rin sa expenses total ang mga logs na na-void na, kaya sablay ang
  // pagbilang. Tugma na ito ngayon sa pattern ng OrdersModel
  // (excludeCancelled) at ng getNearExpiring dito mismo sa file na ito.
  getByDateRange: async (startDate, endDate, { ascending = true } = {}) => {
    const { data, error } = await supabase
      .from('inventory_logs')
      .select('id, item_type, item_name, transaction_type, quantity, cost, action, created_at, voided_at')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .is('voided_at', null)
      .order('created_at', { ascending });

    if (error) throw error;
    return data;
  },

  getHistory: async ({ startDate, endDate, itemName, itemType, itemId, limit = 100 } = {}) => {
      let query = supabase
        .from('inventory_logs')
        .select('id, item_type, item_name, raw_ingredient_id, material_id, unit, transaction_type, quantity, cost, action, created_at, voided_at, expiration_date')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);
      if (itemId && itemType === 'raw') query = query.eq('raw_ingredient_id', itemId);
      else if (itemId && itemType === 'material') query = query.eq('material_id', itemId);
      else if (itemName) query = query.eq('item_name', itemName);
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

  getActiveExpiringBatches: async (daysAhead = 30) => {
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const expiryStart = new Date(`${todayStr}T00:00:00Z`);
    expiryStart.setUTCDate(expiryStart.getUTCDate() - 7);
    const startStr = expiryStart.toISOString().slice(0, 10);
    const future = new Date(`${todayStr}T00:00:00Z`);
    future.setUTCDate(future.getUTCDate() + daysAhead);
    const futureStr = future.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('inventory_logs')
      .select('id, raw_ingredient_id, item_name, quantity, unit, remaining_quantity, remaining_unit, expiration_date')
      .eq('item_type', 'raw')
      .eq('transaction_type', 'IN')
      .is('voided_at', null)
      .gt('remaining_quantity', 0)
      .not('expiration_date', 'is', null)
      .gte('expiration_date', startStr)
      .lte('expiration_date', futureStr)
      .order('expiration_date', { ascending: true });

    if (error) throw error;
    return data;
  },

  getRecentlyAutoLoggedExpiredBatches: async () => {
    const todayStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const expiryStart = new Date(`${todayStr}T00:00:00Z`);
    expiryStart.setUTCDate(expiryStart.getUTCDate() - 7);
    const startStr = expiryStart.toISOString().slice(0, 10);
    const loggedSince = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const { data: wasteRows, error: wasteError } = await supabase
      .from('waste_logs')
      .select('id, source_inventory_log_id, quantity, unit, cost, logged_at')
      .not('source_inventory_log_id', 'is', null)
      .eq('reason', 'Expired')
      .is('voided_at', null)
      .gte('logged_at', loggedSince);
    if (wasteError) throw wasteError;
    if (!wasteRows?.length) return [];

    const sourceIds = wasteRows.map(row => row.source_inventory_log_id);
    const { data: batches, error: batchError } = await supabase
      .from('inventory_logs')
      .select('id, raw_ingredient_id, item_name, quantity, unit, expiration_date')
      .in('id', sourceIds)
      .gte('expiration_date', startStr)
      .lt('expiration_date', todayStr);
    if (batchError) throw batchError;

    const wasteBySourceId = new Map(wasteRows.map(row => [String(row.source_inventory_log_id), row]));
    return (batches || []).map(batch => {
      const waste = wasteBySourceId.get(String(batch.id));
      return {
        ...batch,
        id: batch.id,
        remaining_quantity: 0,
        remaining_unit: waste?.unit || batch.unit,
        status: 'auto_logged',
        wasted_quantity: Number(waste?.quantity || 0),
        waste_cost: Number(waste?.cost || 0),
        waste_log_id: waste?.id,
        waste_logged_at: waste?.logged_at,
      };
    });
  },

  autoLogExpiredBatches: async () => {
    const asOf = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const { data, error } = await supabase.rpc('auto_log_expired_inventory_batches', { p_as_of: asOf });
    if (error) throw error;
    return data || { logged: 0, skipped: 0 };
  },

  voidAutoExpiredWaste: async (wasteLogId) => {
    const { data, error } = await supabase.rpc('void_auto_expired_waste', { p_waste_log_id: wasteLogId });
    if (error) throw error;
    return data;
  },
};

export { InventoryLogModel };
