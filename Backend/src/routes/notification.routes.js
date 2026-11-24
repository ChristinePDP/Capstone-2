// backend/src/routes/notification.routes.js
import { Router } from 'express';
import {
  listNotifications,
  listUnreadNotifications,
  markRead,
  markAllRead,
  removeNotification
} from '../controller/notification.controller.js';
import { authMiddlewareJwt, requireRole } from '../middleware/auth.middleware.js';

const router = Router();
router.use(authMiddlewareJwt);
router.use(requireRole('admin'));

router.get('/', listNotifications);
router.get('/unread', listUnreadNotifications);
router.patch('/:id/read', markRead);
router.patch('/read-all', markAllRead);
router.delete('/:id', removeNotification);

export default router;