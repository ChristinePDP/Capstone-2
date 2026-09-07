import express from 'express';
import { runDailyAnalyticsJobHandler } from '../controller/cron.controller.js';

const router = express.Router();

const checkCronSecret = (req, res, next) => {
  const provided = req.headers['x-cron-secret'];
  if (!provided || provided !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

router.post('/run-daily', checkCronSecret, runDailyAnalyticsJobHandler);

export default router;