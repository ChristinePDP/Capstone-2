import cron from 'node-cron';
import { CheckoutReservationModel } from '../model/checkoutReservation.model.js';

export const setupCheckoutReservationCron = (scheduler = cron) => scheduler.schedule('* * * * *', async () => {
  try {
    await CheckoutReservationModel.expire();
  } catch (error) {
    console.error('[CHECKOUT RESERVATION] Expiration job failed:', error);
  }
}, { timezone: 'Asia/Manila' });
