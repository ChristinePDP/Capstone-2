// backend/services/orders.service.js
import { OrdersModel } from '../model/orders.model.js';
import { OrderItemsModel } from '../model/orderItems.model.js';
import { ProductModel } from '../model/product.model.js';
import { MaterialModel } from '../model/material.model.js';

// Pinapayagang statuses lang — ito yung ginagamit talaga ng
// AllOrdersPage.jsx (ORDER_STATUSES filter pills + nextStatus map),
// kaya dito rin natin itinugma.
const ALLOWED_STATUSES = ['Confirmed', 'Ready', 'Completed', 'Cancelled'];

// Same priority rule gaya ng ginagamit sa onlineOrdering.services.js at
// pos.service.js (getStockLimitField) — kailangan itong i-tugma dito dahil
// ITO ang dinadaanan kapag ang order status ay in-i-update mula sa ADMIN
// "All Orders" page, hiwalay sa customer-facing na completeOrderAndDeductStock
// at sa POS pickup confirmation.
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

  async getPendingCelebrationMaterialRestock() {
    const [orders, productsResult, materialsResult] = await Promise.all([
      OrdersModel.findConfirmedPreOrdersWithItems(),
      ProductModel.findAll({ activeOnly: false }),
      MaterialModel.findAll(),
    ]);

    const productsById = new Map((productsResult.data || []).map(product => [product.id, product]));
    const materialsByProductId = new Map(
      (materialsResult.data || [])
        .filter(material => material.product_id)
        .map(material => [material.product_id, material])
    );
    const requestedByMaterialId = new Map();

    for (const order of orders || []) {
      for (const item of order.order_items || []) {
        if (item.bundle_id) continue;

        const product = productsById.get(item.product_id);
        const material = materialsByProductId.get(item.product_id);
        if (product?.category !== 'Celebration Material' || !material) continue;

        requestedByMaterialId.set(
          material.id,
          (requestedByMaterialId.get(material.id) || 0) + Number(item.quantity || 0)
        );
      }
    }

    return [...requestedByMaterialId.entries()]
      .map(([materialId, requested]) => {
        const material = (materialsResult.data || []).find(item => item.id === materialId);
        const neededToRestock = Math.max(0, requested - Number(material?.stock_quantity || 0));
        return {
          id: materialId,
          name: material?.name,
          unit: material?.unit,
          neededToRestock,
        };
      })
      .filter(item => item.neededToRestock > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
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

    // FIX (idempotency guard): kung "Completed" na ang order BAGO pa man
    // ito i-update ulit (hal. na-double click ang status dropdown, o
    // nag-scan nang dalawang beses ang QrScanner na naka-embed sa
    // Orders.jsx), huwag nang ulitin ang balance settlement at stock
    // deduction sa ibaba — hahantong lang ito sa DALAWANG BESES na
    // pagbawas ng stock (at posibleng maling amount_paid) para sa
    // parehong order.
    if (status === 'Completed') {
      const existingOrder = await OrdersModel.findById(id);
      if (!existingOrder) {
        const err = new Error('Order not found');
        err.status = 404;
        throw err;
      }
      if (existingOrder.status === 'Completed') {
        return existingOrder;
      }
    }

    const updated = await OrdersModel.updateStatus(id, status);
    let finalOrder = updated;

    if (status === 'Ready' && existingOrder.status !== 'Ready' && updated.order_type === 'Pre-Order') {
      const items = await OrderItemsModel.findByOrderId(id);

      for (const item of items || []) {
        if (item.bundle_id) continue;
        const product = await ProductModel.findById(item.product_id);
        if (product?.category !== 'Celebration Material') continue;

        const materialResult = await MaterialModel.findByProductId(item.product_id);
        if (materialResult.error) throw materialResult.error;
        if (materialResult.data) {
          await MaterialModel.deductById(materialResult.data.id, item.quantity);
        }
      }
    }

    // --- DEDUCTION + BALANCE SETTLEMENT LOGIC KAPAG NAGING 'Completed' ---
    if (status === 'Completed') {
      // Settle any outstanding deposit balance — same rule as
      // onlineOrdering.service.js#completeOrderAndDeductStock at
      // pos.service.js#confirmPosOrderPickup/#createPosOrder. Kapag
      // "Completed" ang isang deposit order dito sa admin "All Orders"
      // page, dapat itong mag-reflect ng buong grand_total bilang
      // amount_paid (0 na ang balance) — natanggap na sa pickup ang
      // natitirang bayad.
      if (Number(updated.balance) > 0) {
        try {
          finalOrder = await OrdersModel.updatePayment(id, {
            amount_paid: updated.grand_total,
            balance: 0,
            // FIX: dapat din ma-update ang payment_type papuntang 'full' —
            // dati'y amount_paid/balance lang ang na-a-update, kaya
            // nananatiling nagpapakita ng "Deposit: ₱X" ang Orders.jsx
            // admin page kahit fully paid na talaga ang order.
            payment_type: 'full',
          });
          console.log(`[ADMIN SERVICE] Settled balance for order ${id}. amount_paid is now:`, finalOrder.amount_paid);
        } catch (settleError) {
          console.error(`[ADMIN SERVICE] Error settling balance for order ${id}:`, settleError);
        }
      }

      try {
        const items = await OrderItemsModel.findByOrderId(id);

        if (items && items.length > 0) {
          for (const item of items) {
            if (!item.product_id) continue;

            const product = await ProductModel.findById(item.product_id);

            const materialResult = await MaterialModel.findByProductId(item.product_id);
            if (materialResult.error) throw materialResult.error;
            if (materialResult.data) {
              if (updated.order_type === 'Pre-Order' && existingOrder.status === 'Ready' && !item.bundle_id) continue;
              await MaterialModel.deductById(materialResult.data.id, item.quantity);
              console.log(`[ADMIN SERVICE] Deducted ${item.quantity} from ${materialResult.data.name}'s celebration material stock.`);
              continue;
            }

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

    return finalOrder;
  },
};

export { OrdersService, ALLOWED_STATUSES };