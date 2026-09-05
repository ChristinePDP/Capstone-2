// backend/src/services/onlineOrdering.services.js
import { randomUUID } from 'crypto';
import { supabase } from '../config/supabase.js'; 
import { ProductModel } from '../model/product.model.js';
import { OrderItemsModel } from '../model/orderItems.model.js';
import { OrdersModel } from '../model/orders.model.js';
import { CustomersModel } from '../model/customers.model.js';
import { PendingOrdersModel } from '../model/pendingOrders.model.js';
import { notifyNewOrder } from './notification.service.js';
import { getBundleById } from './productAndEvent.service.js';

// --- STOCK / DAILY LIMIT BASIS ---
//
// Ang isang product ay maaaring i-track base sa `daily_limit` (para sa
// Pre-order — ilang "slots" ang pwedeng i-order kada araw) o base sa
// `stock_quantity` (para sa Pick-up Today — kung ilan talaga ang
// naka-ready/produced na stock). Rule (parehong ginagamit sa availability
// computation at sa pag-deduct pagka-Completed na ang order):
//   - Kung may laman (di null at > 0) ang `daily_limit`, ITO ang babasahin,
//     kahit may laman din ang `stock_quantity` (daily_limit wins kapag
//     pareho silang may laman).
//   - Kung wala/0 ang `daily_limit`, babalik sa `stock_quantity`.
// Ginagamit ito kapwa ng Pre-order, Pick-up Today, at "Both" na products —
// hindi lang basta yung may `stock_quantity`.
export const getStockLimitField = (product) => {
  const hasDailyLimit = product?.daily_limit !== null
    && product?.daily_limit !== undefined
    && Number(product.daily_limit) > 0;
  return hasDailyLimit ? 'daily_limit' : 'stock_quantity';
};

export const fetchMenuProducts = async (filters = {}) => {
  let products = []; 
  
  try {
    const result = await ProductModel.findAll(filters);
    
    if (result && Array.isArray(result.data)) {
      products = result.data;
    } else if (Array.isArray(result)) {
      products = result;
    } else {
      products = []; 
    }
  } catch (productError) {
    throw new Error(`Fetch Products Error: ${productError?.message || productError}`);
  }

  let pendingItems = [];
  try {
    const itemsResult = await OrderItemsModel.getPendingItems();
    
    if (itemsResult && Array.isArray(itemsResult.data)) {
      pendingItems = itemsResult.data;
    } else if (Array.isArray(itemsResult)) {
      pendingItems = itemsResult;
    }
  } catch (itemsError) {
    throw new Error(`Fetch Reservations Error: ${itemsError?.message || itemsError}`);
  }
  
  const reservedMap = {};
  
  // 1. Ibawas ang mga nasa 'order_items' table na (Confirmed/Ready - both Pre-Order & Buy Now)
  pendingItems.forEach(item => {
    reservedMap[item.product_id] = (reservedMap[item.product_id] || 0) + item.quantity;
  });

  // 2. Kunin lang ang mga RECENT na nasa PayMongo checkout page (last 30 mins)
  try {
    const pendingPaymongo = await PendingOrdersModel.getActivePending();

    if (pendingPaymongo) {
      pendingPaymongo.forEach(row => {
        const items = row.payload?.items || [];
        items.forEach(item => {
          reservedMap[item.productId] = (reservedMap[item.productId] || 0) + item.quantity;
        });
      });
    }
  } catch (pendingErr) {
    console.error("Error fetching pending PayMongo orders:", pendingErr);
  }

  const productsWithStock = products.map(p => {
    const limitField = getStockLimitField(p);
    const baseStock = Number(p[limitField]) || 0;
    const reserved = reservedMap[p.id] || 0;
    const available = Math.max(0, baseStock - reserved);

    return {
      ...p,
      stock_basis_field: limitField, // 'daily_limit' o 'stock_quantity' — para malaman ng frontend/consumer kung saan galing ang bilang
      available_stock: available
    };
  });

  return productsWithStock;
};

export const getStorageBaseUrl = (bucketName) => {
  const { data } = supabase.storage.from(bucketName).getPublicUrl('');
  return data.publicUrl.replace(/\/$/, '');
};

export const uploadImageToBucket = async (file, bucketName = 'inspiration-images') => {
  const fileExt = file.originalname.split('.').pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });

  if (error) throw new Error(`Supabase Storage Error: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from(bucketName)
    .getPublicUrl(fileName);

  return urlData.publicUrl;
};

// --- PENDING ORDERS LOGIC ---

export const createPendingOrder = async ({ payload, amountDueNow }) => {
  try {
    return await PendingOrdersModel.create(payload, amountDueNow);
  } catch (error) {
    throw new Error(`Pending Order Error: ${error.message}`);
  }
};

export const attachCheckoutSessionToPendingOrder = async (pendingOrderId, checkoutSessionId) => {
  try {
    await PendingOrdersModel.updateSession(pendingOrderId, checkoutSessionId);
  } catch (error) {
    console.error('Failed to attach checkout session to pending order:', error.message);
  }
};

export const getPendingOrder = async (pendingOrderId) => {
  return await PendingOrdersModel.findById(pendingOrderId);
};

export const markPendingOrderPaid = async (pendingOrderId, paymentId, resultOrder) => {
  try {
    await PendingOrdersModel.markAsPaid(pendingOrderId, paymentId, resultOrder);
  } catch (error) {
    console.error('Failed to mark pending order as paid:', error.message);
  }
};

// --- ACTUAL ORDER CREATION LOGIC ---

const allocateBundlePrice = (products, discountedTotal) => {
  // PROPORTIONAL SPLIT — hinahati ang discounted bundle price base sa
  // RELATIVE na orihinal na presyo (`price`) ng bawat product ("relative
  // standalone selling price" method), hindi pantay-pantay. Kaya kung mas
  // mahal ang isang product bago ma-discount, mas malaki rin ang share
  // niya sa discounted total — parehong % discount ang naa-apply sa bawat
  // item, tama ang per-product revenue/reporting, at fair kung sakaling
  // kailanganing i-refund/i-cancel ang isa lang sa mga item.
  //
  // Ang huling product sa listahan ang kumukuha ng "remainder" sa halip
  // na sarili niyang computed share, para eksaktong tumugma ang kabuuang
  // sum sa totoong binayaran ng customer — walang centavo na "nawawala"
  // o "sumosobra" dahil sa rounding.
  const originalTotal = products.reduce((sum, p) => sum + (Number(p.price) || 0), 0);

  // Fallback kung 0/wala ang lahat ng original prices (hindi dapat
  // mangyari sa totoong data, pero iwasan ang divide-by-zero) — balik sa
  // dating equal split.
  if (originalTotal <= 0) {
    const equalShare = Math.round((discountedTotal / products.length) * 100) / 100;
    let runningTotal = 0;
    return products.map((p, idx) => {
      if (idx === products.length - 1) {
        const remainder = Math.round((discountedTotal - runningTotal) * 100) / 100;
        return { ...p, allocated_price: remainder };
      }
      runningTotal += equalShare;
      return { ...p, allocated_price: equalShare };
    });
  }

  let runningTotal = 0;
  return products.map((p, idx) => {
    if (idx === products.length - 1) {
      const remainder = Math.round((discountedTotal - runningTotal) * 100) / 100;
      return { ...p, allocated_price: remainder };
    }
    const weight = (Number(p.price) || 0) / originalTotal;
    const share = Math.round(discountedTotal * weight * 100) / 100;
    runningTotal += share;
    return { ...p, allocated_price: share };
  });
};

// Kinukuha ang bundle mismo mula sa DB (hindi umaasa sa presyo na ipinasa ng
// client) para hindi ma-manipulate ng customer ang presyo sa pamamagitan lang
// ng pag-edit ng request payload. Hina-validate din dito kung available pa
// ba talaga ang bundle (active at nasa loob ng date range nito) bago tanggapin
// ang order — laban sa "stale cart" na may nag-expire nang promo.
const resolveBundleLineItem = async (item) => {
  const bundle = await getBundleById(item.bundleId);

  if (!bundle) {
    throw new Error(`Bundle not found: ${item.bundleId}`);
  }
  if (bundle.is_active === false) {
    throw new Error(`"${bundle.bundle_name}" is no longer available.`);
  }
  if (bundle.is_within_date_range === false) {
    throw new Error(`"${bundle.bundle_name}" is not available right now (outside its promo date range).`);
  }
  if (!Array.isArray(bundle.products) || bundle.products.length < 2) {
    throw new Error(`"${bundle.bundle_name}" no longer has enough valid products.`);
  }

  const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  const allocatedProducts = allocateBundlePrice(bundle.products, Number(bundle.bundle_price || 0));

  // Isang `bundle_group_id` bawat "unit" ng bundle sa cart, para malaman ng
  // frontend/receipt kung aling mga component rows ang dapat i-grupo nang
  // magkasama sa display — kahit hiwalay silang totoong rows sa DB.
  const bundleGroupId = randomUUID();

  return allocatedProducts.map(p => ({
    product_id: p.id,
    product_name: p.name,
    quantity,
    unit_price: p.allocated_price,
    total_price: Math.round(p.allocated_price * quantity * 100) / 100,
    order_slip_details: item.orderSlip || {},
    selected_price_options: null,
    // FIX: dating hardcoded na `null` ito palagi — kahit may na-upload nang
    // larawan ang customer per-component sa BundleModal (`bundleImages`,
    // shape na `{ [productId]: File }`), hindi ito nababasa dito kaya laging
    // walang laman ang customer_reference_url ng bundle rows. Ngayon,
    // binabasa na ang `item.inspirationUrls` (object map na `{ [productId]: url }`,
    // ibinubuo ng frontend pagkatapos i-upload ang bawat File sa bucket bago
    // pa man ito ipasa dito) at ang tamang URL para sa product `p.id` ang
    // ilalagay sa exploded row na iyon.
    customer_reference_url: item.inspirationUrls?.[p.id] || null,
    bundle_id: bundle.id,
    bundle_group_id: bundleGroupId,
    bundle_name: bundle.bundle_name,
    original_unit_price: Number(p.price || 0),
    special_instructions: item.specialInstructions || '',
  }));
};

// Regular na (non-bundle) na item — parehong lohika gaya ng dati, walang
// binago sa presyo (galing pa rin ito sa client payload).
const resolveProductLineItem = (item) => ({
  product_id: item.productId,
  product_name: item.name,
  quantity: item.quantity,
  unit_price: item.unitPrice,
  total_price: item.subtotal,
  order_slip_details: item.orderSlip,
  selected_price_options: item.selectedPriceOptions || null,
  customer_reference_url: item.inspirationUrl || null,
  bundle_id: null,
  bundle_group_id: null,
  bundle_name: null,
  original_unit_price: null,
  special_instructions: item.specialInstructions || '',
});

// Ino-resolve ang LAHAT ng items bago pa man gumawa ng customer/order row sa
// DB — kaya kung may invalid na bundle (na-delete, na-deactivate, o
// nag-expire na ang date range), mahuhuli ito BAGO ma-orphan ang isang
// customer/order record na walang laman.
export const resolveOrderItems = async (items = []) => {
  const resolved = [];
  for (const item of items) {
    if (item.type === 'bundle' || item.bundleId) {
      const bundleRows = await resolveBundleLineItem(item);
      resolved.push(...bundleRows);
    } else {
      resolved.push(resolveProductLineItem(item));
    }
  }
  return resolved;
};

export const createDatabaseOrder = async (payload, paymongoPaymentId = null) => {
  // 1. I-resolve/i-validate muna ang lahat ng items (kasama ang pag-explode
  //    ng mga bundle) bago gumawa ng kahit anong bagong row sa DB.
  let resolvedItems;
  try {
    resolvedItems = await resolveOrderItems(payload.items);
  } catch (itemsError) {
    throw new Error(`Items Error: ${itemsError.message}`);
  }

  let customerData;
  try {
    customerData = await CustomersModel.create({
      name: payload.customer.name,
      phone: payload.customer.contactNumber,
      alt_phone: payload.customer.alternativeNumber || ''
    });
  } catch (custError) {
    throw new Error(`Customer Error: ${custError.message}`);
  }

  const orderToInsert = {
    order_number: payload.orderNumber || `ORD-${Date.now().toString().slice(-4)}`,
    customer_id: customerData.id,
    order_type: payload.orderType,
    source: 'online',
    status: 'Confirmed',
    subtotal: payload.payment.grandTotal,
    grand_total: payload.payment.grandTotal,
    payment_type: payload.payment.type,
    amount_paid: payload.payment.amountDueNow,
    balance: payload.payment.balanceAtPickup,
    pickup_date: payload.pickup.date,
    pickup_time: payload.pickup.time,
    pickup_time_end: payload.pickup.timeEnd || null,
    paymongo_payment_id: paymongoPaymentId,
  };

  let newOrder;
  try {
    newOrder = await OrdersModel.create([orderToInsert]);
  } catch (orderError) {
    throw new Error(`Order Error: ${orderError.message}`);
  }

  const itemsToInsert = resolvedItems.map(item => ({
    ...item,
    order_id: newOrder.id,
    special_instructions: payload.specialInstructions || ''
  }));

  try {
    await OrderItemsModel.createMany(itemsToInsert);
  } catch (itemsError) {
    throw new Error(`Items Error: ${itemsError.message}`);
  }

  notifyNewOrder(newOrder, payload);

  return newOrder;
};

export const completeOrderAndDeductStock = async (orderId) => {
  console.log(`\n[SERVICE] 1. Starting completeOrderAndDeductStock for Order ID: ${orderId}`);

  let updatedOrder;
  try {
    updatedOrder = await OrdersModel.updateStatus(orderId, 'Completed');
  } catch (updateError) {
    console.error('[SERVICE] Error updating order status:', updateError);
    throw new Error(`Failed to update order: ${updateError.message}`);
  }

  console.log('[SERVICE] 2. Successfully updated order status to:', updatedOrder.status);
  console.log('[SERVICE] 3. Order Type is:', updatedOrder.order_type);

  console.log('[SERVICE] 4. Fetching order items to deduct stock permanently...');
  
  let items;
  try {
    items = await OrderItemsModel.findByOrderId(orderId);
  } catch (itemsError) {
    console.error('[SERVICE] Error fetching order items:', itemsError);
    throw new Error(`Failed to fetch items: ${itemsError.message}`);
  }

  console.log(`[SERVICE] 5. Found ${items?.length || 0} items to deduct:`, items);

  if (items && items.length > 0) {
    for (const item of items) {
      if (!item.product_id) continue;

      console.log(`[SERVICE] 6. Processing Product ID: ${item.product_id} | Qty to deduct: ${item.quantity}`);

      try {
        const product = await ProductModel.findById(item.product_id);
        
        if (product) {
          // Same priority rule gaya ng availability computation: kung may
          // laman ang daily_limit, dun babawas (Pre-order "slots"); kung
          // wala, sa stock_quantity babawas (Pick-up Today na produced stock).
          const limitField = getStockLimitField(product);
          const currentValue = Number(product[limitField]) || 0;
          console.log(`[SERVICE] 7. Current ${limitField} for ${item.product_id} is: ${currentValue}`);

          const newValue = Math.max(0, currentValue - item.quantity);
          console.log(`[SERVICE] 8. New ${limitField} will be: ${newValue}`);

          await ProductModel.update(item.product_id, { [limitField]: newValue });
          console.log(`[SERVICE] 9. SUCCESS! Updated ${limitField} for Product ID: ${item.product_id}`);
        }
      } catch (err) {
         console.error(`[SERVICE] 9. Error fetching/updating stock for ${item.product_id}:`, err);
      }
    }
  }

  return updatedOrder;
};

export const createProduct = async (payload) => {
  try {
    return await ProductModel.create(payload);
  } catch (error) {
    throw new Error(`Database insert error: ${error.message}`);
  }
};

export const updateProduct = async (id, payload) => {
  try {
    return await ProductModel.update(id, payload);
  } catch (error) {
    throw new Error(`Database update error: ${error.message}`);
  }
};

export const cleanupExpiredPendingOrders = async () => {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  try {
    await PendingOrdersModel.deleteExpired(twoHoursAgo);
    console.log(`[SERVICE] Successfully cleaned up pending orders older than ${twoHoursAgo}`);
  } catch (error) {
    console.error('[SERVICE] Error cleaning up expired pending orders:', error.message);
  }
};