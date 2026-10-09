import { getSupabase } from '../config/supabase.js';

const PreOrderCapacityModel = {
  async reserve(reservationId, pickupDate, items, expiresAt = null) {
    const { data, error } = await getSupabase().rpc('reserve_preorder_capacity', {
      p_reservation_id: reservationId,
      p_pickup_date: pickupDate,
      p_items: items.map(item => ({ product_id: item.product_id, quantity: Number(item.quantity || 0) })),
      p_expires_at: expiresAt,
    });
    if (error) {
      const capacityError = new Error(error.message || 'Pre-order capacity is unavailable.');
      capacityError.code = 'PREORDER_CAPACITY';
      throw capacityError;
    }
    return data;
  },

  async release(reservationId) {
    const { error } = await getSupabase().rpc('release_preorder_capacity', {
      p_reservation_id: reservationId,
    });
    if (error) throw error;
  },

  async linkToOrder(reservationId, orderId) {
    const { error } = await getSupabase().rpc('link_preorder_capacity_to_order', {
      p_reservation_id: reservationId,
      p_order_id: orderId,
    });
    if (error) throw error;
  },
};

export { PreOrderCapacityModel };
