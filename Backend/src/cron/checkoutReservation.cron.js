import cron from 'node-cron';
import { CheckoutReservationModel } from '../model/checkoutReservation.model.js';

export const setupCheckoutReservationCron = (scheduler = cron) => scheduler.schedule('0 0 1 * *', async () => {
  try {
    await CheckoutReservationModel.expire();
  } catch (error) {
    console.error('[CHECKOUT RESERVATION] Expiration job failed:', error);
  }
}, {
  name: 'monthly-checkout-reservation-cleanup',
  timezone: 'Asia/Manila',
  noOverlap: true,
});
