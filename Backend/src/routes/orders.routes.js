// backend/routes/orders.routes.js
import { Router } from 'express';
import { OrdersController } from '../controller/orders.controller.js';
import { authMiddlewareJwt } from '../middleware/auth.middleware.js';

const router = Router();

router.use(authMiddlewareJwt);

// GET  /api/inventory/orders          -> lahat ng orders
router.get('/', OrdersController.getAllOrders);

router.get('/pending-celebration-materials', OrdersController.getPendingCelebrationMaterialRestock);

// GET  /api/inventory/orders/:id      -> isang order (with customer + items)
router.get('/:id', OrdersController.getOrderById);

// PATCH /api/inventory/orders/:id/status  -> i-edit ang status
router.patch('/:id/status', OrdersController.updateOrderStatus);

export default router;