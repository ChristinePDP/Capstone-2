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

// Extra buckets to try kapag "Object not found" sa default bucket. Pwedeng
// i-set via env: PAYMENT_PROOF_FALLBACK_BUCKETS=bucket-a,bucket-b
const ENV_FALLBACK_BUCKETS = (process.env.PAYMENT_PROOF_FALLBACK_BUCKETS || '')
  .split(',')
  .map((b) => b.trim())
  .filter(Boolean);

// Cache ng lahat ng bucket names (listBuckets) para hindi paulit-ulit ang call.
let bucketNamesCache = { at: 0, names: [] };
const BUCKET_CACHE_MS = 5 * 60 * 1000;

const getAllBucketNames = async () => {
  if (Date.now() - bucketNamesCache.at < BUCKET_CACHE_MS) return bucketNamesCache.names;
  try {
    const { data, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    bucketNamesCache = { at: Date.now(), names: (data || []).map((b) => b.name) };
    // Kapag service role ang gamit pero empty ang buckets, kakaiba — i-log.
    if (bucketNamesCache.names.length === 0) {
      console.error(
        `[STORAGE] listBuckets() returned 0 buckets (usingServiceRole=${usingServiceRole}). ` +
        'Malamang limitado ang key na ginagamit ng backend.'
      );
    }
  } catch (err) {
    console.error('Failed to list storage buckets:', err.message);
    bucketNamesCache = { at: Date.now(), names: [] };
  }
  return bucketNamesCache.names;
};

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

const trySign = async (bucket, path) => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60);
  if (!error && data?.signedUrl) return { url: data.signedUrl };

  // Fallback para sa PUBLIC buckets: kapag pumalya ang signing (hal. limitado
  // ang key), subukan ang public URL at i-verify na talagang umiiral ang file.
  try {
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
    if (pub?.publicUrl) {
      const res = await fetch(pub.publicUrl, { method: 'HEAD' });
      if (res.ok) return { url: pub.publicUrl };
    }
  } catch {
    // Ignore — babalik sa error sa ibaba.
  }

  return { error: error || new Error('Supabase did not return a signed URL') };
};

const withPaymentProofUrl = async (order) => {
  const candidates = [
    parseStoredProofValue(order?.proof_of_payment_path),
    parseStoredProofValue(order?.proof_of_payment_url),
  ].filter((c, i, all) => c && c.path && all.findIndex((x) => x.path === c.path && x.bucket === c.bucket) === i);

  if (candidates.length === 0) return order;

  let lastError = null;
  const tried = [];

  for (const { bucket: hintedBucket, path } of candidates) {
    // Priority: bucket mula sa URL -> default -> env fallbacks.
    const buckets = [hintedBucket, PAYMENT_PROOF_BUCKET, ...ENV_FALLBACK_BUCKETS]
      .filter((b, i, all) => b && all.indexOf(b) === i);

    for (const bucket of buckets) {
      tried.push(`${bucket}/${path}`);
      const result = await trySign(bucket, path);
      if (result.url) return { ...order, proof_of_payment_url: result.url };
      lastError = result.error;
    }

    // Last resort: hanapin sa lahat ng iba pang bucket.
    const allBuckets = await getAllBucketNames();
    for (const bucket of allBuckets) {
      if (buckets.includes(bucket)) continue;
      tried.push(`${bucket}/${path}`);
      const result = await trySign(bucket, path);
      if (result.url) return { ...order, proof_of_payment_url: result.url };
      lastError = result.error;
    }
  }

  console.error(
    `Failed to create payment proof URL for order ${order.id} (tried: ${tried.join(', ')}):`,
    lastError?.message
  );
  return { ...order, proof_of_payment_url: null };
};

const OrdersService = {
  /**
   * Kunin lahat ng orders KASAMA ang customer info at order items —
   * ginagamit ito ng "All Orders" admin page (table + search + modal).
   */
  async getAllOrders() {
    const orders = await OrdersModel.findAllWithDetails();
    return Promise.all((orders || []).map(withPaymentProofUrl));
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
    return withPaymentProofUrl(order);
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
    if (order.status !== 'Pending Verification' || !order.proof_of_payment_url) {
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