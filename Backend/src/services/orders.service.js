// backend/services/orders.service.js
import { OrdersModel } from '../model/orders.model.js';

// Pinapayagang statuses lang — ito yung ginagamit talaga ng
// AllOrdersPage.jsx (ORDER_STATUSES filter pills + nextStatus map),
// kaya dito rin natin itinugma.
const ALLOWED_STATUSES = ['Confirmed', 'Ready', 'Completed', 'Cancelled'];

const OrdersService = {
  /**
   * Kunin lahat ng orders KASAMA ang customer info at order items —
   * ginagamit ito ng "All Orders" admin page (table + search + modal).
   */
  async getAllOrders() {
    return OrdersModel.findAllWithDetails();
  },

  /**
   * Kunin ang isang order kasama ang customer info at order items.
   */
  async getOrderById(id) {
    if (!id) {
      const err = new Error('Order id is required');
      err.status = 400;
      throw err;
    }
    const order = await OrdersModel.findById(id);
    if (!order) {
      const err = new Error('Order not found');
      err.status = 404;
      throw err;
    }
    return order;
  },

  /**
   * I-validate at i-update ang status ng order.
   * Tumatanggap ng UUID (id) — pwede ring gumawa ng version na by order_number
   * kung ito ang gagamitin sa frontend (see updateStatusByOrderNumber sa model).
   */
  async changeOrderStatus(id, status) {
    if (!id) {
      const err = new Error('Order id is required');
      err.status = 400;
      throw err;
    }
    if (!status || !ALLOWED_STATUSES.includes(status)) {
      const err = new Error(
        `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(', ')}`
      );
      err.status = 400;
      throw err;
    }

    const updated = await OrdersModel.updateStatus(id, status);
    return updated;
  },
};

export { OrdersService, ALLOWED_STATUSES };