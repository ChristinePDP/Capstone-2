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