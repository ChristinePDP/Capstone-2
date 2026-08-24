import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  ShoppingCart, Minus, Plus, ChevronDown, ChevronUp, User, 
  Calendar as CalendarIcon, AlertCircle, ChevronLeft, ChevronRight, Tag, Receipt, Lock, X
} from 'lucide-react';
import PosEReceipt from './posEreceipt';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]} ${d}, ${y}`;
}

function toDateStr(year, month, day) {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

const getLiveNow = () => {
  const now = new Date();
  const dateStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5);
  return { dateStr, timeStr };
};

const addDaysToDateString = (dateStr, days) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
};

function MonthCalendar({ selectedDate, minDate, todayDate, style, onSelect, onClose }) {
  const initial = selectedDate || minDate || todayDate;
  const [iy, im] = initial.split('-').map(Number);
  const [viewYear, setViewYear] = useState(iy);
  const [viewMonth, setViewMonth] = useState(im - 1);

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) {
    const day = daysInPrevMonth - startWeekday + 1 + i;
    cells.push({ day, inMonth: false, dateStr: null });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, inMonth: true, dateStr: toDateStr(viewYear, viewMonth, day) });
  }
  while (cells.length % 7 !== 0) {
    const day = cells.length - (startWeekday + daysInMonth) + 1;
    cells.push({ day, inMonth: false, dateStr: null });
  }

  const canGoPrev = viewYear > iy || viewMonth > im - 1 ? true : `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}` > minDate.slice(0, 7);
  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(v => v - 1); setViewMonth(11); }
    else setViewMonth(v => v - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(v => v + 1); setViewMonth(0); }
    else setViewMonth(v => v + 1);
  };

  return (
    <div style={style} className="z-[9999] bg-white border border-[#EAE4E0] rounded-xl shadow-lg p-3 w-[280px]">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={goPrev} disabled={!canGoPrev} className={`p-1 rounded-lg hover:bg-[#F5EFEB] ${!canGoPrev ? 'opacity-30 cursor-not-allowed' : ''}`}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-semibold text-[#3B1F0A]">{MONTH_LABELS[viewMonth]} {viewYear}</span>
        <button type="button" onClick={goNext} className="p-1 rounded-lg hover:bg-[#F5EFEB]">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map(w => <div key={w} className="text-[10px] font-semibold text-[#8A7264] text-center py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell.inMonth) return <div key={idx} className="text-[11px] text-center py-1.5 text-[#D8CFC9]">{cell.day}</div>;
          const isDisabled = cell.dateStr < minDate;
          const isSelected = cell.dateStr === selectedDate;
          const isToday = cell.dateStr === todayDate;
          return (
            <button
              type="button"
              key={idx}
              disabled={isDisabled}
              onClick={() => { onSelect(cell.dateStr); onClose(); }}
              className={`text-[11px] text-center py-1.5 rounded-lg transition-colors
                ${isDisabled ? 'text-[#D8CFC9] cursor-not-allowed' : 'text-[#3B1F0A] hover:bg-[#F5EFEB] cursor-pointer'}
                ${isSelected ? 'bg-[#4A3B36] text-white hover:bg-[#4A3B36]' : ''}
                ${isToday && !isSelected ? 'border border-[#8A7264]' : ''}
              `}
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TIME_SLOTS = [
  { value: '08:00-10:00', label: '8:00 AM - 10:00 AM', start: '08:00', end: '10:00' },
  { value: '10:00-12:00', label: '10:00 AM - 12:00 PM', start: '10:00', end: '12:00' },
  { value: '12:00-15:00', label: '12:00 PM - 3:00 PM', start: '12:00', end: '15:00' },
  { value: '15:00-17:00', label: '3:00 PM - 5:00 PM', start: '15:00', end: '17:00' },
];

function getSlotLabel(value) {
  return TIME_SLOTS.find(s => s.value === value)?.label || '';
}

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
export default function PosCart({ cart, orderType, setOrderType, onUpdateQty, onClearCart, isCartOpen, onClose }) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false); 
  const [isDiscountsOpen, setIsDiscountsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [limitToast, setLimitToast] = useState(null); // { message } — auto-dismiss top toast, same style as Menu.jsx
  const limitToastTimerRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [ereceiptData, setEreceiptData] = useState(null); 

  const [additionalCharge, setAdditionalCharge] = useState(() => localStorage.getItem('pos_additionalCharge') || '');
  const [discountName, setDiscountName] = useState(() => localStorage.getItem('pos_discountName') || '');
  const [discountPercentage, setDiscountPercentage] = useState(() => localStorage.getItem('pos_discountPercentage') || '');
  const [paymentMode, setPaymentMode] = useState(() => localStorage.getItem('pos_paymentMode') || 'Full Payment'); 

  const hasPreOrder = cart.some(item => item.order_type === 'Pre-order');
  const hasBuyNow = cart.some(item => item.order_type === 'Pick-up Today');
  
  const isPreOrderOnly = hasPreOrder && !hasBuyNow;
  const isBuyNowOnly = hasBuyNow && !hasPreOrder;

  const prevCartLength = useRef(cart.length);

  const showLimitToast = (message) => {
    if (limitToastTimerRef.current) clearTimeout(limitToastTimerRef.current);
    setLimitToast({ message });
    limitToastTimerRef.current = setTimeout(() => setLimitToast(null), 3200);
  };

  useEffect(() => {
    return () => {
      if (limitToastTimerRef.current) clearTimeout(limitToastTimerRef.current);
    };
  }, []);

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
        showLimitToast(`Sorry, only ${limit} of "${item.name}" ${limit === 1 ? 'is' : 'are'} available.`);
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

  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarPos, setCalendarPos] = useState(null);
  const calendarWrapRef = useRef(null);
  const calendarTriggerRef = useRef(null);
  const calendarPortalRef = useRef(null);

  const openCalendar = () => {
    if (calendarTriggerRef.current) {
      const rect = calendarTriggerRef.current.getBoundingClientRect();
      const CALENDAR_WIDTH = 280;
      const CALENDAR_HEIGHT_ESTIMATE = 330;
      const openUpward = window.innerHeight - rect.bottom < CALENDAR_HEIGHT_ESTIMATE && rect.top > CALENDAR_HEIGHT_ESTIMATE;
      const left = Math.min(rect.left, window.innerWidth - CALENDAR_WIDTH - 12);
      setCalendarPos({
        position: 'fixed',
        left: Math.max(left, 12),
        ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 })
      });
    }
    setShowCalendar(true);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!showCalendar) return;
      const clickedTrigger = calendarWrapRef.current && calendarWrapRef.current.contains(e.target);
      const clickedPortal = calendarPortalRef.current && calendarPortalRef.current.contains(e.target);
      if (!clickedTrigger && !clickedPortal) setShowCalendar(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendar]);

  useEffect(() => {
    if (!showCalendar) return;
    const handleScroll = () => setShowCalendar(false);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [showCalendar]);

  useEffect(() => {
    if (orderType === 'Buy Now') {
      const { dateStr } = getLiveNow();
      setForm(f => ({ ...f, pickupDate: dateStr, pickupTime: '' }));
    } else {
      setForm(f => ({ ...f, pickupDate: '', pickupTime: '' }));
    }
  }, [orderType]);

  const isSlotDisabled = (slot) => {
    if (orderType !== 'Buy Now') return false;
    const { timeStr } = getLiveNow();
    return slot.end <= timeStr;
  };

  const handleProceedToOrder = () => {
    if (cart.length === 0) return;
    if (orderType === 'Pre-Order') {
      if (!form.name || !form.phone || !form.pickupDate || !form.pickupTime) {
        return setToastMessage('Please complete all required fields (*)');
      }
    }
    const phoneRegex = /^\d{11}$/;
    if (orderType === 'Pre-Order' || form.phone) {
      if (!phoneRegex.test(form.phone)) {
        return setToastMessage('Your Contact Number must be exactly 11 digits.');
      }
    }
    if (form.altPhone && !phoneRegex.test(form.altPhone)) {
      return setToastMessage('Your Alternative Number must be exactly 11 digits.');
    }
    setShowSummaryModal(true);
  };

  const handlePlaceOrder = async () => {
    setIsProcessing(true);

    // FIX: dating ang product ID at price lang ang ipinapasa dito — nawawala
    // ang order_slip_details / selected_price_options na kinukuha na ng
    // PosProductModal (kaya wala talagang na-se-save sa DB kahit may
    // sinasagot na fields ang cashier). Bundle items ay may sariling shape
    // (`type`, `bundleId`) para ma-explode ito ng backend (resolveOrderItems)
    // papunta sa kani-kanilang component product rows — parehong contract
    // gaya ng ginagamit ng Online Ordering checkout.
    // NOTE: `inspiration_image` (File object mula sa "Upload Reference
    // Image") ay hindi pa rin dito isinasama — kailangan pang i-upload ito
    // sa storage bucket muna (gamit ang /online-ordering upload endpoint)
    // bago maging usable na URL. Hiwalay na TODO ito.
    const formattedItems = cart.map(item => {
      if (item.type === 'bundle') {
        return {
          type: 'bundle',
          bundleId: item.bundleId,
          quantity: item.qty,
          orderSlip: item.order_slip_details || {},
          specialInstructions: item.details || ''
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
        specialInstructions: item.details || ''
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
      const response = await fetch('http://localhost:3000/api/pos/order', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Failed to process order');

      setShowSummaryModal(false);

      if (orderType === 'Pre-Order') {
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
        alert(`Order successful! Order Ref: ${result.data.order_number}`);
      }

      onClearCart();
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
      setToastMessage(error.message || 'An error occurred while processing your order.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleToggleDetails = () => {
    if (!isDetailsOpen) {
      setIsDetailsOpen(true);
      setIsDiscountsOpen(false); 
    } else {
      setIsDetailsOpen(false);
    }
  };

  const handleToggleDiscounts = () => {
    if (!isDiscountsOpen) {
      setIsDiscountsOpen(true);
      setIsDetailsOpen(false); 
    } else {
      setIsDiscountsOpen(false);
    }
  };

  const isBuyNow = orderType === 'Buy Now';
  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const percentageNumber = Number(discountPercentage) || 0;
  const discountAmount = subtotal * (percentageNumber / 100);
  const chargeAmount = Number(additionalCharge) || 0;
  const cartTotal = subtotal - discountAmount + chargeAmount;
  const amountDue = paymentMode === '50% Deposit' ? cartTotal / 2 : cartTotal;

  return (
    <>
      {limitToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[6000] flex items-center gap-2.5 bg-[#3B1F0A] text-white text-xs sm:text-sm font-semibold px-4 sm:px-5 py-3 rounded-xl shadow-lg max-w-[92vw] sm:max-w-md animate-in fade-in slide-in-from-top-4 duration-200">
          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
          <span className="leading-snug">{limitToast.message}</span>
        </div>
      )}

      {/* Mobile Overlay Background kapag bukas ang Cart */}
      {isCartOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[1000] lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Binago ang outermost wrapper: Dinagdagan ng Off-canvas behaviors para sa mobile */}
      <div className={`
        fixed inset-y-0 right-0 z-[1010] w-[85%] max-w-[400px] sm:w-[400px] bg-white shadow-2xl flex flex-col shrink-0 h-full overflow-hidden 
        transform transition-transform duration-300 ease-in-out will-change-transform
        ${isCartOpen ? 'translate-x-0' : 'translate-x-full'}
        lg:static lg:translate-x-0 lg:w-[400px] lg:min-w-[400px] lg:max-w-[400px] lg:rounded-3xl lg:border lg:border-[#EAE4E0] lg:shadow-sm lg:z-auto lg:h-full
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

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <div className="shrink-0 border-b border-[#F1EBE6] bg-[#FCFAF9]">
            <button 
              onClick={handleToggleDetails}
              className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#F5EFEB] transition-colors"
            >
              <div className="flex items-center gap-2">
                <User size={14} className="text-[#8A7264]" />
                <span className="text-xs font-semibold text-[#8A7264]">
                  Customer Details
                  {isBuyNow ? (
                    <span className="text-[#B7A99F] font-normal ml-1">· Optional</span>
                  ) : (
                    <span className="text-red-500 font-normal ml-1">· Required</span>
                  )}
                </span>
              </div>
              {isDetailsOpen ? <ChevronUp size={16} className="text-[#8A7264]" /> : <ChevronDown size={16} className="text-[#8A7264]" />}
            </button>

            {isDetailsOpen && (
              <div className="px-5 pb-4 flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <input 
                      type="text" 
                      placeholder={isBuyNow ? "Customer Name" : "Customer Name *"}
                      value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}
                      className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors bg-white" 
                    />
                  </div>
                  <div>
                    <input 
                      type="text" 
                      placeholder={isBuyNow ? "Phone Number" : "Phone Number *"}
                      maxLength="11"
                      value={form.phone}
                      onChange={e => setForm({...form, phone: e.target.value.replace(/\D/g, '')})}
                      className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors bg-white" 
                    />
                  </div>
                </div>

                <div>
                  <input 
                    type="text" 
                    placeholder="Alternative Phone (Optional)" 
                    maxLength="11"
                    value={form.altPhone}
                    onChange={e => setForm({...form, altPhone: e.target.value.replace(/\D/g, '')})}
                    className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors bg-white" 
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="relative" ref={calendarWrapRef}>
                    {orderType === 'Buy Now' ? (
                      <div className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl bg-[#F5EFEB] opacity-70 cursor-not-allowed text-[#3B1F0A] flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <Lock size={12} className="shrink-0" />
                          <span className="truncate">{formatDateLong(getLiveNow().dateStr)} (Today)</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          ref={calendarTriggerRef}
                          onClick={() => (showCalendar ? setShowCalendar(false) : openCalendar())}
                          className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors text-left bg-white flex items-center justify-between"
                        >
                          <span className={form.pickupDate ? 'text-[#3B1F0A] truncate' : 'text-[#8A7264] truncate'}>
                            {form.pickupDate ? formatDateLong(form.pickupDate) : 'Pick-up Date *'}
                          </span>
                          <CalendarIcon size={14} className="text-[#8A7264] shrink-0 ml-1" />
                        </button>
                        {showCalendar && calendarPos && createPortal(
                          <div ref={calendarPortalRef}>
                            <MonthCalendar
                              selectedDate={form.pickupDate}
                              minDate={minPreOrderDate}
                              todayDate={getLiveNow().dateStr}
                              style={calendarPos}
                              onSelect={(dateStr) => setForm(f => ({...f, pickupDate: dateStr}))}
                              onClose={() => setShowCalendar(false)}
                            />
                          </div>,
                          document.body
                        )}
                      </>
                    )}
                  </div>
                  
                  <div className="relative">
                    <div className="relative">
                      <select
                        value={form.pickupTime}
                        onChange={(e) => setForm(f => ({ ...f, pickupTime: e.target.value }))}
                        className={`w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors bg-white appearance-none pr-8 ${form.pickupTime ? 'text-[#3B1F0A]' : 'text-[#8A7264]'}`}
                      >
                        <option value="" disabled>Pick-up Time *</option>
                        {TIME_SLOTS.map(slot => (
                          <option key={slot.value} value={slot.value} disabled={isSlotDisabled(slot)}>
                            {slot.label}{isSlotDisabled(slot) ? ' (Past)' : ''}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="text-[#8A7264] shrink-0 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

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

          <div className="flex flex-col gap-2.5 mt-2 pt-3 border-t border-[#EAE4E0] mb-3">
            <div>
              <span className="text-[11px] font-semibold text-[#3B1F0A] block mb-1.5">Payment Mode</span>
              <div className="flex bg-[#F5EFEB] rounded-xl p-1 w-full gap-1">
                {['Full Payment', '50% Deposit'].map(mode => (
                  <button
                    key={mode}
                    onClick={() => setPaymentMode(mode)}
                    className={`flex-1 py-2.5 text-xs font-semibold rounded-lg transition-colors ${
                      paymentMode === mode ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#3B1F0A]">Amount Due</span>
              <span className="font-serif text-xl text-[#3B1F0A] font-semibold">₱{amountDue.toLocaleString()}</span>
            </div>
          </div>

          <button 
            onClick={handleProceedToOrder}
            disabled={cart.length === 0 || isProcessing}
            className="w-full bg-[#3B1F0A] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#2A1608] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            Review Order
          </button>
        </div>

        {showSummaryModal && createPortal(
          <div className="fixed inset-0 z-[1900] flex items-center justify-center bg-black/50 px-4 py-6">
            <div className="bg-white rounded-3xl border border-[#EAE4E0] shadow-xl w-full max-w-[760px] max-h-[90vh] flex flex-col overflow-hidden">
              <div className="p-4 pb-3 sm:p-5 sm:pb-4 flex items-center gap-2.5 shrink-0 border-b border-[#F1EBE6] bg-[#FCFAF9]">
                <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0">
                  <Receipt size={14} />
                </div>
                <h3 className="text-base sm:text-lg font-serif text-[#3B1F0A] leading-none">Order Summary</h3>
              </div>

              <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                <div className="w-full md:w-[260px] flex-shrink-0 border-b md:border-b-0 md:border-r border-[#F1EBE6] bg-[#FCFAF9] p-4 sm:p-5 overflow-y-auto scrollbar-thin">
                  <h4 className="text-xs font-bold text-[#8A7264] uppercase tracking-wider mb-3">Order Details</h4>
                  <div className="flex flex-col gap-2.5 text-xs">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[#B7A99F]">Order Type</span>
                      <span className="text-[#3B1F0A] font-semibold">{orderType}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[#B7A99F]">Name</span>
                      <span className="text-[#3B1F0A] font-semibold">{form.name || '—'}</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[#B7A99F]">Contact</span>
                      <span className="text-[#3B1F0A] font-semibold">{form.phone || '—'}</span>
                    </div>
                    {form.altPhone && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[#B7A99F]">Alt Contact</span>
                        <span className="text-[#3B1F0A] font-semibold">{form.altPhone}</span>
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[#B7A99F]">Date &amp; Time</span>
                      <span className="text-[#3B1F0A] font-semibold">
                        {form.pickupDate ? formatDateLong(form.pickupDate) : '—'}
                        {form.pickupTime && <><br />{getSlotLabel(form.pickupTime)}</>}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col min-w-0 bg-white">
                  <div className="flex-1 p-4 sm:p-5 overflow-y-auto scrollbar-thin flex flex-col gap-3.5">
                    <h4 className="text-xs font-bold text-[#8A7264] uppercase tracking-wider mb-1">Items ({cart.length})</h4>

                    {cart.map((item, i) => (
                      <div key={i} className="flex gap-3.5 pb-3.5 border-b border-[#F1EBE6] last:border-0 last:pb-0">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-[#F5EFEB] rounded-xl border border-[#EAE4E0] overflow-hidden flex items-center justify-center">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[#B7A99F] text-[10px]">No Image</span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 flex flex-col">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <p className="font-bold text-xs sm:text-sm text-[#3B1F0A] line-clamp-2 leading-snug">{item.qty}x {item.name}</p>
                            <span className="font-bold text-xs sm:text-sm text-[#5A453C] shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
                          </div>

                          {item.selected_price_options && Object.entries(item.selected_price_options).map(([label, value]) => (
                            <p key={`sum-opt-${label}`} className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">
                              <span className="font-medium">{label}:</span> {value}
                            </p>
                          ))}

                          {item.type === 'bundle' && item.order_slip_details ? (
                            Object.entries(item.order_slip_details).map(([prodId, answers]) => {
                              const pName = item.products?.find(p => p.id === prodId)?.name || 'Item';
                              return Object.entries(answers).map(([label, value]) => (
                                <p key={`sum-slip-${prodId}-${label}`} className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">
                                  <span className="font-medium">{pName}</span> - {label}: {value}
                                </p>
                              ));
                            })
                          ) : (
                            item.order_slip_details && Object.entries(item.order_slip_details).map(([label, value]) => (
                              <p key={`sum-slip-${label}`} className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">
                                <span className="font-medium">{label}:</span> {value}
                              </p>
                            ))
                          )}

                          {item.inspiration_image && (
                            <p className="text-[10px] sm:text-xs font-semibold text-[#8A7264] leading-snug">
                              {item.type === 'bundle'
                                ? `Image Attached (${Object.values(item.inspiration_image).filter(Boolean).length})`
                                : 'Image Attached'}
                            </p>
                          )}

                          {item.details && (
                            <p className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">Note: {item.details}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-4 sm:pb-5 shrink-0 border-t border-[#EAE4E0] bg-[#FCFAF9]">
                    <div className="mb-4">
                      {discountAmount > 0 && (
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[#8A7264]">Subtotal</span>
                          <span className="text-xs text-[#8A7264] font-medium">₱{subtotal.toLocaleString()}</span>
                        </div>
                      )}
                      {discountAmount > 0 && (
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-green-600">{discountName ? `${discountName} (${percentageNumber}%)` : `Discount (${percentageNumber}%)`}</span>
                          <span className="text-xs text-green-600 font-medium">-₱{discountAmount.toLocaleString()}</span>
                        </div>
                      )}
                      {chargeAmount > 0 && (
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-red-500">Additional Charge</span>
                          <span className="text-xs text-red-500 font-medium">+₱{chargeAmount.toLocaleString()}</span>
                        </div>
                      )}

                      {paymentMode === '50% Deposit' ? (
                        <>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-[#8A7264]">To Pay Now (50%)</span>
                            <span className="text-xs text-[#8A7264] font-medium">₱{amountDue.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-[#8A7264]">Balance at Pick-up</span>
                            <span className="text-xs text-[#8A7264] font-medium">₱{(cartTotal - amountDue).toLocaleString()}</span>
                          </div>
                          <div className="w-full h-px bg-[#EAE4E0] mb-2"></div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-[#8A7264]">To Pay Now</span>
                            <span className="text-xs text-[#8A7264] font-medium">₱{amountDue.toLocaleString()}</span>
                          </div>
                          <div className="w-full h-px bg-[#EAE4E0] mb-2"></div>
                        </>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#5A453C]">Grand Total</span>
                        <span className="font-serif text-lg sm:text-xl text-[#3B1F0A]">₱{cartTotal.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex gap-2.5">
                      <button
                        onClick={() => setShowSummaryModal(false)}
                        disabled={isProcessing}
                        className="w-1/3 border border-[#EAE4E0] text-[#3B1F0A] bg-white py-3 sm:py-3.5 rounded-full text-xs sm:text-sm font-semibold hover:bg-[#F5EFEB] disabled:opacity-50 transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={handlePlaceOrder}
                        disabled={isProcessing}
                        className="w-2/3 bg-[#3B1F0A] text-white py-3 sm:py-3.5 rounded-full text-xs sm:text-sm font-semibold hover:bg-[#2A1608] disabled:opacity-75 disabled:cursor-not-allowed transition-colors"
                      >
                        {isProcessing ? 'Processing...' : 'Place Order'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {toastMessage && createPortal(
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 px-4">
            <div className="bg-white rounded-2xl border border-[#EAE4E0] shadow-xl p-5 sm:p-6 w-full max-w-[320px] flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-4">
                <AlertCircle size={24} />
              </div>
              <p className="text-sm font-semibold text-[#3B1F0A] mb-6">{toastMessage}</p>
              <button
                onClick={() => setToastMessage(null)}
                className="w-full bg-[#3B1F0A] text-white py-2.5 rounded-full text-xs font-semibold hover:bg-[#2A1608] transition-colors"
              >
                Okay
              </button>
            </div>
          </div>,
          document.body
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