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
      .from(TABLE)
      .select('*')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // BAGONG METHOD — ginagamit ng "All Orders" admin page. Kailangan
  // dito ang customer info (name, phone) at order items (product_name,
  // quantity, total_price) kasama ang BAWAT order sa listahan — hindi
  // lang yung raw na row mula sa `orders` table (na wala nitong joins,
  // tingnan ang `findAll()` sa itaas).
  async findAllWithDetails() {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('*, customers(name, phone), order_items(*)')
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('*, customers(name, phone), order_items(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  },

  async create(payload) {
    // FIX: Ini-extract na natin ang { data, error } para id lang ang ibalik
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateStatus(id, status) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .update({ status })
      .eq('id', id)
      .select('*, customers(name, phone), order_items(*)')
      .single();

    if (error) throw error;
    return data;
  },

  async findByOrderNumber(identifier) {
    let query = getSupabase()
      .from(TABLE)
      .select(`
        *,
        customers ( name, phone ),
        order_items ( product_name, quantity, total_price )
      `);

    // FIX: Kung nagsisimula sa 'ORD', sa order_number maghanap. Kung hindi, UUID id yan.
    if (String(identifier).startsWith('ORD')) {
      query = query.eq('order_number', identifier);
    } else {
      query = query.eq('id', identifier);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    return data;
  },

  async updateStatusByOrderNumber(orderNumber, status) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .update({ status: status })
      .eq('order_number', orderNumber)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

export { OrdersModel };