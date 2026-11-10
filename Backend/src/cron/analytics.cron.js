import cron from 'node-cron';
import { runDailyAnalyticsJob } from '../jobs/dailyAnalyticsJob.js';

// ISANG cron lang. Sunud-sunod sa loob ng job: Forecasts -> 5 min -> Insights.
let running = false;

export const setupAnalyticsCron = (scheduler = cron) => {
  scheduler.schedule(
    '0 0 * * *',
    async () => {
      if (running) {
        console.warn('[AnalyticsCron] Previous run is still in progress — skipped.');
        return;
      }
      running = true;
      try {
        await runDailyAnalyticsJob();
      } catch (error) {
        console.error('--- Cron Job Failed: ---', error);
      } finally {
        running = false;
      }
    },
    { timezone: 'Asia/Manila' }
  );
};