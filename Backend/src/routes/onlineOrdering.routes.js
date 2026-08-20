import express from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit'; // 1. I-import ang rateLimit

import { 
  getMenuProducts, 
  createPaymongoLink, 
  uploadInspiration, 
  placeOrder,
  markOrderCompleted,
  getPublicConfig,
  getPendingOrderStatus
} from '../controller/onlineOrdering.controller.js';

const router = express.Router();

// I-set up ang multer
const upload = multer({ storage: multer.memoryStorage() });

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

router.get('/products', getMenuProducts);
router.get('/config', getPublicConfig);

// 3. Ilagay ang `checkoutLimiter` bilang middleware bago tawagin ang controller
router.post('/paymongo-checkout', checkoutLimiter, createPaymongoLink);

router.post('/upload-inspiration', upload.single('image'), uploadInspiration);
router.post('/place-order', placeOrder);
router.patch('/complete/:orderId', markOrderCompleted);
router.get('/pending-order/:id', getPendingOrderStatus);

export default router;