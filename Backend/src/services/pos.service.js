import { ProductModel } from '../model/product.model.js';
import { OrderItemsModel } from '../model/orderItems.model.js';
import { OrdersModel } from '../model/orders.model.js';
import { CustomersModel } from '../model/customers.model.js';

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

    // BAGO: Parehas na parehas na ito sa onlineOrdering.services.js
    return products.map(p => ({
      ...p,
      available_stock: Math.max(0, (p.stock_quantity || 0) - (reservedMap[p.id] || 0))
    }));
  } catch (error) {
    throw new Error(`Fetch POS Products Error: ${error.message}`);
  }
};

export const createPosOrder = async (payload) => {
  // 1. Handle Customer Data
  // Fallback to "Walk-in Customer" if left blank in the POS UI
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

  const orderToInsert = {
    order_number: payload.orderNumber || `POS-${Date.now().toString().slice(-4)}`,
    customer_id: customerData.id,
    order_type: payload.orderType,
    source: 'walk-in', // Tagged strictly for POS walk-ins
    status: orderStatus,
    subtotal: payload.payment?.subtotal,
    grand_total: payload.payment?.grandTotal,
    payment_type: payload.payment?.type || 'Cash',
    amount_paid: payload.payment?.amountDueNow,
    balance: payload.payment?.balance || 0,
    pickup_date: payload.pickup?.date || null,
    pickup_time: payload.pickup?.time || null,
  };

  let newOrder;
  try {
    newOrder = await OrdersModel.create([orderToInsert]);
  } catch (err) {
    throw new Error(`Order Error: ${err.message}`);
  }

  // 3. Insert Order Items
  const itemsToInsert = payload.items.map(item => ({
    order_id: newOrder.id,
    product_id: item.productId,
    product_name: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.subtotal,
    special_instructions: item.specialInstructions || ''
  }));

  try {
    await OrderItemsModel.createMany(itemsToInsert);
  } catch (err) {
    throw new Error(`Items Error: ${err.message}`);
  }

  // 4. Stock Deduction Logic
  // Automatically deduct inventory for "Buy Now" POS transactions
  if (isBuyNow) {
    for (const item of itemsToInsert) {
      if (!item.product_id) continue;
      try {
        const product = await ProductModel.findById(item.product_id);
        if (product) {
          const newStock = Math.max(0, product.stock_quantity - item.quantity);
          await ProductModel.update(item.product_id, { stock_quantity: newStock });
        }
      } catch (err) {
        console.error(`[POS SERVICE] Error updating stock for product ${item.product_id}:`, err);
      }
    }
  }

  return newOrder;
};