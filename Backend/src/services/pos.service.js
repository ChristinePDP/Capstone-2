import { ProductModel } from '../model/product.model.js';
import { OrderItemsModel } from '../model/orderItems.model.js';
import { OrdersModel } from '../model/orders.model.js';
import { CustomersModel } from '../model/customers.model.js';
import { MaterialModel } from '../model/material.model.js';
// Same bundle-exploding / order-slip-resolving logic na ginagamit ng Online
// Ordering (resolveBundleLineItem + resolveProductLineItem, na parehong
// naka-wrap sa resolveOrderItems). Ito ang gumagawa ng maayos na product_id
// rows (kasama ang unit price allocation) mula sa isang bundle cart item, at
// nagpapasa rin ng order_slip_details / selected_price_options / customer_reference_url
// papunta sa bawat resolved row — dating wala nito ang POS, kaya nawawala
// ang order slip answers pagdating sa DB.
import { resolveOrderItems, validateCelebrationMaterialAvailability } from './onlineOrdering.service.js';

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

// I-deduct ang stock ng bawat item ng isang order. Ginagamit ito ng
// createPosOrder (kapag Buy Now, fully paid, walk-out agad) at ng
// confirmPosOrderPickup (kapag na-scan ang e-receipt QR sa pickup counter)
// — pareho itong "completion" moments, kaya dapat parehong logic ang
// tumatakbo.
async function deductStockForOrderItems(items) {
  for (const item of items) {
    if (!item.product_id) continue;
    try {
      const materialResult = await MaterialModel.findByProductId(item.product_id);
      if (materialResult.error) throw materialResult.error;
      if (materialResult.data) {
        await MaterialModel.deductById(materialResult.data.id, item.quantity);
        continue;
      }

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

export const getPosProducts = async (filters = {}) => {
  try {
    const result = await ProductModel.findAll(filters);
    const products = Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : [];
    
    const itemsResult = await OrderItemsModel.getPendingItems();
    const pendingItems = Array.isArray(itemsResult?.data) ? itemsResult.data : Array.isArray(itemsResult) ? itemsResult : [];
    const materialsResult = await MaterialModel.findAll();
    if (materialsResult.error) throw materialsResult.error;
    const materialByProductId = new Map(
      (materialsResult.data || [])
        .filter(material => material.product_id)
        .map(material => [material.product_id, material])
    );

    const reservedBuyNowMap = {};
    const reservedPreOrderMap = {};
    pendingItems.forEach(item => {
      const target = item.orders?.order_type === 'Pre-Order'
        ? reservedPreOrderMap
        : reservedBuyNowMap;
      target[item.product_id] = (target[item.product_id] || 0) + Number(item.quantity || 0);
    });

    return products.map(p => {
      const celebrationMaterial = materialByProductId.get(p.id);
      const limitField = getStockLimitField(p);
      const physicalStock = celebrationMaterial
        ? Number(celebrationMaterial.stock_quantity) || 0
        : Number(p.stock_quantity) || 0;
      const preOrderCapacity = limitField === 'daily_limit'
        ? Number(p.daily_limit) || 0
        : physicalStock;
      return {
        ...p,
        stock: physicalStock,
        stock_quantity: physicalStock,
        is_celebration_material: Boolean(celebrationMaterial),
        celebration_material_id: celebrationMaterial?.id || null,
        stock_basis_field: limitField,
        available_stock: Math.max(0, physicalStock - (reservedBuyNowMap[p.id] || 0)),
        buy_now_available_stock: Math.max(0, physicalStock - (reservedBuyNowMap[p.id] || 0)),
        pre_order_available_stock: Math.max(0, preOrderCapacity - (reservedPreOrderMap[p.id] || 0)),
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
    await validateCelebrationMaterialAvailability(resolvedItems, payload.orderType);
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
  // FIX: dating basta "Buy Now" = agad na "Completed" ang status, kahit pa
  // pumili ang cashier ng "50% Deposit" (walang bumabawal dito sa UI kahit
  // Buy Now ang order type). Resulta: order na "Completed" na agad sa
  // pagkakagawa, pero may natitira pang balance na walang sinumang
  // babalikan pa para i-settle — kasi ang settlement logic ay tumatakbo
  // lang tuwing may STATUS CHANGE papuntang "Completed" (sa
  // confirmPosOrderPickup sa ibaba), hindi sa mismong paggawa ng order.
  // Kaya nananatiling frozen sa deposit lang ang amount_paid magpakailanman.
  //
  // Ngayon: "Completed" agad lang kapag Buy Now AT walang natitirang
  // balance (fully paid na talaga sa counter — walang matitira pang
  // i-settle sa hinaharap). Kung may balance pa (deposit), "Confirmed"
  // muna ito — sasettle-han lang ito pagka-confirm ng pickup (QR scan) o
  // sa Orders.jsx admin page.
  const isBuyNow = payload.orderType === 'Buy Now';
  const hasOutstandingBalance = Number(payload.payment?.balance || 0) > 0;
  const shouldCompleteImmediately = isBuyNow && !hasOutstandingBalance;
  const orderStatus = shouldCompleteImmediately ? 'Completed' : 'Confirmed';

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
  // FIX: kasabay ng ayos sa itaas — sumasalamin na rin dito ang
  // `shouldCompleteImmediately` (hindi na basta `isBuyNow`), para hindi
  // agad mabawasan ang stock ng isang Buy Now order na may natitira pang
  // balance (deposit). Ang order na iyon ay ide-deduct na lang pagdating
  // ng aktwal na completion (confirmPosOrderPickup / Orders.jsx).
  if (shouldCompleteImmediately) {
    await deductStockForOrderItems(itemsToInsert);
  }

  // BAGO: idinagdag ang receiptToken sa response. Ginagamit ito ng frontend
  // (PosCart.jsx -> PosEReceipt) para lagyan ng laman ang confirm QR sa e-receipt.
  return {
    ...newOrder,
    receiptToken: makeReceiptToken(newOrder.id),
  };
};

// Para sa "confirm at pickup" scanner sa pickup counter — isu-scan ng owner
// ang QR mula sa e-receipt (Pre-Order man o naka-iskedyul na Buy Now) para
// i-verify at i-Complete ang order.
export const confirmPosOrderPickup = async (orderId, token) => {
  if (token !== makeReceiptToken(orderId)) {
    throw new Error('Invalid confirmation code');
  }
  const order = await OrdersModel.findById(orderId);
  if (!order) throw new Error('Order not found');
  // FIX (idempotency guard): kung na-scan na dati ang parehong QR (na-double
  // scan, o na-Complete na dati via Orders.jsx admin page), huwag nang
  // ulitin ang settlement/deduction sa ibaba.
  if (order.status === 'Completed') throw new Error('Order already marked as completed');

  // FIX: walang generic `update()` sa OrdersModel — `updateStatus(id, status)`
  // lang ang meron, kaya ito ang tamang gamitin dito.
  let updatedOrder = await OrdersModel.updateStatus(orderId, 'Completed');

  // Settle any outstanding balance — same rule as the online-ordering
  // completion flow: a POS deposit order (e.g. 50% paid at order time, the
  // remainder collected in cash/GCash at pickup) should show as fully paid
  // once the order is marked Completed, instead of permanently logging as
  // only the original deposit amount.
  if (Number(updatedOrder.balance) > 0) {
    try {
      updatedOrder = await OrdersModel.updatePayment(orderId, {
        amount_paid: updatedOrder.grand_total,
        balance: 0,
        // FIX: dapat din ma-update ang payment_type papuntang 'full' —
        // dati'y amount_paid/balance lang ang na-a-update.
        payment_type: 'full',
      });
    } catch (settleError) {
      console.error('[POS SERVICE] Error settling balance on pickup confirmation:', settleError);
    }
  }

  // Deduct stock now that pickup is confirmed — this order was created as
  // "Confirmed" (not yet deducted) precisely so this is the single moment
  // that actually removes it from inventory.
  try {
    const items = await OrderItemsModel.findByOrderId(orderId);
    if (items && items.length > 0) {
      await deductStockForOrderItems(items);
    }
  } catch (itemsError) {
    console.error('[POS SERVICE] Error fetching items to deduct stock on pickup confirmation:', itemsError);
  }

  return updatedOrder;
};