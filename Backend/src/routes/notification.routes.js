// backend/src/routes/notification.routes.js
import { Router } from 'express';
import {
  listNotifications,
  listUnreadNotifications,
  markRead,
  markAllRead,
  removeNotification
} from '../controller/notification.controller.js';

const router = Router();

router.get('/', listNotifications);
router.get('/unread', listUnreadNotifications);
router.patch('/:id/read', markRead);
router.patch('/read-all', markAllRead);
router.delete('/:id', removeNotification);

export default router;