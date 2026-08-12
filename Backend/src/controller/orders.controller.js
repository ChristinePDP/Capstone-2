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
};

export { OrdersController };