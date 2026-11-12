import { runDailyAnalyticsJob } from '../jobs/dailyAnalyticsJob.js';
import { cleanExpiredStorageObjects } from '../cron/storageRetention.cron.js';
import { CheckoutReservationModel } from '../model/checkoutReservation.model.js';

let isRunning = false;

export const runDailyAnalyticsJobHandler = async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ ok: false, error: 'Job already running' });
  }

  isRunning = true;
  const startedAt = new Date().toISOString();
  let expiredReservations = null;
  let reservationError = null;
  let analyticsError = null;
  let storageCleanup = null;
  let storageCleanupError = null;

  try {
    expiredReservations = await CheckoutReservationModel.expire();
    console.info(`[CHECKOUT RESERVATION] Expired ${expiredReservations} stale reservation(s).`);
  } catch (error) {
    console.error('[CHECKOUT RESERVATION] Expiration job failed:', error);
    reservationError = error;
  }

  try {
    await runDailyAnalyticsJob();
  } catch (error) {
    console.error('--- Cron trigger FAILED ---', error);
    analyticsError = error;
  }

  try {
    storageCleanup = await cleanExpiredStorageObjects();
    console.info(`[STORAGE RETENTION] 90-day cleanup complete: ${JSON.stringify(storageCleanup)}`);
  } catch (error) {
    console.error('[STORAGE RETENTION] Cleanup job failed:', error);
    storageCleanupError = error;
  }

  isRunning = false;
  const errors = [reservationError, analyticsError, storageCleanupError].filter(Boolean).map((error) => error.message);
  res.status(errors.length ? 500 : 200).json({
    ok: errors.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    expiredReservations,
    storageCleanup,
    ...(errors.length ? { errors } : {}),
  });
};
