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
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert(items)
      .select();
      
    if (error) throw error;
    return data;
  },

  async findByOrderId(orderId) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('*')
      .eq('order_id', orderId);
      // Tinanggal natin ang .order('created_at') dito

    if (error) throw error;
    return data;
  },

 async getPendingItems() {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select(`
        product_id,
        quantity,
        orders!inner ( status, order_type )
      `)
      .in('orders.status', ['Confirmed', 'Ready']);
      // TINANGGAL NATIN YUNG .eq('orders.order_type', 'Buy Now') 
      // para mabasa na rin niya ang mga Pre-Orders

    if (error) throw error;
    return data;
  },
};

export { OrderItemsModel };