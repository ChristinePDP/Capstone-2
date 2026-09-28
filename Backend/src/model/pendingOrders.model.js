import { getSupabase } from '../config/supabase.js';

const TABLE = 'pending_orders';

const PendingOrdersModel = {
  async create(payload, amountDueNow) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert([{ payload, amount_due_now: amountDueNow, status: 'pending' }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async findById(id) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  },

  async updateSession(id, checkoutSessionId) {
    const { error } = await getSupabase()
      .from(TABLE)
      .update({ paymongo_checkout_session_id: checkoutSessionId })
      .eq('id', id);

    if (error) throw error;
  },

  async markAsPaid(id, paymentId, resultOrder) {
    const { error } = await getSupabase()
      .from(TABLE)
      .update({
        status: 'paid',
        paymongo_payment_id: paymentId,
        result_order_id: resultOrder.id,
        result_order_number: resultOrder.order_number,
        consumed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) throw error;
  },

  // ATOMIC CLAIM — para hindi madoble ang order kapag sabay na tumakbo ang
  // webhook at ang status-poll fallback. Iisang caller lang ang makakakuha
  // (yung unang nakapag-set ng `consumed_at` habang `pending` pa at wala
  // pang consumed_at). Ang iba ay makakatanggap ng null. Sinadyang
  // `consumed_at` ang gamit (hindi bagong status value) para hindi tamaan
  // ng anumang CHECK constraint sa `status` column.
  async claim(id) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .is('consumed_at', null)
      .select();

    if (error) throw error;
    return Array.isArray(data) && data.length > 0 ? data[0] : null;
  },

  // Ibalik ang claim kapag pumalya ang paggawa ng order, para makapag-retry
  // ang susunod na webhook/poll.
  async releaseClaim(id) {
    const { error } = await getSupabase()
      .from(TABLE)
      .update({ consumed_at: null })
      .eq('id', id)
      .eq('status', 'pending');

    if (error) throw error;
  },

  async getActivePending() {
    // Kunin lang ang pending orders sa loob ng huling 30 mins para hindi 
    // ma-stuck ang stock kung in-abandon ng customer ang PayMongo checkout nila.
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('payload')
      .eq('status', 'pending')
      .gte('created_at', thirtyMinsAgo);

    if (error) throw error;
    return data;
  },

  async deleteExpired(timeLimitISO) {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .delete()
      .eq('status', 'pending')
      .lt('created_at', timeLimitISO);

    if (error) throw error;
    return data;
  }
};

export { PendingOrdersModel };