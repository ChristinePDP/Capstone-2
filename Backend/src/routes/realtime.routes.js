import { Router } from 'express';
import { authMiddlewareJwt, requireRole } from '../middleware/auth.middleware.js';
import { addRealtimeClient } from '../services/realtime.service.js';

const router = Router();

router.get('/events', authMiddlewareJwt, requireRole('admin'), (req, res) => {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  addRealtimeClient(res);
});

export default router;
