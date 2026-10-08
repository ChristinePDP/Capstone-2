import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShoppingCart, Minus, Plus, ChevronDown, ChevronUp, Tag, X, Trash2
} from 'lucide-react';
import PosEReceipt from './posEreceipt';
import OrderSummaryModal, { getLiveNow, addDaysToDateString, formatDateLong, getSlotLabel, isSlotPast, TIME_SLOTS } from './orderSum';
import MultiImageField from '../shared/MultiImageField';
import CartSlipImages from '../shared/CartSlipImages';
import CartReferenceImage from '../shared/CartReferenceImage';
import { countReferenceFiles, countSlipFiles, pruneEmptySlipAnswers, slipHasFiles, uploadSlipImages, findMissingRequiredSlipImages } from '../shared/orderSlipUploads';
import { getOrderErrorMessage } from '../../services/orderErrorMessage';

// ─────────────────────────────────────────────────────────────
// Quantity tracking helpers — same rule used across Menu.jsx, posMenu.jsx,
// and the backend: `daily_limit` is the basis for Pre-order "slots";
// `stock_quantity` is the basis for Pick-up Today produced stock.
// If daily_limit is set (not null, > 0), it wins even when stock_quantity
// is also set.
// ─────────────────────────────────────────────────────────────
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
  // Bundle/Package: limit galing sa components (kinuwenta sa posMenu.jsx).
  if (item.type === 'bundle' || item.type === 'package') {
    if (orderType === 'Buy Now' && item.order_type === 'Pre-order') return 0;
    return orderType === 'Pre-Order'
      ? Number(item.pre_order_available_stock ?? 0)
      : Number(item.buy_now_available_stock ?? 0);
  }
  if (orderType === 'Pre-Order') return item.pre_order_available_stock ?? item.available_stock ?? 0;
  return item.buy_now_available_stock ?? item.available_stock ?? 0;
}

// Unang line ng cart na lumalagpas sa limit ng isang order type (total qty kada
// product id). Ginagamit sa order type toggle at sa huling check bago mag-place order.
function findStockIssue(cartItems = [], type) {
  const qtyById = {};
  cartItems.forEach(i => { qtyById[i.id] = (qtyById[i.id] || 0) + (Number(i.qty) || 0); });
  const seen = new Set();
  for (const item of cartItems) {
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

// In-accept na natin ang isCartOpen at onClose galing sa magulang (PosPage)
export default function PosCart({ cart, orderType, setOrderType, onUpdateQty, onRemoveItem, onClearCart, isCartOpen, onClose, onOrderPlaced, onUpdateItem }) {
  const [isDiscountsOpen, setIsDiscountsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  // { phase: 'uploading', done, total } | { phase: 'saving' } | null — para sa upload progress note
  const [uploadProgress, setUploadProgress] = useState(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [ereceiptData, setEreceiptData] = useState(null); 
  const [expandedCartIndexes, setExpandedCartIndexes] = useState(() => new Set());
  const [openSwipeIndex, setOpenSwipeIndex] = useState(null);
  const swipeStartX = useRef(null);
  const submissionLockRef = useRef(false);

  // FIX (toast): iisang LOCAL na toast bar na ito (walang bagong/hiwalay
  // na file) — ginagamit na ito ngayon PARA SA LAHAT ng dating alert()/
  // blocking-modal na mensahe dito sa loob ng cart (validation errors,
  // checkout errors, stock-limit warning, at order-success message).
  // Simpleng banner sa taas ng screen, walang backdrop/overlay — hindi
  // ito modal, kaya hindi na ito humaharang sa screen tulad ng dating
  // native `alert()` ("localhost says ...").
  const [toast, setToast] = useState(null); // { message, type: 'error' | 'success' | 'info' }
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
  const [discountName, setDiscountName] = useState(() => localStorage.getItem('pos_discountName') || '');
  const [discountPercentage, setDiscountPercentage] = useState(() => localStorage.getItem('pos_discountPercentage') || '');
  const [paymentMode, setPaymentMode] = useState(() => localStorage.getItem('pos_paymentMode') || 'Full Payment'); 

  const hasPreOrder = cart.some(item => item.order_type === 'Pre-order');
  const hasBuyNow = cart.some(item => item.order_type === 'Pick-up Today');
  
  const isPreOrderOnly = hasPreOrder && !hasBuyNow;
  const isBuyNowOnly = hasBuyNow && !hasPreOrder;

  // Alin sa dalawang order type ang hindi kaya ng kasalukuyang cart (stock / pre-order limit)
  const buyNowIssue = cart.length > 0 ? findStockIssue(cart, 'Buy Now') : null;
  const preOrderIssue = cart.length > 0 ? findStockIssue(cart, 'Pre-Order') : null;
  const currentTypeIssue = orderType === 'Buy Now' ? buyNowIssue : preOrderIssue;

  const prevCartLength = useRef(cart.length);

  // Ginagamit ng handleUpdateQty (stock/daily-limit warning) ang parehong
  // LOCAL na toast bar sa itaas.
  const showLimitToast = (message) => showToast(message, 'error');

  const toggleCartItemExpanded = (index) => {
    setExpandedCartIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleCartPointerDown = (event) => {
    swipeStartX.current = event.clientX;
  };

  const handleCartPointerMove = (index, event) => {
    if (swipeStartX.current === null) return;
    const delta = event.clientX - swipeStartX.current;
    if (delta < -40) setOpenSwipeIndex(index);
    else if (delta > 40) setOpenSwipeIndex(null);
  };

  const handleCartPointerUp = () => {
    swipeStartX.current = null;
  };

  // Prevent the background POS screen from scrolling while the Order
  // Summary modal (a `fixed inset-0` overlay) is open — now handled inside
  // OrderSummaryModal (orderSum.jsx) itself since the modal owns its own
  // `show` lifecycle.


  // Kapag pinapataas ang quantity (delta > 0) ng isang tracked item
  // (may daily_limit o stock_quantity), i-block bago pa lumagpas sa
  // available limit — kasama ang ibang cart lines ng parehong product id.
  const handleUpdateQty = (idx, delta) => {
    const item = cart[idx];

    if (delta > 0 && isQuantityTracked(item, orderType)) {
      const currentQtyInCart = cart
        .filter(i => i.id === item.id)
        .reduce((sum, i) => sum + i.qty, 0);
      const limit = getQuantityLimit(item, orderType);

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
      } else if (hasPreOrder && hasBuyNow) {
        setOrderType('Buy Now');
      } else if (isPreOrderOnly) {
        setOrderType('Pre-Order');
      } else if (isBuyNowOnly) {
        setOrderType('Buy Now');
      }
    }
    prevCartLength.current = cart.length;
  }, [cart.length, hasPreOrder, hasBuyNow, isPreOrderOnly, isBuyNowOnly, setOrderType]);

  // Kapag Pre-order lang (o Buy Now lang) ang order type ng laman ng cart,
  // laging naka-force ang order type ng cart — hindi lang kapag nagdagdag ng
  // item (halimbawa kapag nag-restore ang cart/orderType mula localStorage o
  // kapag nagbago ang orderType). Kapag both, same pa rin ang dating logic.
  useEffect(() => {
    if (isPreOrderOnly && orderType !== 'Pre-Order') {
      setOrderType('Pre-Order');
    } else if (isBuyNowOnly && orderType !== 'Buy Now') {
      setOrderType('Buy Now');
    }
  }, [isPreOrderOnly, isBuyNowOnly, orderType, setOrderType]);

  const hasStrictPreOrder = cart.some(item => item.order_type === 'Pre-order');
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
  useEffect(() => { localStorage.setItem('pos_discountName', discountName); }, [discountName]);
  useEffect(() => { localStorage.setItem('pos_discountPercentage', discountPercentage); }, [discountPercentage]);
  useEffect(() => { localStorage.setItem('pos_paymentMode', paymentMode); }, [paymentMode]);

  useEffect(() => {
    if (orderType === 'Buy Now') {
      const { dateStr } = getLiveNow();
      setForm(f => ({ ...f, pickupDate: dateStr, pickupTime: '' }));
    } else {
      setForm(f => ({ ...f, pickupDate: '', pickupTime: '' }));
    }
  }, [orderType]);

  // FIX (stale pickupDate): dati, isang beses lang kinukuha ang petsa ng
  // Buy Now (pag-mount / pagpalit ng orderType). Kapag naiwang bukas ang POS
  // lagpas hatinggabi, kahapon pa rin ang laman ng form. Chine-check na ito
  // kada 30 segundo, at muli sa mismong pag-submit (handlePlaceOrder).
  useEffect(() => {
    if (orderType !== 'Buy Now') return;
    const sync = () => {
      const { dateStr } = getLiveNow();
      setForm(f => (f.pickupDate === dateStr ? f : { ...f, pickupDate: dateStr }));
    };
    sync();
    const id = setInterval(sync, 30000);
    return () => clearInterval(id);
  }, [orderType]);

  // Review Order simply opens the Order Summary modal now — the Customer
  // Details fields (Name, Contact, Pick-up Date/Time) live inside that
  // modal (orderSum.jsx) as an editable form.
  const handleProceedToOrder = () => {
    if (cart.length === 0) return;
    setShowSummaryModal(true);
  };

  // FIX: validation ng required Customer Details fields — hiniwalay ito
  // mula sa pag-submit (handlePlaceOrder). Tinatawag na ito ng
  // OrderSummaryModal (orderSum.jsx) BAGO pa man magpakita ng "Are you
  // sure?" confirm dialog — kaya kapag may kulang pa sa required fields,
  // ang lalabas muna ay ang "Please complete all required fields (*)"
  // toast, hindi ang confirm dialog. Bumabalik ng `true` kung pwede nang
  // magpatuloy, `false` kung may error (may toast na ring lumabas dito).
  // FIX (inline validation): hindi na toast ang ginagamit para sa required
  // Customer Details. Ang bawat field na may mali ay may sariling pulang
  // border + maliit na error message mismo sa ilalim ng field.
  // `computeFormErrors` ay pure function: bumabalik ng { fieldName: message }.
  const computeFormErrors = () => {
    const errors = {};
    const phoneRegex = /^\d{11}$/;

    if (orderType === 'Pre-Order') {
      if (!form.name.trim()) errors.name = 'Customer name is required.';
      if (!form.pickupDate) errors.pickupDate = 'Please select a date.';
      if (!form.pickupTime) errors.pickupTime = 'Please select a time.';
    }
    if (orderType === 'Pre-Order' || form.phone) {
      if (!form.phone) errors.phone = 'Phone number is required.';
      else if (!phoneRegex.test(form.phone)) errors.phone = 'Must be exactly 11 digits.';
    }
    if (form.altPhone && !phoneRegex.test(form.altPhone)) {
      errors.altPhone = 'Must be exactly 11 digits.';
    }
    // Pwedeng 9:25 PM nang piliin ang slot pero 9:35 PM na nang pinindot ang
    // Place Order — i-recheck dito para hindi makalusot ang lipas na slot.
    if (orderType === 'Buy Now' && form.pickupTime) {
      const chosen = TIME_SLOTS.find(s => s.value === form.pickupTime);
      if (isSlotPast(chosen, orderType)) {
        errors.pickupTime = 'That time slot has already passed. Please choose another.';
      }
    }
    return errors;
  };

  const [formErrors, setFormErrors] = useState({});

  // Habang nagta-type ang cashier, mawawala agad ang error ng field na
  // naayos na (at mananatili ang sa mga field na mali pa rin).
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
  }, [form, orderType]);

  // Tinatawag ng OrderSummaryModal bago ang "Are you sure?" confirm dialog.
  // `true` = pwede nang magpatuloy, `false` = may field na may error.
  const validateOrderForm = () => {
    const errors = computeFormErrors();
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePlaceOrder = async () => {
    if (submissionLockRef.current || isProcessing) return;
    submissionLockRef.current = true;

    // Huling stock / pre-order limit check ayon sa napiling order type
    // (nahuhuli rin ang cart na luma na ang limit).
    const stockIssue = findStockIssue(cart, orderType);
    if (stockIssue) {
      submissionLockRef.current = false;
      showToast(stockIssueMessage(stockIssue, orderType), 'error');
      return;
    }

    // Required na Multi-image field na nabura na ang lahat ng larawan sa cart.
    const missingImages = cart.flatMap(item =>
      findMissingRequiredSlipImages(item).map(label => `${item.name}: ${label}`)
    );
    if (missingImages.length > 0) {
      submissionLockRef.current = false;
      showToast(`Please add the required photo(s) — ${missingImages.join(', ')}.`, 'error');
      return;
    }

    setIsProcessing(true);

    // Bilangin ang lahat ng larawang ia-upload para sa progress ("2 of 4").
    const totalUploads = cart.reduce(
      (n, it) => n + countReferenceFiles(it.inspiration_image) + countSlipFiles(it.order_slip_details), 0
    );
    let doneUploads = 0;
    const tickUpload = () => {
      doneUploads += 1;
      setUploadProgress({ phase: 'uploading', done: doneUploads, total: totalUploads });
    };
    setUploadProgress(totalUploads > 0 ? { phase: 'uploading', done: 0, total: totalUploads } : null);

    // FIX: dati'y wala talagang upload step dito kaya kahit may na-attach
    // na larawan ang cashier sa "Upload Reference Image", hindi ito
    // na-uupload sa storage bucket at walang laman ang customer_reference_url
    // sa DB. Same pattern na gaya ng ginagamit ng Online Ordering
    // (Checkout.jsx): i-upload muna ang bawat File sa
    // `/online-ordering/upload-inspiration` bago gawin ang payload — regular
    // product ay iisang File (`inspiration_image`), bundle naman ay
    // `{ [productId]: File }` (isa per component).
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

    // Multi-image order slip fields: i-upload ang bawat File at palitan ng URL
    // sa loob ng order_slip_details (array of URLs, JSONB sa DB).
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

    // FIX: dating ang product ID at price lang ang ipinapasa dito — nawawala
    // ang order_slip_details / selected_price_options na kinukuha na ng
    // PosProductModal (kaya wala talagang na-se-save sa DB kahit may
    // sinasagot na fields ang cashier). Bundle items ay may sariling shape
    // (`type`, `bundleId`) para ma-explode ito ng backend (resolveOrderItems)
    // papunta sa kani-kanilang component product rows — parehong contract
    // gaya ng ginagamit ng Online Ordering checkout.
    const formattedItems = updatedCart.map(item => {
      if (item.type === 'bundle') {
        return {
          type: 'bundle',
          bundleId: item.bundleId,
          quantity: item.qty,
          orderSlip: pruneEmptySlipAnswers(item.order_slip_details) || {},
          specialInstructions: item.details || '',
          // FIX: idinagdag — per-component image URLs, binabasa na ng
          // resolveBundleLineItem sa backend.
          inspirationUrls: item.inspiration_urls || null
        };
      }
      // FIX: dating walang branch para dito, kaya kahit "Package" ang
      // category (may sariling components), nahuhulog ito sa generic
      // branch sa ibaba — walang `type`/`packageId`, kaya hindi ito
      // ine-explode ng backend (resolvePackageLineItem) papunta sa mga
      // component product rows nito, at laging walang laman ang
      // order_slip_details ng bawat component.
      if (item.type === 'package') {
        return {
          type: 'package',
          packageId: item.packageId,
          quantity: item.qty,
          orderSlip: pruneEmptySlipAnswers(item.order_slip_details) || {},
          specialInstructions: item.details || '',
          inspirationUrls: item.inspiration_urls || null
        };
      }
      return {
        productId: item.id,
        name: item.name,
        quantity: item.qty,
        unitPrice: item.price,
        subtotal: item.price * item.qty,
        orderSlip: pruneEmptySlipAnswers(item.order_slip_details) || null,
        selectedPriceOptions: item.selected_price_options || null,
        specialInstructions: item.details || '',
        // FIX: idinagdag — dating wala kaya laging null ang
        // customer_reference_url ng POS orders.
        inspirationUrl: item.inspiration_url || null
      };
    });

    const subtotalCalc = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const percentageNumberVal = Number(discountPercentage) || 0;
    const discountAmountCalc = subtotalCalc * (percentageNumberVal / 100);
    const chargeAmountCalc = Number(additionalCharge) || 0;
    const grandTotalCalc = subtotalCalc - discountAmountCalc + chargeAmountCalc;
    const amountDueCalc = paymentMode === '50% Deposit' ? grandTotalCalc / 2 : grandTotalCalc;

    const discountPayload = percentageNumberVal > 0 ? {
      name: discountName || 'Discount',
      percentage: percentageNumberVal,
      amount: discountAmountCalc
    } : {};

    const selectedSlot = TIME_SLOTS.find(s => s.value === form.pickupTime);
    // FIX: laging bagong petsa ang gamit ng Buy Now sa mismong pag-submit,
    // hindi ang posibleng lumang laman ng form.
    const livePickupDate = orderType === 'Buy Now' ? getLiveNow().dateStr : form.pickupDate;
    // Walk-in (Buy Now na walang piniling slot): kinukuha agad ng customer.
    // Ang pickup_time ay inilalagay ng server (pos.service.js) = oras ng order.
    const isWalkIn = orderType === 'Buy Now' && !form.pickupTime;

    const payload = {
      orderType: orderType,
      customer: { name: form.name, phone: form.phone, altPhone: form.altPhone },
      payment: {
        subtotal: subtotalCalc,
        grandTotal: grandTotalCalc,
        type: paymentMode,
        amountDueNow: amountDueCalc,
        balance: grandTotalCalc - amountDueCalc,
        discount: discountPayload,
        additionalCharge: chargeAmountCalc
      },
      pickup: {
        date: livePickupDate,
        // Walk-in: blangko ang time dito — ang server (Asia/Manila) ang naglalagay ng oras ng order.
        time: selectedSlot?.start || '',
        timeEnd: selectedSlot?.end || '',
        timeSlot: form.pickupTime,
        timeLabel: isWalkIn ? 'Walk-in' : (selectedSlot?.label || '')
      },
      // FIX: order-level Special Instructions (one field, buong order) —
      // katulad ng payload.specialInstructions na ginagamit na ng Online
      // Ordering (Checkout.jsx / onlineOrdering.service.js), hindi na per
      // product/item.
      specialInstructions: form.instructions || '',
      items: formattedItems
    };

    try {
      const token = localStorage.getItem('token'); 
      const response = await fetch(`${import.meta.env.VITE_API_URL}/pos/order`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Failed to process order');

      // FIX (req #4): laging isinasara muna ang Order Summary/Checkout
      // modal BAGO magpasya kung magbubukas ng E-Receipt, kaya hindi
      // kailanman magkasabay na naka-open ang dalawang modal — ang
      // setShowSummaryModal(false) dito ay tumatakbo bago pa man ang
      // if/else sa ibaba, kahit anong resulta (e-receipt man o toast
      // na lang ang lalabas).
      setShowSummaryModal(false);

      // FIX (req #5): ang E-Receipt ay dapat lumabas LANG kapag:
      //   a) Pre-Order (talagang may pickup schedule na dapat i-confirm
      //      pag-uwi ng customer), o
      //   b) Buy Now PERO may kumpletong customer details (name + phone)
      //      AT pumili ng isang Pick-up Time slot — ibig sabihin,
      //      "pick-up later" na order pa rin kahit same-day/"Buy Now",
      //      hindi basta't walk-in na dinadala agad ng customer.
      // Kung Buy Now na walang customer details/pickup time (regular na
      // instant/walk-in sale), toast na lang ang success message — walang
      // dahilan para bigyan pa ito ng QR/e-receipt na wala namang
      // babalikan pang pick-up schedule.
      const isScheduledBuyNow = orderType === 'Buy Now' && Boolean(form.name) && Boolean(form.phone) && Boolean(form.pickupTime);
      const shouldShowEreceipt = orderType === 'Pre-Order' || isScheduledBuyNow;

      if (shouldShowEreceipt) {
        setEreceiptData({
          orderId: result.data.id,
          orderNumber: result.data.order_number,
          cart: cart.map(i => ({ name: i.name, qty: i.qty, price: i.price })),
          totalAmount: result.data.grand_total ?? grandTotalCalc,
          paymentType: result.data.payment_type === 'deposit' ? 'half' : 'full',
          pickupDate: livePickupDate ? formatDateLong(livePickupDate) : '',
          pickupTime: getSlotLabel(form.pickupTime),
          confirmToken: result.data.receiptToken,
        });
      } else {
        showToast(`Order successful! Order Ref: ${result.data.order_number}`, 'success');
      }

      onClearCart();
      window.dispatchEvent(new CustomEvent('cake:data-changed', {
        detail: { table: 'orders', action: 'created', source: 'pos' }
      }));

      // FIX: dati'y hindi nirerefresh ang product list pagkatapos mag-order,
      // kaya kahit nabawasan na ang stock sa DB, tama pa rin ang lumang
      // bilang na nakikita ng cashier hangga't hindi niya ni-reload / lumipat
      // pabalik sa POS page. I-invalidate + i-refetch (force) ang cached
      // products dito para agad ma-reflect ang bagong available_stock.
      if (typeof onOrderPlaced === 'function') onOrderPlaced();

      setForm({ name: '', phone: '', altPhone: '', pickupDate: getLiveNow().dateStr, pickupTime: '', instructions: '' });
      setFormErrors({});
      setAdditionalCharge('');
      setDiscountName('');
      setDiscountPercentage('');
      setPaymentMode('Full Payment');
      
      localStorage.removeItem('pos_orderType');
      localStorage.removeItem('pos_form');
      localStorage.removeItem('pos_additionalCharge');
      localStorage.removeItem('pos_discountName');
      localStorage.removeItem('pos_discountPercentage');
      localStorage.removeItem('pos_paymentMode');

      if(isCartOpen && typeof onClose === 'function') onClose();

    } catch (error) {
      console.error('Checkout error:', error);
      showToast(getOrderErrorMessage(error), 'error');
    } finally {
      setIsProcessing(false);
      setUploadProgress(null);
      submissionLockRef.current = false;
    }
  };

  const handleToggleDiscounts = () => {
    setIsDiscountsOpen(s => !s);
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const percentageNumber = Number(discountPercentage) || 0;
  const discountAmount = subtotal * (percentageNumber / 100);
  const chargeAmount = Number(additionalCharge) || 0;
  const cartTotal = subtotal - discountAmount + chargeAmount;
  const amountDue = paymentMode === '50% Deposit' ? cartTotal / 2 : cartTotal;

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

      {/* Mobile Overlay Background kapag bukas ang Cart */}
      {isCartOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[1000] lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Binago ang outermost wrapper: Dinagdagan ng Off-canvas behaviors para sa mobile.
          FIX: dati'y `h-full` (= 100%) ang gamit dito habang `fixed` ang position — sa
          ibang mobile browsers (lalo na kapag nagbabago ang laki ng address bar), mali
          ang nako-compute na height nito kaya lumalabas ng screen ang footer/Review Order
          button (parang "na-stretch"/nasa labas ng view). Ginamit natin ang `100dvh`
          (dynamic viewport height) na sumusunod sa TALAGANG visible na height ng device,
          plus `max-h-[100dvh]` bilang safety net para hindi na kailanman lumabas ng frame
          ang panel kahit anong mobile device/browser chrome behavior. */}
      <div className={`
        fixed inset-y-0 right-0 z-[1010] w-[85%] max-w-[400px] sm:w-[400px] bg-white shadow-2xl flex flex-col shrink-0 h-[100dvh] max-h-[100dvh] overflow-hidden 
        transform transition-transform duration-300 ease-in-out will-change-transform
        ${isCartOpen ? 'translate-x-0' : 'translate-x-full'}
        lg:static lg:translate-x-0 lg:w-[400px] lg:min-w-[400px] lg:max-w-[400px] lg:rounded-3xl lg:border lg:border-[#EAE4E0] lg:shadow-sm lg:z-auto lg:h-full lg:max-h-full
      `}>
        
        {/* Header Title & Close Button (Exclusive for Mobile) */}
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
                if (isPreOrderOnly) return; 
                if (orderType !== 'Buy Now' && buyNowIssue) {
                  showToast(`Can't switch to Buy Now. ${stockIssueMessage(buyNowIssue, 'Buy Now')}`, 'error');
                  return;
                }
                setOrderType('Buy Now');
              }}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                orderType === 'Buy Now' ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'
              } ${(isPreOrderOnly || (orderType !== 'Buy Now' && buyNowIssue)) ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isPreOrderOnly}
            >
              Buy Now
            </button>
            <button
              onClick={() => {
                if (isBuyNowOnly) return; 
                if (orderType !== 'Pre-Order' && preOrderIssue) {
                  showToast(`Can't switch to Pre-Order. ${stockIssueMessage(preOrderIssue, 'Pre-Order')}`, 'error');
                  return;
                }
                setOrderType('Pre-Order');
              }}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                orderType === 'Pre-Order' ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'
              } ${(isBuyNowOnly || (orderType !== 'Pre-Order' && preOrderIssue)) ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={isBuyNowOnly}
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
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#F5EFEB] transition-colors"
            >
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-[#8A7264]" />
                <span className="text-xs font-semibold text-[#8A7264]">Discounts & Options</span>
              </div>
              {isDiscountsOpen ? <ChevronUp size={16} className="text-[#8A7264]" /> : <ChevronDown size={16} className="text-[#8A7264]" />}
            </button>

            {isDiscountsOpen && (
              <div className="px-5 pb-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#4A3B36]">Additional Charge</label>
                  <div className="relative">
                    <input 
                      type="number" 
                      min="0"
                      placeholder="0"
                      value={additionalCharge}
                      onChange={(e) => setAdditionalCharge(e.target.value)}
                      className="w-24 border border-[#EAE4E0] rounded-xl px-3 py-2 pr-6 text-right text-xs text-[#3B1F0A] focus:outline-none focus:border-[#5A453C] bg-white transition-colors"
                    />
                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex flex-col text-[#8A7264]">
                      <ChevronUp size={12} className="cursor-pointer hover:text-[#5A453C]" onClick={() => setAdditionalCharge(String(Number(additionalCharge) + 1))} />
                      <ChevronDown size={12} className="cursor-pointer hover:text-[#5A453C]" onClick={() => setAdditionalCharge(String(Math.max(0, Number(additionalCharge) - 1)))} />
                    </div>
                  </div>
                </div>
                
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
                  <div className="absolute inset-y-0 right-0 w-20 bg-red-500 flex items-center justify-center lg:hidden">
                    <button
                      type="button"
                      onClick={() => { onRemoveItem?.(idx); setOpenSwipeIndex(null); }}
                      className="h-full w-full flex flex-col items-center justify-center gap-1 text-white"
                      aria-label={`Remove ${item.name}`}
                    >
                      <Trash2 size={18} />
                      <span className="text-[9px] font-bold uppercase tracking-wide">Delete</span>
                    </button>
                  </div>
                  <div
                    className="relative flex justify-between items-start gap-3 pb-4 last:pb-0 bg-white transition-transform duration-200 ease-out touch-pan-y"
                    style={{ transform: openSwipeIndex === idx ? 'translateX(-80px)' : 'translateX(0)' }}
                    onPointerDown={handleCartPointerDown}
                    onPointerMove={(event) => handleCartPointerMove(idx, event)}
                    onPointerUp={handleCartPointerUp}
                    onPointerCancel={handleCartPointerUp}
                  >
                  <div className="flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleCartItemExpanded(idx)}
                      className="w-full flex items-center justify-between gap-2 text-left"
                    >
                      <span className="font-semibold text-sm text-[#3B1F0A] truncate">{item.name}</span>
                      {expandedCartIndexes.has(idx) ? <ChevronUp size={15} className="text-[#8A7264] shrink-0" /> : <ChevronDown size={15} className="text-[#8A7264] shrink-0" />}
                    </button>
                    {!expandedCartIndexes.has(idx) && <p className="text-[10px] text-[#8A7264] mt-0.5">Qty {item.qty}</p>}
                    {expandedCartIndexes.has(idx) && item.details && <p className="text-[10px] text-[#8A7264] leading-snug mt-0.5 max-w-[200px] truncate">Note: {item.details}</p>}

                    {expandedCartIndexes.has(idx) && item.selected_price_options && Object.entries(item.selected_price_options).map(([key, val]) => (
                      <p key={`opt-${key}`} className="text-[11px] text-[#8A7264] mt-0.5 leading-snug">
                        <span className="font-medium">{key}:</span> {val}
                      </p>
                    ))}

                    {/* FIX (cart declutter): dati, nakalista dito ang BAWAT field ng
                        order slip (per component product pa) — sobrang dami kapag
                        madami ang customized items sa isang package. Makikita naman
                        ito nang buo sa Order Summary bago i-Place Order, kaya dito sa
                        Cart, "Includes: ..." na lang na compact list ng mga product
                        (para sa bundle/package) o "Customized" tag na lang (para sa
                        single item na may sariling slip). */}
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

                    {expandedCartIndexes.has(idx) && <CartSlipImages
                      item={item}
                      className="mt-1.5"
                      readOnly={!onUpdateItem}
                      onChange={(next) => onUpdateItem?.(idx, { order_slip_details: next })}
                    />}

                    {expandedCartIndexes.has(idx) && <CartReferenceImage
                      item={item}
                      className="mt-0.5"
                      readOnly={!onUpdateItem}
                      onChange={(file) => onUpdateItem?.(idx, { inspiration_image: file })}
                    />}

                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => handleUpdateQty(idx, -1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Minus size={12} /></button>
                      <span className="font-mono text-xs w-4 text-center">{item.qty}</span>
                      <button onClick={() => handleUpdateQty(idx, 1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Plus size={12} /></button>
                      <button
                        type="button"
                        onClick={() => onRemoveItem?.(idx)}
                        className="ml-2 w-7 h-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 lg:flex"
                        aria-label={`Remove ${item.name}`}
                        title="Remove item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <span className="font-semibold text-sm text-[#5A453C] shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[#EAE4E0] bg-[#FCFAF9] shrink-0">
          <div className="flex flex-col gap-1 mb-2">
            {(discountAmount > 0 || chargeAmount > 0) && (
              <div className="flex items-center justify-between text-[11px] text-[#8A7264]">
                <span>Subtotal</span>
                <span>₱{subtotal.toLocaleString()}</span>
              </div>
            )}
            {discountAmount > 0 && (
              <div className="flex items-center justify-between text-[11px] text-green-600">
                <span>{discountName ? `${discountName} (${percentageNumber}%)` : `Discount (${percentageNumber}%)`}</span>
                <span>-₱{discountAmount.toLocaleString()}</span>
              </div>
            )}
            {chargeAmount > 0 && (
              <div className="flex items-center justify-between text-[11px] text-red-500">
                <span>Additional Charge</span>
                <span>+₱{chargeAmount.toLocaleString()}</span>
              </div>
            )}
            
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs font-semibold text-[#8A7264]">Grand Total</span>
              <span className="font-serif text-base text-[#8A7264] font-semibold">₱{cartTotal.toLocaleString()}</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 mt-2 pt-3 border-t border-[#EAE4E0] mb-3">
            <div className="flex bg-[#F5EFEB] rounded-lg p-1 gap-1 shrink-0">
              {['Full Payment', '50% Deposit'].map(mode => (
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
              <span className="font-serif text-lg text-[#3B1F0A] font-semibold truncate">₱{amountDue.toLocaleString()}</span>
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
          onRemoveItem={(index) => {
            onRemoveItem?.(index);
            if (cart.length <= 1) setShowSummaryModal(false);
          }}
          cart={cart}
          orderType={orderType}
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
          isProcessing={isProcessing}
          onPlaceOrder={handlePlaceOrder}
          uploadProgress={uploadProgress}
          onValidate={validateOrderForm}
          errors={formErrors}
        />

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