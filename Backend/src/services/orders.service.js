// backend/services/orders.service.js
import { OrdersModel } from '../model/orders.model.js';
import { OrderItemsModel } from '../model/orderItems.model.js'; // IN-IMPORT NATIN ITO
import { ProductModel } from '../model/product.model.js';       // IN-IMPORT NATIN ITO

// Pinapayagang statuses lang — ito yung ginagamit talaga ng
// AllOrdersPage.jsx (ORDER_STATUSES filter pills + nextStatus map),
// kaya dito rin natin itinugma.
const ALLOWED_STATUSES = ['Confirmed', 'Ready', 'Completed', 'Cancelled'];

// Same priority rule gaya ng ginagamit sa onlineOrdering.services.js
// (getStockLimitField) — kailangan itong i-tugma dito dahil ITO ang
// dinadaanan kapag ang order status ay in-i-update mula sa ADMIN "All
// Orders" page, hiwalay sa customer-facing na completeOrderAndDeductStock.
// Kung may laman (di null, > 0) ang `daily_limit`, ITO ang babawasan
// (Pre-order "slots"); kung wala, sa `stock_quantity` babawas (Pick-up
// Today na produced stock).
const getStockLimitField = (product) => {
  const hasDailyLimit = product?.daily_limit !== null
    && product?.daily_limit !== undefined
    && Number(product.daily_limit) > 0;
  return hasDailyLimit ? 'daily_limit' : 'stock_quantity';
};

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

    // --- BAGONG DEDUCTION LOGIC KAPAG NAGING 'Completed' ---
    if (status === 'Completed') {
      try {
        const items = await OrderItemsModel.findByOrderId(id);
        
        if (items && items.length > 0) {
          for (const item of items) {
            if (!item.product_id) continue;
            
            const product = await ProductModel.findById(item.product_id);
            
            if (product) {
              const limitField = getStockLimitField(product);
              const currentValue = Number(product[limitField]) || 0;
              const newValue = Math.max(0, currentValue - item.quantity);
              await ProductModel.update(item.product_id, { [limitField]: newValue });
              console.log(`[ADMIN SERVICE] Deducted ${item.quantity} from ${product.name}'s ${limitField}. New value: ${newValue}`);
            }
          }
        }
      } catch (err) {
        console.error(`[ADMIN SERVICE] Error deducting stock for order ${id}:`, err);
      }
    }
    // --------------------------------------------------------

    return updated;
  },
};

export { OrdersService, ALLOWED_STATUSES };