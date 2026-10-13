import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit'; // 1. I-import ang rateLimit

import { 
  getMenuProducts, 
  getPreOrderAvailability,
  uploadInspiration, 
  placeOrder,
  markOrderCompleted,
  getPublicConfig,
  placeManualPaymentOrder,
  reserveCheckout
} from '../controller/onlineOrdering.controller.js';

const router = express.Router();

// I-set up ang multer
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// 2. I-setup ang Rate Limiter (Max 5 requests every 10 minutes per IP)
const checkoutLimiter = rateLimit({
  windowMs: 3 * 60 * 1000, // 10 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { 
    success: false, 
    message: 'Masyadong maraming checkout attempts. Subukan ulit pagkalipas ng 10 minuto.' 
  },
  standardHeaders: true, // I-return ang rate limit info sa `RateLimit-*` headers
  legacyHeaders: false, // I-disable ang `X-RateLimit-*` headers
});

// A normal online checkout calls the reservation endpoint and then submits
// proof. Keep its availability checks from consuming the proof-upload quota.
const reservationLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many availability checks. Please wait a moment and try again.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/products', getMenuProducts);
router.post('/preorder-availability', getPreOrderAvailability);
router.post('/reserve-checkout', reservationLimiter, reserveCheckout);
router.get('/config', getPublicConfig);

router.post('/upload-inspiration', upload.single('image'), uploadInspiration);
router.post('/manual-payment-order', checkoutLimiter, upload.single('proof'), placeManualPaymentOrder);
router.post('/place-order', placeOrder);
router.patch('/complete/:orderId', markOrderCompleted);

export default router;
