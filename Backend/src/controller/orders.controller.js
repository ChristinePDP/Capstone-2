// backend/controllers/orders.controller.js
import { OrdersService } from '../services/orders.service.js';

const OrdersController = {
  // GET /api/inventory/orders
  async getAllOrders(req, res, next) {
    try {
      const orders = await OrdersService.getAllOrders();
      return res.status(200).json({ success: true, data: orders });
    } catch (err) {
      next(err);
    }
  },

  // GET /api/inventory/orders/:id
  async getOrderById(req, res, next) {
    try {
      const { id } = req.params;
      const order = await OrdersService.getOrderById(id);
      return res.status(200).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  },

  async getPaymentProof(req, res, next) {
    try {
      const image = await OrdersService.getPaymentProof(req.params.id);
      const buffer = Buffer.isBuffer(image)
        ? image
        : Buffer.from(await image.arrayBuffer());
      res.set('Content-Type', image.type || 'application/octet-stream');
      res.set('Cache-Control', 'private, no-store');
      return res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  },

  async getPendingCelebrationMaterialRestock(_req, res, next) {
    try {
      const materials = await OrdersService.getPendingCelebrationMaterialRestock();
      return res.status(200).json({ success: true, data: materials });
    } catch (err) {
      next(err);
    }
  },

  // PATCH /api/inventory/orders/:id/status
  // Body: { "status": "Completed" }
  async updateOrderStatus(req, res, next) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!status) {
        return res.status(400).json({ success: false, message: 'status is required' });
      }

      const updatedOrder = await OrdersService.changeOrderStatus(id, status);
      return res.status(200).json({ success: true, data: updatedOrder });
    } catch (err) {
      next(err);
    }
  },

  async acceptPayment(req, res, next) {
    try {
      const order = await OrdersService.verifyPayment(req.params.id, true, req.user?.id);
      if (!order) return res.status(409).json({ success: false, message: 'Order is no longer pending verification.' });
      return res.json({ success: true, data: order });
    } catch (err) { next(err); }
  },

  async rejectPayment(req, res, next) {
    try {
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
      const order = await OrdersService.verifyPayment(req.params.id, false, req.user?.id, reason);
      if (!order) return res.status(409).json({ success: false, message: 'Order is no longer pending verification.' });
      return res.json({ success: true, data: order });
    } catch (err) { next(err); }
  },
};

export { OrdersController };