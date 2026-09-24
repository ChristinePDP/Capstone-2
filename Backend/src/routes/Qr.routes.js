import express from 'express';
import { handleScanQR, handleUpdateStatus } from '../controller/Qr.controller.js';
import { authMiddlewareJwt } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(authMiddlewareJwt);
router.get('/scan/:orderNumber', handleScanQR);
router.patch('/update-status/:orderNumber', handleUpdateStatus);

export default router;