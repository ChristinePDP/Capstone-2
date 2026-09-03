// Pigil ito para hindi kahit sino ang makapag-trigger ng /api/internal/run-analytics.
// CRON_SECRET must be the SAME value sa dalawang lugar sa Render:
//   1. Web Service env var (para dito i-verify)
//   2. Cron Job env var / command (para dito ipadala sa header)
export const verifyCronSecret = (req, res, next) => {
  const secret = req.headers['x-cron-secret'];

  if (!process.env.CRON_SECRET) {
    console.error('CRON_SECRET is not set on the server.');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (!secret || secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};