import { ProductModel } from '../model/product.model.js';
import { OrderItemsModel } from '../model/orderItems.model.js';
import { OrdersModel } from '../model/orders.model.js';
import { CustomersModel } from '../model/customers.model.js';
// Same bundle-exploding / order-slip-resolving logic na ginagamit ng Online
// Ordering (resolveBundleLineItem + resolveProductLineItem, na parehong
// naka-wrap sa resolveOrderItems). Ito ang gumagawa ng maayos na product_id
// rows (kasama ang unit price allocation) mula sa isang bundle cart item, at
// nagpapasa rin ng order_slip_details / selected_price_options / customer_reference_url
// papunta sa bawat resolved row — dating wala nito ang POS, kaya nawawala
// ang order slip answers pagdating sa DB.
import { resolveOrderItems } from './onlineOrdering.service.js';

// BAGO: ginagamit para gumawa ng token na naka-encode sa QR ng e-receipt.
// Ito ang isu-scan ng owner sa pickup counter para i-verify/complete ang order.
// PALITAN ang RECEIPT_TOKEN_SECRET sa .env mo ng sarili mong secret string.
const RECEIPT_SECRET = process.env.RECEIPT_TOKEN_SECRET || 'change_this_secret_in_env';

function makeReceiptToken(orderId) {
  return Buffer.from(`${orderId}${RECEIPT_SECRET}`).toString('base64');
}

// Same priority rule gaya ng ginagamit sa onlineOrdering.services.js at
// orders.service.js: kung may laman (di null, > 0) ang `daily_limit`, ITO
// ang babasahin/babawasan (Pre-order "slots"); kung wala, sa
// `stock_quantity` (Pick-up Today na produced stock).
const getStockLimitField = (product) => {
  const hasDailyLimit = product?.daily_limit !== null
    && product?.daily_limit !== undefined
    && Number(product.daily_limit) > 0;
  return hasDailyLimit ? 'daily_limit' : 'stock_quantity';
};

export const getPosProducts = async (filters = {}) => {
  try {
    const result = await ProductModel.findAll(filters);
    const products = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
    
    const itemsResult = await OrderItemsModel.getPendingItems();
    const pendingItems = Array.isArray(itemsResult?.data) ? itemsResult.data : Array.isArray(itemsResult) ? itemsResult : [];

    const reservedMap = {};
    pendingItems.forEach(item => {
      reservedMap[item.product_id] = (reservedMap[item.product_id] || 0) + item.quantity;
    });

    return products.map(p => {
      const limitField = getStockLimitField(p);
      const baseStock = Number(p[limitField]) || 0;
      return {
        ...p,
        stock_basis_field: limitField,
        available_stock: Math.max(0, baseStock - (reservedMap[p.id] || 0))
      };
    });
  } catch (error) {
    throw new Error(`Fetch POS Products Error: ${error.message}`);
  }
};

export const createPosOrder = async (payload) => {
  // 0. I-resolve/i-validate muna ang lahat ng items (kasama ang pag-explode
  //    ng mga bundle sa kani-kanilang component products, at ang pag-map ng
  //    order_slip_details / selected_price_options / customer_reference_url)
  //    BAGO gumawa ng kahit anong row sa DB — parehong pattern gaya ng
  //    ginagamit ng Online Ordering sa createDatabaseOrder.
  let resolvedItems;
  try {
    resolvedItems = await resolveOrderItems(payload.items);
  } catch (itemsError) {
    throw new Error(`Items Error: ${itemsError.message}`);
  }

  // 1. Handle Customer Data
  const customerName = payload.customer?.name || 'Walk-in Customer';
  const customerPhone = payload.customer?.phone || '00000000000';
  
  let customerData;
  try {
    customerData = await CustomersModel.create({
      name: customerName,
      phone: customerPhone,
      alt_phone: payload.customer?.altPhone || ''
    });
  } catch (err) {
    throw new Error(`Customer Error: ${err.message}`);
  }

  // 2. Create the Order
  const isBuyNow = payload.orderType === 'Buy Now';
  const orderStatus = isBuyNow ? 'Completed' : 'Confirmed';

  let dbPaymentType = 'full';
  if (payload.payment?.type === '50% Deposit') {
    dbPaymentType = 'deposit'; 
  } else if (payload.payment?.type === 'Full Payment') {
    dbPaymentType = 'full';
  }

  const orderToInsert = {
    customer_id: customerData.id,
    order_type: payload.orderType,
    source: 'walk-in', 
    status: orderStatus,
    subtotal: payload.payment?.subtotal || 0,
    
    // BAGO: Idinagdag ang additional_charge at discount (JSONB format)
    additional_charge: payload.payment?.additionalCharge || 0,
    discount: payload.payment?.discount || {}, // Ito ay tatanggapin na bilang object dahil ginawa nating JSONB sa database
    
    grand_total: payload.payment?.grandTotal || 0,
    payment_type: dbPaymentType, 
    amount_paid: payload.payment?.amountDueNow || 0,
    balance: payload.payment?.balance || 0,
    pickup_date: payload.pickup?.date || null,
    // `payload.pickup.time` is now guaranteed to be a clean "HH:MM" start time
    // (resolved on the frontend from the selected slot), so it inserts cleanly
    // into the `time` column instead of being mis-parsed as a range/offset.
    pickup_time: payload.pickup?.time || null,
    pickup_time_end: payload.pickup?.timeEnd || null,

    // OPTIONAL: if you add a `pickup_time_slot` text column to `orders`, uncomment
    // the line below to preserve the full slot range (e.g. "08:00-10:00") instead
    // of just the start time. Leave commented out until the column exists, or the
    // insert will fail.
    // pickup_time_slot: payload.pickup?.timeSlot || null,
  };

  let newOrder;
  try {
    newOrder = await OrdersModel.create([orderToInsert]);
  } catch (err) {
    throw new Error(`Order Error: ${err.message}`);
  }

  // 3. Insert Order Items
  // Ginagamit na ang resolvedItems (galing sa resolveOrderItems) sa halip
  // ng basta pag-map sa payload.items — dati'y nawawala ang order_slip_details,
  // selected_price_options, customer_reference_url pati na ang bundle
  // components (walang product_id kapag bundle dati, kaya hindi na-iinsert
  // nang tama). Bawat resolved row ay may kumpletong product_id na, kaya
  // gumagana rin ang stock deduction sa Step 4 sa ibaba.
  const itemsToInsert = resolvedItems.map(item => ({
    ...item,
    order_id: newOrder.id
  }));

  try {
    await OrderItemsModel.createMany(itemsToInsert);
  } catch (err) {
    throw new Error(`Items Error: ${err.message}`);
  }

  // 4. Stock Deduction Logic
  if (isBuyNow) {
    for (const item of itemsToInsert) {
      if (!item.product_id) continue;
      try {
        const product = await ProductModel.findById(item.product_id);
        if (product) {
          const limitField = getStockLimitField(product);
          const currentValue = Number(product[limitField]) || 0;
          const newValue = Math.max(0, currentValue - item.quantity);
          await ProductModel.update(item.product_id, { [limitField]: newValue });
        }
      } catch (err) {
        console.error(`[POS SERVICE] Error updating stock for product ${item.product_id}:`, err);
      }
    }
  }

  // BAGO: idinagdag ang receiptToken sa response. Ginagamit ito ng frontend
  // (PosCart.jsx -> PosEReceipt) para lagyan ng laman ang confirm QR sa e-receipt.
  return {
    ...newOrder,
    receiptToken: makeReceiptToken(newOrder.id),
  };
};

// BAGO: para sa hinaharap na "confirm at pickup" scanner — hindi pa ginagamit
// ngayon dahil litrato na lang muna ang approach, pero handa na ito kapag
// gusto mo nang mag-set up ng scanner sa counter.
export const confirmPosOrderPickup = async (orderId, token) => {
  if (token !== makeReceiptToken(orderId)) {
    throw new Error('Invalid confirmation code');
  }
  const order = await OrdersModel.findById(orderId);
  if (!order) throw new Error('Order not found');
  if (order.status === 'Completed') throw new Error('Order already marked as completed');
  // FIX: walang generic `update()` sa OrdersModel — `updateStatus(id, status)`
  // lang ang meron, kaya ito ang tamang gamitin dito.
  return await OrdersModel.updateStatus(orderId, 'Completed');
};