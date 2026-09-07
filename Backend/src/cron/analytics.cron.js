import cron from 'node-cron';
import { runDailyAnalyticsJob } from '../jobs/dailyAnalyticsJob.js';

export const setupAnalyticsCron = (scheduler = cron) => {
  scheduler.schedule(
    '0 0 * * *',
    async () => {
      try {
        await runDailyAnalyticsJob();
      } catch (error) {
        console.error('--- Cron Job Failed: ---', error);
      }
    },
    { timezone: 'Asia/Manila' }
  );
};