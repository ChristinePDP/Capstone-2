import { runDailyAnalyticsJob } from '../jobs/dailyAnalyticsJob.js';

let isRunning = false;

export const runDailyAnalyticsJobHandler = async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ ok: false, error: 'Job already running' });
  }

  isRunning = true;
  const startedAt = new Date().toISOString();

  try {
    await runDailyAnalyticsJob();
    res.json({ ok: true, startedAt, finishedAt: new Date().toISOString() });
  } catch (error) {
    console.error('--- Cron trigger FAILED ---', error);
    res.status(500).json({ ok: false, error: error.message });
  } finally {
    isRunning = false;
  }
};