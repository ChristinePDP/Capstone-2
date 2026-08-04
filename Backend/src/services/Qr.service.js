import { OrdersModel } from '../model/orders.model.js';
// I-import yung ginawa mong function na nagbabawas ng stock
import { completeOrderAndDeductStock } from './onlineOrdering.services.js'; 

export const scanOrderByNumber = async (orderNumber) => {
  try {
    const data = await OrdersModel.findByOrderNumber(orderNumber);
    return data;
  } catch (error) {
    throw new Error(error.message);
  }
};

export const updateOrderStatus = async (orderNumber, status) => {
  try {
    // Kapag kinomplete ang order, gamitin yung function na may stock deduction
    if (status === 'Completed') {
      // 1. Hanapin muna yung order para makuha ang UUID (id) dahil yun ang kailangan ng completeOrderAndDeductStock
      const order = await OrdersModel.findByOrderNumber(orderNumber);
      if (!order) throw new Error('Order not found');

      // 2. I-pasa ang UUID sa deduction logic mo
      const data = await completeOrderAndDeductStock(order.id);
      return data;
    } 
    
    // Para sa ibang status (tulad ng 'Ready' o 'Confirmed'), i-update lang ang text normally
    const data = await OrdersModel.updateStatusByOrderNumber(orderNumber, status);
    return data;
    
  } catch (error) {
    throw new Error(error.message);
  }
};