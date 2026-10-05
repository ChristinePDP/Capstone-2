import { Router } from 'express';
import multer from 'multer';
import { authMiddlewareJwt } from '../middleware/auth.middleware.js';
import { getPaymentSettingsController, uploadPaymentQr, removePaymentQr } from '../controller/settings.controller.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/payment', getPaymentSettingsController);
router.post('/payment/qr-code', authMiddlewareJwt, upload.single('image'), uploadPaymentQr);
router.delete('/payment/qr-code', authMiddlewareJwt, removePaymentQr);

export default router;
