import { Router } from 'express';
import { getPosProducts, createPosOrder } from '../controller/pos.controller.js';
import { authMiddlewareJwt } from '../middleware/auth.middleware.js';

const router = Router();

// Endpoint to fetch products for the POS menu
router.get('/products', authMiddlewareJwt, getPosProducts);

// Endpoint to process a completed POS transaction
router.post('/order', authMiddlewareJwt, createPosOrder);

export default router;