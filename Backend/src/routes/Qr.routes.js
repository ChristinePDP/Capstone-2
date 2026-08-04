import express from 'express';
import { handleScanQR, handleUpdateStatus } from '../controller/Qr.controller.js';

const router = express.Router();

router.get('/scan/:orderNumber', handleScanQR);
router.patch('/update-status/:orderNumber', handleUpdateStatus);

export default router;