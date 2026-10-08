// backend/services/orders.service.js
import { OrdersModel } from '../model/orders.model.js';
import { OrderItemsModel } from '../model/orderItems.model.js';
import { ProductModel } from '../model/product.model.js';
import { MaterialModel } from '../model/material.model.js';
import { supabase, usingServiceRole } from '../config/supabase.js';

// Pinapayagang statuses lang — ito yung ginagamit talaga ng
// AllOrdersPage.jsx (ORDER_STATUSES filter pills + nextStatus map),
// kaya dito rin natin itinugma.
const ALLOWED_STATUSES = ['Pending Verification', 'Confirmed', 'Ready', 'Completed', 'Cancelled'];

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

const PAYMENT_PROOF_BUCKET = 'payment-assets';

// Ang nakaimbak sa DB ay pwedeng (a) bucket-relative path, o (b) buong
// Supabase URL. Kapag URL, kunin din ang BUCKET mula rito — dati ay
// laging ipinapalagay na 'payment-assets', kaya "Object not found" kapag
// ibang bucket ang pinag-upload-an.
const parseStoredProofValue = (value) => {
  if (!value) return null;

  const rawValue = String(value).trim();
  if (!rawValue) return null;

  try {
    const parsedUrl = new URL(rawValue);
    const match = parsedUrl.pathname.match(
      /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/
    );
    if (match) {
      return { bucket: match[1], path: decodeURIComponent(match[2]) };
    }
  } catch {
    // The database normally stores a bucket-relative path, not a URL.
  }

  let path = rawValue.replace(/^\/+/, '').split('?')[0];
  // Kung may nakadikit na bucket name sa unahan (hal. "payment-assets/proof_of_transaction/x.png")
  if (path.startsWith(`${PAYMENT_PROOF_BUCKET}/`)) {
    path = path.slice(PAYMENT_PROOF_BUCKET.length + 1);
  }
  return { bucket: null, path };
};

const getStoredPaymentProofPath = (order) => {
  const candidates = [
    parseStoredProofValue(order?.proof_of_payment_path),
    parseStoredProofValue(order?.proof_of_payment_url),
  ].filter((candidate, index, all) => (
    candidate?.path
    && all.findIndex((item) => item.path === candidate.path && item.bucket === candidate.bucket) === index
  ));

  const candidate = candidates.find(({ bucket }) => !bucket || bucket === PAYMENT_PROOF_BUCKET);
  const path = candidate?.path;

  if (!path || !path.startsWith('proof_of_transaction/') || path.includes('..')) {
    return null;
  }

  return path;
};

const OrdersService = {
  /**
   * Kunin lahat ng orders KASAMA ang customer info at order items —
   * ginagamit ito ng "All Orders" admin page (table + search + modal).
   */
  async getAllOrders() {
    const orders = await OrdersModel.findAllWithDetails();
    return orders || [];
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

  async getPaymentProofUrl(id) {
    if (!id) {
      const error = new Error('Order id is required');
      error.status = 400;
      throw error;
    }

    const order = await OrdersModel.findById(id);
    if (!order) {
      const error = new Error('Order not found');
      error.status = 404;
      throw error;
    }

    const path = getStoredPaymentProofPath(order);
    if (!path) {
      const error = new Error('Payment proof is unavailable');
      error.status = 404;
      throw error;
    }

    if (!usingServiceRole) {
      const error = new Error('Payment proof storage is not configured for private access');
      error.status = 503;
      throw error;
    }

    const { data, error } = await supabase.storage
      .from(PAYMENT_PROOF_BUCKET)
      .createSignedUrl(path, 5 * 60);

    if (error || !data?.signedUrl) {
      console.error('[PAYMENT PROOF] Failed to create signed URL', {
        orderId: id,
        bucket: PAYMENT_PROOF_BUCKET,
        path,
        message: error?.message,
        status: error?.status,
        statusCode: error?.statusCode,
      });
      const storageError = new Error(error?.message || 'Payment proof object not found');
      storageError.status = 404;
      throw storageError;
    }

    return data.signedUrl;
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

    // Kinukuha ONCE bago mag-branch sa status para available sa LAHAT ng
    // gumagamit nito sa ibaba (iwas "existingOrder is not defined" at iwas
    // duplicate na declaration/DB call).
    const existingOrder = await OrdersModel.findById(id);
    if (!existingOrder) {
      const err = new Error('Order not found');
      err.status = 404;
      throw err;
    }
    if (existingOrder.status === 'Pending Verification' && status !== 'Pending Verification' && status !== 'Cancelled') {
      const err = new Error('Pending payment must be accepted or rejected before fulfillment.');
      err.status = 409;
      throw err;
    }

    // Idempotency guard: kung "Completed" na ang order BAGO pa man ito
    // i-update ulit (hal. na-double click ang status dropdown, o nag-scan
    // nang dalawang beses ang QrScanner), huwag nang ulitin ang balance
    // settlement at stock deduction — hahantong lang ito sa DALAWANG BESES
    // na pagbawas ng stock (at posibleng maling amount_paid).
    if (status === 'Completed' && existingOrder.status === 'Completed') {
      return existingOrder;
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
            // Dapat ding ma-update ang payment_type papuntang 'full' para
            // hindi manatiling "Deposit: ₱X" sa Orders.jsx admin page.
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

  async verifyPayment(id, accepted, adminId, reason = null) {
    const order = await OrdersModel.findById(id);
    if (!order) {
      const err = new Error('Order not found');
      err.status = 404;
      throw err;
    }
    if (order.status !== 'Pending Verification' || !getStoredPaymentProofPath(order)) {
      return null;
    }
    return OrdersModel.updatePaymentVerification(
      id,
      accepted ? 'Accepted' : 'Rejected',
      adminId,
      accepted ? null : reason
    );
  },
};

export { OrdersService, ALLOWED_STATUSES };