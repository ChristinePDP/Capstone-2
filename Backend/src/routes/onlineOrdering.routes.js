import express from 'express';
import multer from 'multer';
import { 
  getMenuProducts, 
  createPaymongoLink, 
  uploadInspiration, 
  placeOrder,
  markOrderCompleted 
} from '../controller/onlineOrdering.controller.js';

const router = express.Router();

// I-set up ang multer para i-store ang file sa memory bago ipasa sa Supabase
const upload = multer({ storage: multer.memoryStorage() });

router.get('/products', getMenuProducts);
router.post('/paymongo-checkout', createPaymongoLink);

// Bagong Endpoints:
router.post('/upload-inspiration', upload.single('image'), uploadInspiration);
router.post('/place-order', placeOrder);

router.patch('/complete/:orderId', markOrderCompleted);

export default router;