import express from 'express';
import { handleScanQR, handleUpdateStatus } from '../controller/Qr.controller.js';
import { authMiddlewareJwt, requireRole } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddlewareJwt);
router.use(requireRole('admin'));
router.get('/scan/:orderNumber', handleScanQR);
router.patch('/update-status/:orderNumber', handleUpdateStatus);

export default router;