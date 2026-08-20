// backend/src/controllers/onlineOrdering.controller.js
import crypto from 'crypto';
import { fetchMenuProducts, uploadImageToBucket, createDatabaseOrder, 
  completeOrderAndDeductStock, createProduct, 
  getStorageBaseUrl, 
  updateProduct,
  createPendingOrder,
  attachCheckoutSessionToPendingOrder,
  getPendingOrder,
  markPendingOrderPaid } from '../services/onlineOrdering.services.js';
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
    const { amount, description, customerName, customerPhone, orderPayload } = req.body;

    if (!orderPayload) {
      return res.status(400).json({ success: false, message: 'Missing orderPayload' });
    }

    const amountInCents = Math.round(amount * 100);
    const clientOrigin = req.headers.origin || 'http://localhost:5173';

    // 1. I-STAGE lang ang order — WALA pang laman ang `orders` table dito.
    //    Ang row na ito ang gagamitin ng webhook para gawin ang totoong
    //    order kapag na-confirm na ng PayMongo na nabayaran.
    const pendingOrder = await createPendingOrder({ payload: orderPayload, amountDueNow: amount });

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
            success_url: `${clientOrigin}/onlineOrdering/confirm?pending_id=${pendingOrder.id}`,
            cancel_url: `${clientOrigin}/onlineOrdering/checkout?pending_id=${pendingOrder.id}`,
            description: `${description} | Customer: ${customerName || 'Guest'}`,
            billing: {
              name: customerName || 'Guest',
              phone: customerPhone || 'N/A'
            },
            payment_method_types: ['gcash', 'paymaya', 'card'],
            // 2. Ito ang "susi" na ipapasa pabalik ng PayMongo sa webhook
            //    event — dito babalik-tanawin ng webhook kung aling
            //    pending order ang dapat i-promote sa totoong `orders` row.
            metadata: {
              pending_order_id: pendingOrder.id
            },
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
      await attachCheckoutSessionToPendingOrder(pendingOrder.id, json.data.id);
      res.status(200).json({
        success: true,
        checkoutUrl: json.data.attributes.checkout_url,
        pendingOrderId: pendingOrder.id
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

// PayMongo signs webhook deliveries with a "Paymongo-Signature" header
// shaped like: t=<timestamp>,te=<test_signature>,li=<live_signature>
// The signed payload is `${timestamp}.${rawRequestBody}`, HMAC-SHA256'd
// with your webhook's signing secret (from the Dashboard, or the
// `secret_key` returned when you create the webhook via the API).
const verifyPaymongoSignature = (rawBody, signatureHeader, secret) => {
  if (!signatureHeader || !secret) return false;

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((pair) => pair.split('='))
  );
  if (!parts.t) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex');

  // Gamitin ang test signature habang naka-test mode kayo sa PayMongo;
  // palitan ng `parts.li` kapag live keys na ang gamit niyo.
  const candidate = process.env.PAYMONGO_MODE === 'live' ? parts.li : parts.te;
  return candidate === expected;
};

// IMPORTANT: kailangan RAW body (Buffer) ang `req.body` dito para gumana
// ang signature check — huwag i-apply ang global `express.json()` middleware
// sa route na ito. Tignan ang mga instructions sa ibaba para sa route setup.
export const handlePaymongoWebhook = async (req, res) => {
  try {
    const signature = req.headers['paymongo-signature'];
    const rawBody = req.body.toString('utf8');

    const isValid = verifyPaymongoSignature(rawBody, signature, process.env.PAYMONGO_WEBHOOK_SECRET);
    if (!isValid) {
      console.warn('Paymongo Webhook: invalid signature, rejecting request.');
      return res.status(401).json({ success: false, message: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody);
    const eventType = event?.data?.attributes?.type;
    const paymentResource = event?.data?.attributes?.data; // ang Payment resource

    console.log('[WEBHOOK] Received Paymongo event:', eventType);

    if (eventType === 'payment.paid' || eventType === 'checkout_session.payment.paid') {
      const paymentId = paymentResource?.id;
      const pendingOrderId = paymentResource?.attributes?.metadata?.pending_order_id;

      if (!pendingOrderId) {
        console.warn('[WEBHOOK] payment.paid but walang pending_order_id sa metadata:', paymentId);
        return res.status(200).json({ received: true });
      }

      const pendingOrder = await getPendingOrder(pendingOrderId);
      if (!pendingOrder) {
        console.warn('[WEBHOOK] Walang nahanap na pending order para sa:', pendingOrderId);
        return res.status(200).json({ received: true });
      }

      // Idempotency guard — pwedeng ma-deliver nang paulit-ulit ang parehong
      // event ng PayMongo, kaya i-check muna kung na-process na dati.
      if (pendingOrder.status === 'paid') {
        console.log('[WEBHOOK] Pending order na ito ay na-process na dati:', pendingOrderId);
        return res.status(200).json({ received: true, already_processed: true });
      }

      // 3. DITO lamang natin ginagawa ang TOTOONG order sa database —
      //    pagkatapos lang ma-confirm ng PayMongo na nabayaran na.
      const newOrder = await createDatabaseOrder(pendingOrder.payload, paymentId);
      await markPendingOrderPaid(pendingOrderId, paymentId, newOrder);

      console.log('[WEBHOOK] Order created after payment confirmation:', newOrder.order_number);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Paymongo Webhook Error:', error);
    // 200 pa rin ibalik para hindi tayo bombahin ng retries ng Paymongo dahil
    // sa sarili nating bug — mag-log lang para ma-follow up.
    res.status(200).json({ received: true, error: error.message });
  }
};

// Tinatawag ito ni Confirm.jsx paulit-ulit (polling) habang naghihintay ng
// webhook confirmation mula sa PayMongo.
export const getPendingOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const pendingOrder = await getPendingOrder(id);

    if (!pendingOrder) {
      return res.status(404).json({ success: false, message: 'Pending order not found' });
    }

    res.status(200).json({
      success: true,
      status: pendingOrder.status,
      order: pendingOrder.status === 'paid'
        ? { id: pendingOrder.result_order_id, order_number: pendingOrder.result_order_number }
        : null
    });
  } catch (error) {
    console.error('Get Pending Order Status Error:', error);
    res.status(500).json({ success: false, message: error.message });
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