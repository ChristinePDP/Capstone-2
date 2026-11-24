import { Router } from 'express';
import { getPosProducts, createPosOrder } from '../controller/pos.controller.js';
import { authMiddlewareJwt, requireRole } from '../middleware/auth.middleware.js';

const router = Router();

// Endpoint to fetch products for the POS menu
router.get('/products', authMiddlewareJwt, requireRole('cashier'), getPosProducts);

// Endpoint to process a completed POS transaction
router.post('/walk-in_orders', authMiddlewareJwt, requireRole('cashier'), createPosOrder);

export default router;
