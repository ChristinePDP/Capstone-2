import { getSupabase } from '../config/supabase.js';

const rpc = async (name, args) => {
  const { data, error } = await getSupabase().rpc(name, args);
  if (error) throw error;
  return data;
};

const CheckoutReservationModel = {
  reserve: (reservationId, orderType, pickupDate, items, expiresAt) => rpc('reserve_checkout_inventory', {
    p_reservation_id: reservationId,
    p_order_type: orderType,
    p_pickup_date: pickupDate,
    p_items: items,
    p_expires_at: expiresAt,
  }),
  async link(reservationId, orderId) {
    try {
      return await rpc('link_checkout_reservation', {
        p_reservation_id: reservationId, p_order_id: orderId,
      });
    } catch (cause) {
      const error = new Error(cause.message || 'Your stock reservation has expired. Please check availability and start payment again.');
      error.code = 'CHECKOUT_RESERVATION';
      error.status = 409;
      throw error;
    }
  },
  release: reservationId => rpc('release_checkout_reservation', { p_reservation_id: reservationId }),
  commit: reservationId => rpc('commit_checkout_reservation', { p_reservation_id: reservationId }),
  verifyPayment: (orderId, accepted, adminId) => rpc('verify_checkout_payment', {
    p_order_id: orderId, p_accepted: accepted, p_admin_id: adminId || null,
  }),
  expire: () => rpc('expire_checkout_reservations', {}),
};

export { CheckoutReservationModel };
