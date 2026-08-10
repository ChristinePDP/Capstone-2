// backend/src/controllers/onlineOrdering.controller.js
import { fetchMenuProducts, uploadImageToBucket, createDatabaseOrder, 
  completeOrderAndDeductStock, createProduct, 
  getStorageBaseUrl, 
  updateProduct } from '../services/onlineOrdering.services.js';
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

export const createPaymongoLink = async (req, res) => {
  try {
    const { amount, description, customerName, customerPhone } = req.body;
    const amountInCents = Math.round(amount * 100);

    const clientOrigin = req.headers.origin || 'http://localhost:5173';

    const options = {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64')}`
      },
      body: JSON.stringify({
        data: {
          attributes: {
            send_email_receipt: false,
            show_description: true,
            show_line_items: true,
            success_url: `${clientOrigin}/onlineOrdering/confirm`,
            cancel_url: `${clientOrigin}/onlineOrdering/checkout`,
            description: `${description} | Customer: ${customerName || 'Guest'}`,
            billing: {
              name: customerName || 'Guest',
              phone: customerPhone || 'N/A'
            },
            payment_method_types: ['gcash', 'paymaya', 'card'],
            line_items: [
              {
                currency: 'PHP',
                amount: amountInCents,
                name: description || 'Online Order',
                quantity: 1
              }
            ]
          }
        }
      })
    };

    const response = await fetch('https://api.paymongo.com/v1/checkout_sessions', options);
    const json = await response.json();

    if (json.data) {
      res.status(200).json({
        success: true,
        checkoutUrl: json.data.attributes.checkout_url
      });
    } else {
      console.error('Paymongo Checkout Creation Error:', json.errors);
      res.status(400).json({ success: false, error: json.errors });
    }
  } catch (error) {
    console.error('Paymongo Error Catch:', error);
    res.status(500).json({ success: false, message: 'Payment link generation failed' });
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

export const uploadInspiration = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
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
    console.error('Order Creation Error:', error);
    res.status(500).json({ success: false, message: error.message });
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

