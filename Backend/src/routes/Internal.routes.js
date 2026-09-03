import express from 'express';
import { runAnalyticsRefresh } from '../cron/analytics.cron.js';
import { verifyCronSecret } from '../middleware/verifyCronSecret.js';

const router = express.Router();

// Tatawagin ito ng Render Cron Job, hindi ng users. Protected by CRON_SECRET.
router.post('/run-analytics', verifyCronSecret, async (req, res, next) => {
  try {
    const result = await runAnalyticsRefresh();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;