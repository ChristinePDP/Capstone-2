import { getSupabase } from '../config/supabase.js';

const TABLE = 'orders';

const OrdersModel = {
  getByDateRange: async (
    startDate,
    endDate,
    { columns = '*', excludeCancelled = false } = {}
  ) => {
    let query = getSupabase()
      .from(TABLE)
      .select(columns)
      .gte('updated_at', startDate)
      .lte('updated_at', endDate);

    if (excludeCancelled) {
      query = query.neq('status', 'Cancelled');
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },
  
  async findAll() {
    const { data, error } = await getSupabase()
      .from('orders')
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await getSupabase()
      .from('orders')
      .select('*, customers(name, phone), order_items(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload) {
    return getSupabase()
      .from('orders')
      .insert(payload)
      .select()
      .single();
  },
};

export { OrdersModel };