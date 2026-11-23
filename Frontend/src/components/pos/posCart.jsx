import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShoppingCart, Minus, Plus, ChevronDown, ChevronUp, Tag, X, Pencil, Trash2
} from 'lucide-react';
import PosEReceipt from './posEreceipt';
import OrderSummaryModal, { getLiveNow, addDaysToDateString, formatDateLong, getSlotLabel, isSlotPast, TIME_SLOTS } from './orderSum';
import CartOrderSlipEditor from '../shared/CartOrderSlipEditor';
import { countReferenceFiles, countSlipFiles, pruneEmptySlipAnswers, slipHasFiles, uploadSlipImages, findMissingRequiredSlipImages } from '../shared/orderSlipUploads';
import { getOrderErrorMessage } from '../../services/orderErrorMessage';
import {
  MAX_COST,
  formatNumberLive,
  formatPeso,
  formatCount,
  sanitizeNumericText,
} from '../../utils/numberGuards';

const POS_CHECKOUT_RESERVATION_KEY = 'aileen_cake_max_pos_checkout_reservation_id';

function hasDailyLimitSet(item) {
  return item?.daily_limit !== null && item?.daily_limit !== undefined && Number(item.daily_limit) > 0;
}

function isQuantityTracked(item, orderType = 'Buy Now') {
  if (!item) return false;
  return item.order_type === 'Pre-order' || orderType === 'Pre-Order'
    || hasDailyLimitSet(item)
    || (item.stock_quantity !== null && item.stock_quantity !== undefined);
}

function getQuantityLimit(item, orderType = 'Buy Now') {
  if (orderType === 'Pre-Order' && item.pre_order_unlimited) return Infinity;
  if (item.type === 'bundle' || item.type === 'package') {
    if (orderType === 'Buy Now' && item.order_type === 'Pre-order') return 0;
    return orderType === 'Pre-Order'
      ? Number(item.pre_order_available_stock ?? 0)
      : Number(item.buy_now_available_stock ?? 0);
  }
  if (orderType === 'Pre-Order') return item.pre_order_available_stock ?? item.available_stock ?? 0;
  return item.buy_now_available_stock ?? item.available_stock ?? 0;
}

function findStockIssue(cartItems = [], type) {
  const scopedItems = cartItems.filter(i => (i.fulfillmentType || i.orderType || type) === type);
  const qtyById = {};
  scopedItems.forEach(i => { qtyById[i.id] = (qtyById[i.id] || 0) + (Number(i.qty) || 0); });
  const seen = new Set();
  for (const item of scopedItems) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    if (!isQuantityTracked(item, type)) continue;
    const limit = Number(getQuantityLimit(item, type));
    if (Number.isNaN(limit)) continue;
    if (qtyById[item.id] > limit) return { name: item.name, limit, qty: qtyById[item.id] };
  }
  return null;
}

function stockIssueMessage(issue, type) {
  return issue.limit <= 0
    ? `${issue.name} is not available for ${type}.`
    : `${issue.name} is not available in that quantity for ${type}.`;
}

const PH_MOBILE_REGEX = /^09\d{9}$/;
const NAME_MAX_LENGTH = 50;

const getNameError = (value, isRequired = false) => {
  const name = String(value || '').trim();
  if (!name) return isRequired ? 'Customer name is required.' : '';
  if (name.length > NAME_MAX_LENGTH) return `Customer name must be ${NAME_MAX_LENGTH} characters or fewer.`;
  const validChars = /^[\p{L}][\p{L}\s.'\u2019-]*$/u.test(name);
  const letterCount = (name.match(/\p{L}/gu) || []).length;
  if (!validChars) return 'Enter a valid name (letters only).';
  if (letterCount < 2) return 'Name must have at least 2 letters.';
  return '';
};

export default function PosCart({ cart, orderType, setOrderType, onUpdateQty, onRemoveItem, onClearCart, isCartOpen, onClose, onOrderPlaced, onUpdateItem }) {
  const [editingSlipIndex, setEditingSlipIndex] = useState(null);
  const [isDiscountsOpen, setIsDiscountsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [ereceiptData, setEreceiptData] = useState(null); 
  const [expandedCartIndexes, setExpandedCartIndexes] = useState(() => new Set());
  const submissionLockRef = useRef(false);
  const checkoutReservationIdRef = useRef(sessionStorage.getItem(POS_CHECKOUT_RESERVATION_KEY) || null);

  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);

  const showToast = (message, type = 'error') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const [additionalCharge, setAdditionalCharge] = useState(() => localStorage.getItem('pos_additionalCharge') || '');
  const [additionalChargeReason, setAdditionalChargeReason] = useState(() => localStorage.getItem('pos_additionalChargeReason') || '');
  const [discountName, setDiscountName] = useState(() => localStorage.getItem('pos_discountName') || '');
  const [discountPercentage, setDiscountPercentage] = useState(() => localStorage.getItem('pos_discountPercentage') || '');
  const [paymentMode, setPaymentMode] = useState(() => localStorage.getItem('pos_paymentMode') || 'Full Payment'); 

  const hasPreOrder = cart.some(item => (item.fulfillmentType || orderType) === 'Pre-Order');
  const hasBuyNow = cart.some(item => (item.fulfillmentType || orderType) === 'Buy Now');
  const mixedFulfillment = hasPreOrder && hasBuyNow;
  

  const buyNowIssue = cart.length > 0 ? findStockIssue(cart, 'Buy Now') : null;
  const preOrderIssue = cart.length > 0 ? findStockIssue(cart, 'Pre-Order') : null;
  const currentTypeIssue = orderType === 'Buy Now' ? buyNowIssue : preOrderIssue;

  const prevCartLength = useRef(cart.length);

  const showLimitToast = (message) => showToast(message, 'error');

  const toggleCartItemExpanded = (index) => {
    setExpandedCartIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleUpdateQty = (idx, delta) => {
    const item = cart[idx];

    const itemOrderType = item.fulfillmentType || orderType;
    if (delta > 0 && isQuantityTracked(item, itemOrderType)) {
      const currentQtyInCart = cart
        .filter(i => i.id === item.id && (i.fulfillmentType || orderType) === itemOrderType)
        .reduce((sum, i) => sum + i.qty, 0);
      const limit = getQuantityLimit(item, itemOrderType);

      if (currentQtyInCart + delta > limit) {
        showLimitToast(`Sorry, you've reached the available limit for "${item.name}".`);
        return;
      }
    }

    onUpdateQty(idx, delta);
  };

  useEffect(() => {
    if (cart.length > prevCartLength.current || cart.length === 0) {
      if (cart.length === 0) {
        setOrderType('Buy Now');
      }
    }
    prevCartLength.current = cart.length;
  }, [cart.length, setOrderType]);

  useEffect(() => {
    if (!hasPreOrder && paymentMode !== 'Full Payment') {
      setPaymentMode('Full Payment');
    }
  }, [hasPreOrder, paymentMode]);

  const hasStrictPreOrder = cart.some(item => (item.fulfillmentType || orderType) === 'Pre-Order' && item.order_type === 'Pre-order');
  const minPreOrderDate = addDaysToDateString(getLiveNow().dateStr, hasStrictPreOrder ? 3 : 1);

  const [form, setForm] = useState(() => {
    const savedForm = localStorage.getItem('pos_form');
    if (savedForm) return JSON.parse(savedForm);
    return {
      name: '',
      phone: '',
      altPhone: '',
      pickupDate: orderType === 'Buy Now' ? getLiveNow().dateStr : '',
      pickupTime: '',
      instructions: '',
    };
  });

  useEffect(() => { localStorage.setItem('pos_form', JSON.stringify(form)); }, [form]);
  useEffect(() => { localStorage.setItem('pos_additionalCharge', additionalCharge); }, [additionalCharge]);
  useEffect(() => { localStorage.setItem('pos_additionalChargeReason', additionalChargeReason); }, [additionalChargeReason]);
  useEffect(() => { localStorage.setItem('pos_discountName', discountName); }, [discountName]);
  useEffect(() => { localStorage.setItem('pos_discountPercentage', discountPercentage); }, [discountPercentage]);
  useEffect(() => { localStorage.setItem('pos_paymentMode', paymentMode); }, [paymentMode]);

  useEffect(() => {
    if (!hasPreOrder) {
      const { dateStr } = getLiveNow();
      setForm(f => ({ ...f, pickupDate: dateStr, pickupTime: '' }));
    } else if (!form.pickupDate || form.pickupDate < minPreOrderDate) {
      setForm(f => ({ ...f, pickupDate: minPreOrderDate, pickupTime: '' }));
    }
  }, [hasPreOrder, minPreOrderDate]);

  useEffect(() => {
    if (hasPreOrder) return;
    const sync = () => {
      const { dateStr } = getLiveNow();
      setForm(f => (f.pickupDate === dateStr ? f : { ...f, pickupDate: dateStr }));
    };
    sync();
    const id = setInterval(sync, 30000);
    return () => clearInterval(id);
  }, [hasPreOrder]);

  const handleProceedToOrder = () => {
    if (cart.length === 0) return;
    setShowSummaryModal(true);
  };

  const computeFormErrors = () => {
    const errors = {};


    if (hasPreOrder) {
      const nameErr = getNameError(form.name, true);
      if (nameErr) errors.name = nameErr;
      if (!form.pickupDate) errors.pickupDate = 'Please select a date.';
      if (!form.pickupTime) errors.pickupTime = 'Please select a time.';
    }
    else if (form.name && form.name.trim()) {
      const nameErr = getNameError(form.name, false);
      if (nameErr) errors.name = nameErr;
    }
    if (hasPreOrder || form.phone) {
      if (!form.phone) errors.phone = 'Phone number is required.';
      else if (!PH_MOBILE_REGEX.test(form.phone)) errors.phone = 'Must start with 09 (11 digits).';
    }
    if (form.altPhone && !PH_MOBILE_REGEX.test(form.altPhone)) {
      errors.altPhone = 'Must start with 09 (11 digits).';
    }
    if (!hasPreOrder && form.pickupTime) {
      const chosen = TIME_SLOTS.find(s => s.value === form.pickupTime);
      if (isSlotPast(chosen, orderType)) {
        errors.pickupTime = 'That time slot has already passed. Please choose another.';
      }
    }
    if ((Number(additionalCharge) || 0) > 0 && !additionalChargeReason.trim()) {
      errors.additionalChargeReason = 'Please provide a reason for the additional charge.';
    }
    return errors;
  };

  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    setFormErrors(prev => {
      if (Object.keys(prev).length === 0) return prev;
      const latest = computeFormErrors();
      const next = {};
      Object.keys(prev).forEach(k => { if (latest[k]) next[k] = latest[k]; });
      return Object.keys(next).length === Object.keys(prev).length &&
        Object.keys(next).every(k => next[k] === prev[k]) ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, orderType, hasPreOrder, additionalCharge, additionalChargeReason]);

  const validateOrderForm = () => {
    const errors = computeFormErrors();
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePlaceOrder = async () => {
    if (submissionLockRef.current || isProcessing) return;
    submissionLockRef.current = true;

    const stockIssue = findStockIssue(cart, 'Buy Now') || findStockIssue(cart, 'Pre-Order');
    if (stockIssue) {
      submissionLockRef.current = false;
      const issueType = cart.some(item => (item.fulfillmentType || orderType) === 'Buy Now' && item.name === stockIssue.name) ? 'Buy Now' : 'Pre-Order';
      showToast(stockIssueMessage(stockIssue, issueType), 'error');
      return;
    }

    const missingImages = cart.flatMap(item =>
      findMissingRequiredSlipImages(item).map(label => `${item.name}: ${label}`)
    );
    if (missingImages.length > 0) {
      submissionLockRef.current = false;
      showToast(`Please add the required photo(s) — ${missingImages.join(', ')}.`, 'error');
      return;
    }

    setIsProcessing(true);

    const totalUploads = cart.reduce(
      (n, it) => n + countReferenceFiles(it.inspiration_image) + countSlipFiles(it.order_slip_details), 0
    );
    let doneUploads = 0;
    const tickUpload = () => {
      doneUploads += 1;
      setUploadProgress({ phase: 'uploading', done: doneUploads, total: totalUploads });
    };
    setUploadProgress(totalUploads > 0 ? { phase: 'uploading', done: 0, total: totalUploads } : null);

    const updatedCart = [...cart];
    for (let i = 0; i < updatedCart.length; i++) {
      const img = updatedCart[i].inspiration_image;

      if (img instanceof File) {
        const formData = new FormData();
        formData.append('image', img);
        try {
          const uploadRes = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/upload-inspiration`, {
            method: 'POST',
            body: formData,
          });
          const uploadData = await uploadRes.json();
          if (uploadData.success) {
            updatedCart[i].inspiration_url = uploadData.url;
          }
        } catch (err) {
          console.error('Item image upload error:', err);
        }
        tickUpload();
      } else if (img && typeof img === 'object') {
        const urls = {};
        for (const [productId, file] of Object.entries(img)) {
          if (!(file instanceof File)) continue;
          const formData = new FormData();
          formData.append('image', file);
          try {
            const uploadRes = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/upload-inspiration`, {
              method: 'POST',
              body: formData,
            });
            const uploadData = await uploadRes.json();
            if (uploadData.success) {
              urls[productId] = uploadData.url;
            }
          } catch (err) {
            console.error(`Bundle item image upload error (product ${productId}):`, err);
          }
          tickUpload();
        }
        if (Object.keys(urls).length > 0) {
          updatedCart[i].inspiration_urls = urls;
        }
      }
    }

    try {
      for (let i = 0; i < updatedCart.length; i++) {
        const slip = updatedCart[i].order_slip_details;
        if (slipHasFiles(slip)) {
          updatedCart[i] = { ...updatedCart[i], order_slip_details: await uploadSlipImages(slip, tickUpload) };
        }
      }
    } catch (err) {
      console.error('Order slip image upload error:', err);
      setIsProcessing(false);
      setUploadProgress(null);
      submissionLockRef.current = false;
      showToast(err.message || 'Image upload failed. Please try again.', 'error');
      return;
    }

    if (totalUploads > 0) setUploadProgress({ phase: 'saving' });

    const formattedItems = updatedCart.map(item => {
      if (item.type === 'bundle') {
        return {
          fulfillmentType: item.fulfillmentType || orderType,
          type: 'bundle',
          bundleId: item.bundleId,
          quantity: item.qty,
          orderSlip: pruneEmptySlipAnswers(item.order_slip_details) || {},
          specialInstructions: item.details || '',
          inspirationUrls: item.inspiration_urls || null
        };
      }
      if (item.type === 'package') {
        return {
          fulfillmentType: item.fulfillmentType || orderType,
          type: 'package',
          packageId: item.packageId,
          quantity: item.qty,
          orderSlip: pruneEmptySlipAnswers(item.order_slip_details) || {},
          specialInstructions: item.details || '',
          inspirationUrls: item.inspiration_urls || null
        };
      }
      return {
        fulfillmentType: item.fulfillmentType || orderType,
        productId: item.id,
        name: item.name,
        quantity: item.qty,
        unitPrice: item.price,
        subtotal: item.price * item.qty,
        orderSlip: pruneEmptySlipAnswers(item.order_slip_details) || null,
        selectedPriceOptions: item.selected_price_options || null,
        specialInstructions: item.details || '',
        inspirationUrl: item.inspiration_url || null
      };
    });

    const subtotalCalc = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const percentageNumberVal = Number(discountPercentage) || 0;
    const discountAmountCalc = subtotalCalc * (percentageNumberVal / 100);
    const chargeAmountCalc = Number(additionalCharge) || 0;
    const buyNowSubtotal = cart.filter(i => (i.fulfillmentType || orderType) === 'Buy Now').reduce((sum, i) => sum + i.price * i.qty, 0);
    const preOrderSubtotal = cart.filter(i => (i.fulfillmentType || orderType) === 'Pre-Order').reduce((sum, i) => sum + i.price * i.qty, 0);
    const preOrderShare = subtotalCalc > 0 ? preOrderSubtotal / subtotalCalc : (hasPreOrder ? 1 : 0);
    const preOrderDiscount = discountAmountCalc * preOrderShare;
    const buyNowDiscount = discountAmountCalc - preOrderDiscount;
    const preOrderCharge = chargeAmountCalc * preOrderShare;
    const buyNowCharge = chargeAmountCalc - preOrderCharge;
    const buyNowTotal = Math.max(0, buyNowSubtotal - buyNowDiscount + buyNowCharge);
    const preOrderTotal = Math.max(0, preOrderSubtotal - preOrderDiscount + preOrderCharge);
    const preOrderDue = paymentMode === '50% Deposit' && hasPreOrder ? Math.ceil(preOrderTotal / 2) : preOrderTotal;
    const grandTotalCalc = buyNowTotal + preOrderTotal;
    const amountDueCalc = buyNowTotal + preOrderDue;
    const calculatedTotal = grandTotalCalc;
    const discountPayload = percentageNumberVal > 0
      ? {
          name: discountName || 'Discount',
          percentage: percentageNumberVal,
          amount: discountAmountCalc,
        }
      : {};
    const additionalChargeDetails = chargeAmountCalc > 0
      ? { amount: chargeAmountCalc, reason: additionalChargeReason.trim() }
      : {};
    const buildGroupPayment = (type, groupSubtotal, groupDiscount, groupCharge, groupTotal) => {
      const deposit = type === 'Pre-Order' && paymentMode === '50% Deposit';
      const dueNow = deposit ? Math.ceil(groupTotal / 2) : groupTotal;
      return {
        subtotal: groupSubtotal,
        grandTotal: groupTotal,
        type: deposit ? '50% Deposit' : 'Full Payment',
        amountDueNow: dueNow,
        balance: groupTotal - dueNow,
        discount: percentageNumberVal > 0 ? { name: discountName || 'Discount', percentage: percentageNumberVal, amount: groupDiscount } : {},
        additionalCharge: groupCharge,
        additionalChargeDetails: groupCharge > 0 ? { amount: groupCharge, reason: additionalChargeReason.trim() } : {},
      };
    };
    const groupPayments = {
      'Buy Now': buildGroupPayment('Buy Now', buyNowSubtotal, buyNowDiscount, buyNowCharge, buyNowTotal),
      'Pre-Order': buildGroupPayment('Pre-Order', preOrderSubtotal, preOrderDiscount, preOrderCharge, preOrderTotal),
    };

    const selectedSlot = TIME_SLOTS.find(s => s.value === form.pickupTime);
    const livePickupDate = hasPreOrder ? form.pickupDate : getLiveNow().dateStr;
    const isWalkIn = !hasPreOrder && !form.pickupTime;

    const payload = {
      checkoutReservationId: checkoutReservationIdRef.current || (checkoutReservationIdRef.current = crypto.randomUUID()),
      transactionGroupId: checkoutReservationIdRef.current || crypto.randomUUID(),
      orderType: mixedFulfillment ? 'Mixed' : hasPreOrder ? 'Pre-Order' : 'Buy Now',
      groupPayments,
      customer: { name: form.name, phone: form.phone, altPhone: form.altPhone },
      payment: {
        subtotal: subtotalCalc,
        grandTotal: grandTotalCalc,
        type: mixedFulfillment ? 'Mixed' : paymentMode,
        amountDueNow: amountDueCalc,
        balance: grandTotalCalc - amountDueCalc,
        discount: discountPayload,
        additionalCharge: chargeAmountCalc,
        additionalChargeDetails
      },
      pickup: {
        date: livePickupDate,
        time: selectedSlot?.start || '',
        timeEnd: selectedSlot?.end || '',
        timeSlot: form.pickupTime,
        timeLabel: isWalkIn ? 'Walk-in' : (selectedSlot?.label || '')
      },
      specialInstructions: form.instructions || '',
      items: formattedItems
    };

    try {
      sessionStorage.setItem(POS_CHECKOUT_RESERVATION_KEY, payload.checkoutReservationId);
      const token = localStorage.getItem('token'); 
      const response = await fetch(`${import.meta.env.VITE_API_URL}/pos/walk-in_orders`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        const error = new Error(result.message || 'Failed to process order');
        error.status = response.status;
        throw error;
      }

      setShowSummaryModal(false);

      const isScheduledBuyNow = orderType === 'Buy Now' && Boolean(form.name) && Boolean(form.phone) && Boolean(form.pickupTime);
      const shouldShowEreceipt = mixedFulfillment || orderType === 'Pre-Order' || isScheduledBuyNow;

      if (shouldShowEreceipt) {
        const mixedOrders = Array.isArray(result.data.orders) ? result.data.orders : [];
        const transactionBreakdown = mixedFulfillment
          ? mixedOrders.map(order => ({
              orderType: order.order_type,
              orderNumber: order.order_number,
              grandTotal: Number(order.grand_total || 0),
              amountPaid: Number(order.amount_paid || 0),
              balance: Number(order.balance || 0),
              paymentType: order.payment_type,
              status: order.status,
            }))
          : [];
        setEreceiptData({
          orderId: result.data.id,
          orderNumber: result.data.order_number,
          transactionId: result.data.transactionId || result.data.transactionGroupId || result.data.transaction_group_id,
          cart: cart.map(i => ({ name: i.name, qty: i.qty, price: i.price, orderType: i.fulfillmentType || orderType })),
          totalAmount: result.data.grandTotal ?? result.data.grand_total ?? grandTotalCalc,
          amountPaid: result.data.amountPaid ?? result.data.amount_paid,
          balance: result.data.balance,
          transactionBreakdown,
          paymentType: mixedFulfillment
            ? 'mixed'
            : result.data.payment_type === 'deposit' ? 'half' : 'full',
          pickupDate: livePickupDate ? formatDateLong(livePickupDate) : '',
          pickupTime: getSlotLabel(form.pickupTime),
          confirmToken: result.data.receiptToken,
        });
      } else {
        showToast(`Order successful! Order Ref: ${result.data.order_number}`, 'success');
      }

      onClearCart();
      checkoutReservationIdRef.current = null;
      sessionStorage.removeItem(POS_CHECKOUT_RESERVATION_KEY);
      window.dispatchEvent(new CustomEvent('cake:data-changed', {
        detail: { table: 'orders', event: 'INSERT', recordId: result.data.id, action: 'created', source: 'pos' }
      }));

      if (typeof onOrderPlaced === 'function') onOrderPlaced();

      setForm({ name: '', phone: '', altPhone: '', pickupDate: getLiveNow().dateStr, pickupTime: '', instructions: '' });
      setFormErrors({});
      setAdditionalCharge('');
      setAdditionalChargeReason('');
      setDiscountName('');
      setDiscountPercentage('');
      setPaymentMode('Full Payment');
      
      localStorage.removeItem('pos_orderType');
      localStorage.removeItem('pos_form');
      localStorage.removeItem('pos_additionalCharge');
      localStorage.removeItem('pos_additionalChargeReason');
      localStorage.removeItem('pos_discountName');
      localStorage.removeItem('pos_discountPercentage');
      localStorage.removeItem('pos_paymentMode');

      if(isCartOpen && typeof onClose === 'function') onClose();

    } catch (error) {
      console.error('Checkout error:', error);
      if (error.status === 409) {
        checkoutReservationIdRef.current = null;
        sessionStorage.removeItem(POS_CHECKOUT_RESERVATION_KEY);
      }
      showToast(getOrderErrorMessage(error), 'error');
    } finally {
      setIsProcessing(false);
      setUploadProgress(null);
      submissionLockRef.current = false;
    }
  };

  const handleToggleDiscounts = () => {
    if (cart.length === 0) return;
    setIsDiscountsOpen(s => !s);
  };

  const handleAdditionalChargeChange = (rawValue) => {
    const sanitized = sanitizeNumericText(rawValue);
    if (sanitized === '') {
      setAdditionalCharge('');
      return;
    }

    setAdditionalCharge(String(Math.min(Number(sanitized), MAX_COST)));
  };

  const adjustAdditionalCharge = (delta) => {
    const nextValue = Math.max(0, Math.min(Number(additionalCharge || 0) + delta, MAX_COST));
    setAdditionalCharge(String(nextValue));
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const percentageNumber = Number(discountPercentage) || 0;
  const discountAmount = subtotal * (percentageNumber / 100);
  const chargeAmount = Number(additionalCharge) || 0;
  const buyNowSubtotal = cart.filter(i => (i.fulfillmentType || orderType) === 'Buy Now').reduce((sum, i) => sum + i.price * i.qty, 0);
  const preOrderSubtotal = cart.filter(i => (i.fulfillmentType || orderType) === 'Pre-Order').reduce((sum, i) => sum + i.price * i.qty, 0);
  const preOrderShare = subtotal > 0 ? preOrderSubtotal / subtotal : (hasPreOrder ? 1 : 0);
  const preOrderTotal = Math.max(0, preOrderSubtotal - discountAmount * preOrderShare + chargeAmount * preOrderShare);
  const buyNowTotal = Math.max(0, buyNowSubtotal - discountAmount * (1 - preOrderShare) + chargeAmount * (1 - preOrderShare));
  const cartTotal = buyNowTotal + preOrderTotal;
  const amountDue = buyNowTotal + (hasPreOrder && paymentMode === '50% Deposit' ? Math.ceil(preOrderTotal / 2) : preOrderTotal);

  return (
    <>
      {toast && (
        <div
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-[6000] flex items-center gap-2.5 text-white text-xs sm:text-sm font-semibold px-4 sm:px-5 py-3 rounded-xl shadow-lg max-w-[92vw] sm:max-w-md animate-in fade-in slide-in-from-top-4 duration-200 ${
            toast.type === 'error' ? 'bg-red-600' : toast.type === 'success' ? 'bg-[#15803D]' : 'bg-[#3B1F0A]'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-white/70 shrink-0" />
          <span className="leading-snug">{toast.message}</span>
        </div>
      )}

      {isCartOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[1000] lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <div className={`
        fixed inset-y-0 right-0 z-[1010] w-[85%] max-w-[400px] sm:w-[400px] bg-white shadow-2xl flex flex-col shrink-0 h-[100dvh] max-h-[100dvh] overflow-hidden 
        transform transition-transform duration-300 ease-in-out will-change-transform
        ${isCartOpen ? 'translate-x-0' : 'translate-x-full'}
        lg:static lg:translate-x-0 lg:w-[400px] lg:min-w-[400px] lg:max-w-[400px] lg:rounded-3xl lg:border lg:border-[#EAE4E0] lg:shadow-sm lg:z-auto lg:h-full lg:max-h-full
      `}>
        
        <div className="flex items-center justify-between p-4 border-b border-[#F1EBE6] lg:hidden shrink-0 bg-white">
          <h2 className="font-serif text-lg text-[#3B1F0A] font-bold">Your Order</h2>
          <button 
            onClick={onClose} 
            className="w-8 h-8 rounded-full bg-[#F5EFEB] flex items-center justify-center text-[#8A7264] hover:text-[#3B1F0A] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-[#F1EBE6] shrink-0">
          <div className="flex bg-[#F5EFEB] rounded-xl p-1 w-full gap-1">
            <button
              onClick={() => {
                setOrderType('Buy Now');
              }}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                orderType === 'Buy Now' ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'
              }`}
            >
              Buy Now
            </button>
            <button
              onClick={() => {
                setOrderType('Pre-Order');
              }}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                orderType === 'Pre-Order' ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'
              }`}
            >
              Pre-Order
            </button>
          </div>
          {currentTypeIssue && (
            <p className="mt-1.5 text-[11px] font-semibold text-red-600">{stockIssueMessage(currentTypeIssue, orderType)}</p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin">
          <div className="shrink-0 border-b border-[#F1EBE6] bg-[#FCFAF9]">
            <button 
              onClick={handleToggleDiscounts}
              disabled={cart.length === 0}
              className={`w-full flex items-center justify-between px-5 py-3 transition-colors ${
                cart.length === 0 ? 'cursor-not-allowed opacity-50' : 'hover:bg-[#F5EFEB]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-[#8A7264]" />
                <span className="text-xs font-semibold text-[#8A7264]">Price Adjustments</span>
              </div>
              {isDiscountsOpen && cart.length > 0 ? <ChevronUp size={16} className="text-[#8A7264]" /> : <ChevronDown size={16} className="text-[#8A7264]" />}
            </button>

            {isDiscountsOpen && cart.length > 0 && (
              <div className="px-5 pb-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#4A3B36]">Additional Charge</label>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={formatNumberLive(additionalCharge)}
                      onChange={(e) => handleAdditionalChargeChange(e.target.value)}
                      className="w-32 sm:w-36 border border-[#EAE4E0] rounded-xl px-3 py-2 pr-7 text-right text-xs text-[#3B1F0A] focus:outline-none focus:border-[#5A453C] bg-white transition-colors"
                    />
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex flex-col text-[#8A7264]">
                      <ChevronUp size={12} className="cursor-pointer hover:text-[#5A453C]" onClick={() => adjustAdditionalCharge(1)} />
                      <ChevronDown size={12} className="cursor-pointer hover:text-[#5A453C]" onClick={() => adjustAdditionalCharge(-1)} />
                    </div>
                  </div>
                </div>
                {Number(additionalCharge) > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-[#4A3B36] mb-1">Reason for Additional Charge *</label>
                    <input
                      type="text"
                      placeholder="e.g. Rush order, delivery"
                      value={additionalChargeReason}
                      onChange={(e) => setAdditionalChargeReason(e.target.value)}
                      className={`w-full border rounded-xl px-3 py-2 text-xs text-[#3B1F0A] focus:outline-none focus:border-[#5A453C] bg-white transition-colors ${
                        formErrors.additionalChargeReason ? 'border-red-400' : 'border-[#EAE4E0]'
                      }`}
                    />
                    {formErrors.additionalChargeReason && (
                      <p className="mt-1 text-[11px] text-red-600">{formErrors.additionalChargeReason}</p>
                    )}
                  </div>
                )}
                
                <div className="border-t border-[#F1EBE6]"></div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[#4A3B36] whitespace-nowrap">Discount</label>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input 
                      type="text" 
                      placeholder="Name (e.g. Senior)"
                      value={discountName}
                      onChange={(e) => setDiscountName(e.target.value)}
                      className="flex-1 sm:w-32 min-w-0 border border-[#EAE4E0] rounded-xl px-3 py-2 text-xs text-[#3B1F0A] focus:outline-none focus:border-[#5A453C] bg-white transition-colors"
                    />
                    <input 
                      type="number" 
                      min="0"
                      max="100"
                      placeholder="%"
                      value={discountPercentage}
                      onChange={(e) => setDiscountPercentage(e.target.value)}
                      className="w-16 shrink-0 border border-[#EAE4E0] rounded-xl px-3 py-2 text-xs text-[#3B1F0A] text-right focus:outline-none focus:border-[#5A453C] bg-white transition-colors"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-b border-[#F1EBE6] shrink-0 flex justify-between items-center bg-white">
            <h3 className="font-serif text-sm text-[#8A7264] font-semibold">Cart Items</h3>
            <span className="text-[11px] text-[#8A7264]">{cart.length} items</span>
          </div>

          <div className="p-5 flex flex-col gap-4 bg-white">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-[#B7A99F] gap-2 opacity-60">
                <ShoppingCart size={32} />
                <p className="text-xs">No items yet. Select from the menu.</p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={idx} className="relative overflow-hidden rounded-xl border-b border-[#F1EBE6] last:border-0">
                  <div className="flex justify-between items-start gap-3 pb-4 last:pb-0 bg-white">
                    <div className="flex-1 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleCartItemExpanded(idx)}
                        className="w-full flex items-center justify-between gap-2 text-left"
                      >
                        <span className="font-semibold text-sm text-[#3B1F0A] truncate">{item.name}</span>
                        {expandedCartIndexes.has(idx) ? <ChevronUp size={15} className="text-[#8A7264] shrink-0" /> : <ChevronDown size={15} className="text-[#8A7264] shrink-0" />}
                      </button>
                      <span className={`inline-flex mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        (item.fulfillmentType || orderType) === 'Pre-Order'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {(item.fulfillmentType || orderType) === 'Pre-Order' ? 'PRE-ORDER' : 'BUY NOW'}
                      </span>
                      {!expandedCartIndexes.has(idx) && <p className="text-[10px] text-[#8A7264] mt-0.5">Qty {formatCount(item.qty)}</p>}
                      {expandedCartIndexes.has(idx) && item.details && <p className="text-[10px] text-[#8A7264] leading-snug mt-0.5 max-w-[200px] truncate">Note: {item.details}</p>}

                      {expandedCartIndexes.has(idx) && item.selected_price_options && Object.entries(item.selected_price_options).map(([key, val]) => (
                        <p key={`opt-${key}`} className="text-[11px] text-[#8A7264] mt-0.5 leading-snug">
                          <span className="font-medium">{key}:</span> {val}
                        </p>
                      ))}

                      {expandedCartIndexes.has(idx) && (item.type === 'bundle' || item.type === 'package') && item.order_slip_details ? (
                        <p className="text-[11px] text-[#8A7264] mt-0.5 leading-snug line-clamp-2">
                          <span className="font-medium">Includes:</span>{' '}
                          {Object.keys(item.order_slip_details)
                            .map(prodId => item.products?.find(p => p.id === prodId)?.name || 'Item')
                            .join(', ')}
                        </p>
                      ) : (
                        expandedCartIndexes.has(idx) && item.order_slip_details && Object.keys(item.order_slip_details).length > 0 && (
                          <p className="text-[11px] font-semibold text-[#8A7264] mt-0.5">Customized</p>
                        )
                      )}

                      {expandedCartIndexes.has(idx) && (item.order_slip_fields?.length > 0 || item.allow_file_upload || item.products?.some(p => p.order_slip_fields?.length || p.allow_file_upload) || item.package_components?.some(p => p.order_slip_fields?.length || p.allow_file_upload)) && onUpdateItem && (
                        <button type="button" onClick={() => setEditingSlipIndex(idx)} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#DED4CC] px-3 py-1.5 text-[11px] font-semibold text-[#5A453C] hover:bg-[#F5EFEB]"><Pencil size={12}/>Edit order slip</button>
                      )}

                      <div className="flex items-center gap-2 mt-2">
                        <button onClick={() => handleUpdateQty(idx, -1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Minus size={12} /></button>
                        <span className="font-mono text-xs w-4 text-center">{formatCount(item.qty)}</span>
                        <button onClick={() => handleUpdateQty(idx, 1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Plus size={12} /></button>
                      </div>
                    </div>

                    {/* Presyo sa itaas, Delete Button sa mismong BABA ng presyo */}
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="font-semibold text-sm text-[#5A453C]">{formatPeso(item.price * item.qty)}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveItem?.(idx)}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
                        aria-label={`Remove ${item.name}`}
                        title="Remove item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[#EAE4E0] bg-[#FCFAF9] shrink-0">
          <div className="flex flex-col gap-1 mb-2">
            {mixedFulfillment && (
              <>
                <div className="flex items-center justify-between text-[11px] text-[#8A7264]">
                  <span>Buy Now total (Full Payment)</span>
                  <span className="font-semibold">{formatPeso(buyNowTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#8A7264]">
                  <span>Pre-Order total ({paymentMode === '50% Deposit' ? '50% Deposit' : 'Full Payment'})</span>
                  <span className="font-semibold">{formatPeso(preOrderTotal)}</span>
                </div>
              </>
            )}
            {(discountAmount > 0 || chargeAmount > 0) && (
              <div className="flex items-center justify-between text-[11px] text-[#8A7264]">
                <span>Subtotal</span>
                <span>{formatPeso(subtotal)}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-[11px] text-green-600">
                <span>{discountName ? `${discountName} (${percentageNumber}%)` : `Discount (${percentageNumber}%)`}</span>
                <span>-{formatPeso(discountAmount)}</span>
              </div>
            )}
            {chargeAmount > 0 && (
              <div className="flex items-center justify-between text-[11px] text-red-500">
                <span>Additional Charge</span>
                <span>+{formatPeso(chargeAmount)}</span>
              </div>
            )}
            
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs font-semibold text-[#8A7264]">Grand Total</span>
              <span className="font-serif text-base text-[#8A7264] font-semibold">{formatPeso(cartTotal)}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-2 pt-3 border-t border-[#EAE4E0] mb-3">
            <div className="flex bg-[#F5EFEB] rounded-lg p-1 gap-1 shrink-0">
              {(hasPreOrder ? ['Full Payment', '50% Deposit'] : ['Full Payment']).map(mode => (
                <button
                  key={mode}
                  onClick={() => setPaymentMode(mode)}
                  className={`px-3 py-2 text-[11px] font-semibold rounded-md whitespace-nowrap transition-colors ${
                    paymentMode === mode ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'
                  }`}
                >
                  {mode === '50% Deposit' ? '50% Deposit' : 'Full Payment'}
                </button>
              ))}
            </div>

            <div className="flex flex-col items-end gap-0 min-w-0">
              <span className="text-[10px] font-semibold text-[#8A7264] shrink-0">Amount Due</span>
              <span className="font-serif text-lg text-[#3B1F0A] font-semibold truncate">{formatPeso(amountDue)}</span>
            </div>
          </div>

          <button 
            onClick={handleProceedToOrder}
            disabled={cart.length === 0 || isProcessing}
            className="w-full bg-[#3B1F0A] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#2A1608] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Continue
          </button>
        </div>

        <OrderSummaryModal
          show={showSummaryModal}
          onBack={() => { setShowSummaryModal(false); setFormErrors({}); }}
          cart={cart}
          orderType={orderType}
          hasPreOrder={hasPreOrder}
          hasBuyNow={hasBuyNow}
          form={form}
          setForm={setForm}
          minPreOrderDate={minPreOrderDate}
          paymentMode={paymentMode}
          discountName={discountName}
          percentageNumber={percentageNumber}
          discountAmount={discountAmount}
          chargeAmount={chargeAmount}
          subtotal={subtotal}
          cartTotal={cartTotal}
          amountDue={amountDue}
          buyNowTotal={buyNowTotal}
          preOrderTotal={preOrderTotal}
          isProcessing={isProcessing}
          onPlaceOrder={handlePlaceOrder}
          uploadProgress={uploadProgress}
          onValidate={validateOrderForm}
          errors={formErrors}
        />
        {editingSlipIndex !== null && cart[editingSlipIndex] && (
          <CartOrderSlipEditor
            item={cart[editingSlipIndex]}
            onClose={() => setEditingSlipIndex(null)}
            onSave={(slip, inspiration) => onUpdateItem?.(editingSlipIndex, { order_slip_details: slip, inspiration_image: inspiration })}
          />
        )}

        {ereceiptData && createPortal(
          <PosEReceipt
            {...ereceiptData}
            onClose={() => setEreceiptData(null)}
          />,
          document.body
        )}
      </div>
    </>
  );
}
