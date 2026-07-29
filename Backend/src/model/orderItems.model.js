import { getSupabase } from '../config/supabase.js';

const TABLE = 'order_items';

const OrderItemsModel = {
  getByOrderDateRange: async (
    startDate,
    endDate,
    { columns = 'quantity, product_name, orders!inner(created_at, status)', excludeCancelled = true } = {}
  ) => {
    let query = getSupabase()
      .from(TABLE)
      .select(columns)
      .gte('orders.created_at', startDate)
      .lte('orders.created_at', endDate);

    if (excludeCancelled) {
      query = query.neq('orders.status', 'Cancelled');
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  async createMany(items) {
    return getSupabase()
      .from(TABLE)
      .insert(items)
      .select();
  },

  async findByOrderId(orderId) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data;
  },
};

export { OrderItemsModel };