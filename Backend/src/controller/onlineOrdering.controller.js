// backend/src/controllers/onlineOrdering.controller.js
import { fetchMenuProducts, getPreOrderDateAvailability, uploadImageToBucket, createDatabaseOrder,
  completeOrderAndDeductStock, createProduct, 
  getStorageBaseUrl, 
  updateProduct } from '../services/onlineOrdering.service.js';
import { supabase } from '../config/supabase.js'; 

export const getPublicConfig = async (req, res) => {
  try {
    // 'homepage-images' == yung bucket na ginagamit ng Home.jsx para sa
    // hero/gallery/feature images. Dagdagan na lang ito ng ibang key kung
    // may iba pang bucket/config na kakailanganin pang i-expose sa frontend.
    const storageUrl = getStorageBaseUrl('homepage-images');
 
    res.status(200).json({
      success: true,
      storageUrl
    });
  } catch (error) {
    console.error('Get Public Config Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch config' });
  }
};

export const getMenuProducts = async (req, res) => {
  try {
    const { category, search } = req.query;
    const products = await fetchMenuProducts({ category, search });

    res.status(200).json({
      success: true,
      data: products
    });
  } catch (error) {
    console.error('Error fetching menu products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch menu products.',
      error: error.message
    });
  }
};

export const getPreOrderAvailability = async (req, res) => {
  try {
    const { items, startDate, endDate } = req.body || {};
    const isDate = value => {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const parsed = new Date(`${value}T00:00:00Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    };
    if (!Array.isArray(items) || !items.length || !isDate(startDate) || !isDate(endDate) || startDate > endDate) {
      return res.status(400).json({ success: false, message: 'A cart and valid pickup date range are required.' });
    }
    const rangeDays = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000;
    if (rangeDays > 45) {
      return res.status(400).json({ success: false, message: 'Pickup availability can only be checked one month at a time.' });
    }
    const availability = await getPreOrderDateAvailability({ items, startDate, endDate });
    return res.status(200).json({ success: true, data: availability });
  } catch (error) {
    console.error('Pre-order Availability Error:', error);
    return res.status(500).json({ success: false, message: 'Failed to check pickup date availability.' });
  }
};

export const addProduct = async (req, res) => {
  try {
    const newProduct = await createProduct(req.body);
    res.status(201).json({ success: true, data: newProduct });
  } catch (error) {
    console.error('Add Product Error:', error);
    // Validation errors (missing name, incomplete price matrix, etc.) are
    // the client's fault -> 400, not a 500.
    res.status(400).json({ success: false, message: error.message });
  }
};

export const editProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedProduct = await updateProduct(id, req.body);
    res.status(200).json({ success: true, data: updatedProduct });
  } catch (error) {
    console.error('Edit Product Error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

export const uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const publicUrl = await uploadImageToBucket(req.file, 'product-images');
    res.status(200).json({ success: true, url: publicUrl });
  } catch (error) {
    console.error('Product Image Upload Error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image' });
  }
};

// FIX: idinagdag ang explicit check na ito dito sa controller bilang
// karagdagang safety net sa itaas ng `limits.fileSize` na nasa multer config
// (routes.js). Yung multer limit pa rin ang unang bantay (para hindi
// mag-aksaya ng bandwidth/RAM sa pagbasa ng malaking file), pero ito namang
// check dito ang tumitiyak na kahit paano dumating dito ang `req.file`
// (galing man sa multer o sa ibang middleware balang araw), hindi pa rin
// tatanggapin ang file na lampas 5MB.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export const uploadInspiration = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    if (req.file.size > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({ success: false, message: 'Masyadong malaki ang file (max 5MB lang).' });
    }
    
    const publicUrl = await uploadImageToBucket(req.file);
    res.status(200).json({ success: true, url: publicUrl });
  } catch (error) {
    console.error('Image Upload Error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload image' });
  }
};

export const placeOrder = async (req, res) => {
  try {
    const orderData = req.body;
    const savedOrder = await createDatabaseOrder(orderData);
    res.status(201).json({ success: true, order: savedOrder });
  } catch (error) {
    console.error('Order Creation Error:', error?.stack || error);
    res.status(error.status || 500).json({
      success: false,
      message: error.clientMessage
        || "We couldn't complete the order. Please try again or contact support."
    });
  }
};

export const placeManualPaymentOrder = async (req, res) => {
  let proofUrl = null;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Payment proof is required.' });
    }
    if (!req.file.mimetype?.startsWith('image/')) {
      return res.status(400).json({ success: false, message: 'Payment proof must be an image.' });
    }
    if (req.file.size > MAX_FILE_SIZE_BYTES) {
      return res.status(400).json({ success: false, message: 'Payment proof must be 5MB or smaller.' });
    }

    let orderPayload;
    try {
      orderPayload = JSON.parse(req.body.orderPayload || '');
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid order payload.' });
    }

    proofUrl = await uploadImageToBucket(req.file, 'payment-assets', 'proof_of_transaction');
    const marker = '/storage/v1/object/public/payment-assets/';
    const pathIndex = proofUrl.indexOf(marker);
    const proofPath = pathIndex >= 0 ? decodeURIComponent(proofUrl.slice(pathIndex + marker.length)) : null;
    if (!proofPath || !proofPath.startsWith('proof_of_transaction/')) {
      throw new Error('Failed to determine the uploaded payment proof path.');
    }
    const savedOrder = await createDatabaseOrder(orderPayload, { url: proofUrl, path: proofPath });
    return res.status(201).json({ success: true, order: savedOrder });
  } catch (error) {
    if (proofUrl) {
      const marker = '/storage/v1/object/public/payment-assets/';
      const index = proofUrl.indexOf(marker);
      if (index >= 0) {
        const path = decodeURIComponent(proofUrl.slice(index + marker.length));
        await supabase.storage.from('payment-assets').remove([path]).catch(cleanupError => {
          console.error('Manual payment proof cleanup failed:', cleanupError);
        });
      }
    }
    console.error('Manual Payment Order Error:', error?.stack || error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.clientMessage || 'Unable to submit the order for verification.'
    });
  }
};

export const markOrderCompleted = async (req, res) => {
  console.log('\n--- MARK ORDER COMPLETED ENDPOINT HIT ---');
  try {
    const { orderId } = req.params;
    console.log('Target Order ID from params:', orderId);

    let targetId = orderId;

    if (orderId.startsWith('ORD-')) {
        const { data: orderData, error: orderError } = await supabase
            .from('orders')
            .select('id')
            .eq('order_number', orderId)
            .single();

        if (orderError) throw new Error(`Order not found: ${orderError.message}`);
        targetId = orderData.id; 
    }

    const completedOrder = await completeOrderAndDeductStock(targetId);
    
    console.log('--- Order Completion Flow Finished Successfully! ---');
    res.status(200).json({ 
        success: true, 
        message: 'Order marked as Completed and stock deducted successfully!', 
        order: completedOrder 
    });
  } catch (error) {
    console.error('Order Completion Error Catch:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
