import { scanOrderByNumber, updateOrderStatus } from '../services/Qr.service.js';
import { completeOrderAndDeductStock } from '../services/onlineOrdering.services.js';
import { supabase } from '../config/supabase.js';

export const handleScanQR = async (req, res) => {
  try {
    const orderData = await scanOrderByNumber(req.params.orderNumber);
    res.status(200).json({ success: true, order: orderData });
  } catch (error) {
    res.status(404).json({ success: false, message: 'Order hindi nahanap sa system.' });
  }
};

export const handleUpdateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { orderNumber } = req.params;

    let finalOrder;

    if (status === 'Completed') {
      // 1. Kunin muna ang totoong UUID (id) ng order dahil "ORD-XXXX" ang ipinapasa ng params
      const { data: orderData, error } = await supabase
        .from('orders')
        .select('id')
        .eq('order_number', orderNumber)
        .single();

      if (error) throw new Error('Hindi mahanap ang UUID ng order.');

      // 2. I-run ang deduction logic (magse-set na rin ito ng status to 'Completed' at magbabawas ng stock)
      finalOrder = await completeOrderAndDeductStock(orderData.id);
    } else {
      // 3. Normal update para sa ibang status (halimbawa: Ready, Cancelled) gamit ang dati mong service
      finalOrder = await updateOrderStatus(orderNumber, status);
    }

    res.status(200).json({ success: true, order: finalOrder });
  } catch (error) {
    console.error('Update Status Error:', error);
    res.status(500).json({ success: false, message: 'Nabigo ang pag-update ng status.' });
  }
};