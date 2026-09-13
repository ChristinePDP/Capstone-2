import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ShoppingCart, Minus, Plus, ChevronDown, ChevronUp, Tag, X
} from 'lucide-react';
import PosEReceipt from './posEreceipt';
import OrderSummaryModal, { getLiveNow, addDaysToDateString, formatDateLong, getSlotLabel, TIME_SLOTS } from './orderSum';

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

function isQuantityTracked(item) {
  if (!item || item.type === 'bundle') return false;
  return hasDailyLimitSet(item) || (item.stock_quantity !== null && item.stock_quantity !== undefined);
}

function getQuantityLimit(item) {
  const basis = hasDailyLimitSet(item) ? item.daily_limit : item.stock_quantity;
  return item.available_stock ?? basis ?? 0;
}

// In-accept na natin ang isCartOpen at onClose galing sa magulang (PosPage)
export default function PosCart({ cart, orderType, setOrderType, onUpdateQty, onClearCart, isCartOpen, onClose, onOrderPlaced }) {
  const [isDiscountsOpen, setIsDiscountsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [ereceiptData, setEreceiptData] = useState(null); 

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

  const prevCartLength = useRef(cart.length);

  // Ginagamit ng handleUpdateQty (stock/daily-limit warning) ang parehong
  // LOCAL na toast bar sa itaas.
  const showLimitToast = (message) => showToast(message, 'error');

  // Prevent the background POS screen from scrolling while the Order
  // Summary modal (a `fixed inset-0` overlay) is open — now handled inside
  // OrderSummaryModal (orderSum.jsx) itself since the modal owns its own
  // `show` lifecycle.


  // Kapag pinapataas ang quantity (delta > 0) ng isang tracked item
  // (may daily_limit o stock_quantity), i-block bago pa lumagpas sa
  // available limit — kasama ang ibang cart lines ng parehong product id.
  const handleUpdateQty = (idx, delta) => {
    const item = cart[idx];

    if (delta > 0 && isQuantityTracked(item)) {
      const currentQtyInCart = cart
        .filter(i => i.id === item.id)
        .reduce((sum, i) => sum + i.qty, 0);
      const limit = getQuantityLimit(item);

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
  const validateOrderForm = () => {
    if (orderType === 'Pre-Order') {
      if (!form.name || !form.phone || !form.pickupDate || !form.pickupTime) {
        showToast('Please complete all required fields (*)', 'error');
        return false;
      }
    }
    const phoneRegex = /^\d{11}$/;
    if (orderType === 'Pre-Order' || form.phone) {
      if (!phoneRegex.test(form.phone)) {
        showToast('Your Contact Number must be exactly 11 digits.', 'error');
        return false;
      }
    }
    if (form.altPhone && !phoneRegex.test(form.altPhone)) {
      showToast('Your Alternative Number must be exactly 11 digits.', 'error');
      return false;
    }
    return true;
  };

  const handlePlaceOrder = async () => {
    setIsProcessing(true);

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
        }
        if (Object.keys(urls).length > 0) {
          updatedCart[i].inspiration_urls = urls;
        }
      }
    }

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
          orderSlip: item.order_slip_details || {},
          specialInstructions: item.details || '',
          // FIX: idinagdag — per-component image URLs, binabasa na ng
          // resolveBundleLineItem sa backend.
          inspirationUrls: item.inspiration_urls || null
        };
      }
      return {
        productId: item.id,
        name: item.name,
        quantity: item.qty,
        unitPrice: item.price,
        subtotal: item.price * item.qty,
        orderSlip: item.order_slip_details || null,
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
        date: form.pickupDate,
        time: selectedSlot?.start || '',
        timeEnd: selectedSlot?.end || '',
        timeSlot: form.pickupTime,
        timeLabel: selectedSlot?.label || ''
      },
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
          pickupDate: form.pickupDate ? formatDateLong(form.pickupDate) : '',
          pickupTime: getSlotLabel(form.pickupTime),
          confirmToken: result.data.receiptToken,
        });
      } else {
        showToast(`Order successful! Order Ref: ${result.data.order_number}`, 'success');
      }

      onClearCart();

      // FIX: dati'y hindi nirerefresh ang product list pagkatapos mag-order,
      // kaya kahit nabawasan na ang stock sa DB, tama pa rin ang lumang
      // bilang na nakikita ng cashier hangga't hindi niya ni-reload / lumipat
      // pabalik sa POS page. I-invalidate + i-refetch (force) ang cached
      // products dito para agad ma-reflect ang bagong available_stock.
      if (typeof onOrderPlaced === 'function') onOrderPlaced();

      setForm({ name: '', phone: '', altPhone: '', pickupDate: getLiveNow().dateStr, pickupTime: '' });
      setAdditionalCharge('');
      setDiscountName('');
      setDiscountPercentage('');
      setPaymentMode('Full Payment');
      
      localStorage.removeItem('pos_cart');
      localStorage.removeItem('pos_orderType');
      localStorage.removeItem('pos_form');
      localStorage.removeItem('pos_additionalCharge');
      localStorage.removeItem('pos_discountName');
      localStorage.removeItem('pos_discountPercentage');
      localStorage.removeItem('pos_paymentMode');

      if(isCartOpen && typeof onClose === 'function') onClose();

    } catch (error) {
      console.error('Checkout error:', error);
      showToast(error.message || 'An error occurred while processing your order.', 'error');
    } finally {
      setIsProcessing(false);
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
                setOrderType('Buy Now');
              }}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                orderType === 'Buy Now' ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'
              } ${isPreOrderOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Buy Now
            </button>
            <button
              onClick={() => {
                if (isBuyNowOnly) return; 
                setOrderType('Pre-Order');
              }}
              className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                orderType === 'Pre-Order' ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'
              } ${isBuyNowOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Pre-Order
            </button>
          </div>
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
                <div key={idx} className="flex justify-between items-start gap-3 pb-4 border-b border-[#F1EBE6] last:border-0 last:pb-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[#3B1F0A] truncate">{item.name}</p>
                    {item.details && <p className="text-[10px] text-[#8A7264] leading-snug mt-0.5 max-w-[200px] truncate">Note: {item.details}</p>}

                    {item.selected_price_options && Object.entries(item.selected_price_options).map(([key, val]) => (
                      <p key={`opt-${key}`} className="text-[11px] text-[#8A7264] mt-0.5 leading-snug">
                        <span className="font-medium">{key}:</span> {val}
                      </p>
                    ))}

                    {item.type === 'bundle' && item.order_slip_details ? (
                      // Bundle: nakagrupo per component product ID ang slip details
                      Object.entries(item.order_slip_details).map(([prodId, answers]) => {
                        const pName = item.products?.find(p => p.id === prodId)?.name || 'Item';
                        return Object.entries(answers).map(([key, val]) => (
                          <p key={`slip-${prodId}-${key}`} className="text-[11px] text-[#8A7264] mt-0.5 leading-snug">
                            <span className="font-medium">{pName}</span> - {key}: {val}
                          </p>
                        ));
                      })
                    ) : (
                      item.order_slip_details && Object.entries(item.order_slip_details).map(([key, val]) => (
                        <p key={`slip-${key}`} className="text-[11px] text-[#8A7264] mt-0.5 leading-snug">
                          <span className="font-medium">{key}:</span> {val}
                        </p>
                      ))
                    )}

                    {item.inspiration_image && (
                      <p className="text-[11px] font-semibold text-[#8A7264] mt-0.5">
                        {item.type === 'bundle'
                          ? `Image Attached (${Object.values(item.inspiration_image).filter(Boolean).length})`
                          : 'Image Attached'}
                      </p>
                    )}

                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => handleUpdateQty(idx, -1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Minus size={12} /></button>
                      <span className="font-mono text-xs w-4 text-center">{item.qty}</span>
                      <button onClick={() => handleUpdateQty(idx, 1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Plus size={12} /></button>
                    </div>
                  </div>
                  <span className="font-semibold text-sm text-[#5A453C] shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
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
          onBack={() => setShowSummaryModal(false)}
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
          onValidate={validateOrderForm}
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