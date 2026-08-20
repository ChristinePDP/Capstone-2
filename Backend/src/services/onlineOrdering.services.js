// backend/src/services/onlineOrdering.services.js
import { supabase } from '../config/supabase.js'; 
import { ProductModel } from '../model/product.model.js';
import { OrderItemsModel } from '../model/orderItems.model.js';
import { OrdersModel } from '../model/orders.model.js';
import { CustomersModel } from '../model/customers.model.js';
import { PendingOrdersModel } from '../model/pendingOrders.model.js';
import { notifyNewOrder } from './notification.service.js';

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
    const baseStock = p.stock_quantity || 0; 
    const reserved = reservedMap[p.id] || 0;
    const available = Math.max(0, baseStock - reserved);

    return {
      ...p,
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

export const createDatabaseOrder = async (payload, paymongoPaymentId = null) => {
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

  const itemsToInsert = payload.items.map(item => ({
    order_id: newOrder.id,
    product_id: item.productId,
    product_name: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.subtotal,
    order_slip_details: item.orderSlip,
    selected_price_options: item.selectedPriceOptions || null, 
    customer_reference_url: item.inspirationUrl || null,
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
          console.log(`[SERVICE] 7. Current stock for ${item.product_id} is: ${product.stock_quantity}`);
          
          const newStock = Math.max(0, product.stock_quantity - item.quantity);
          console.log(`[SERVICE] 8. New stock will be: ${newStock}`);
          
          await ProductModel.update(item.product_id, { stock_quantity: newStock });
          console.log(`[SERVICE] 9. SUCCESS! Updated stock for Product ID: ${item.product_id}`);
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