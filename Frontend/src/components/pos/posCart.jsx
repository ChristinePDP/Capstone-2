import { useState, useRef, useEffect } from 'react';
import { 
  ShoppingCart, Minus, Plus, ChevronDown, ChevronUp, User, 
  Lock, Calendar as CalendarIcon, AlertCircle, ChevronLeft, ChevronRight, Tag 
} from 'lucide-react';

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

function MonthCalendar({ selectedDate, minDate, todayDate, openUpward, onSelect, onClose }) {
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
    <div className={`absolute z-50 bg-white border border-[#EAE4E0] rounded-xl shadow-lg p-3 w-[280px] left-0 ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
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

const HOURS_12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTES_STEP = 5; 
const MINUTES_5 = Array.from({ length: 60 / MINUTES_STEP }, (_, i) => i * MINUTES_STEP);

function to24Hour(hour12, meridiem) {
  const h = hour12 % 12; 
  return meridiem === 'PM' ? h + 12 : h;
}
function buildTimeStr(hour24, minute) {
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function from24Hour(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const meridiem = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: Math.floor(m / MINUTES_STEP) * MINUTES_STEP, meridiem };
}

function TimePicker({ value, minTime, maxTime, openUpward, onChange, onClose }) {
  const initial = from24Hour(value && value >= minTime && value <= maxTime ? value : minTime);
  const [hour12, setHour12] = useState(initial.hour12);
  const [minute, setMinute] = useState(initial.minute);
  const [meridiem, setMeridiem] = useState(initial.meridiem);

  const commit = (h12, mm, mer) => {
    const hour24 = to24Hour(h12, mer);
    let ts = buildTimeStr(hour24, mm);
    if (ts < minTime) { const s = from24Hour(minTime); h12 = s.hour12; mm = s.minute; mer = s.meridiem; ts = minTime; }
    else if (ts > maxTime) { const s = from24Hour(maxTime); h12 = s.hour12; mm = s.minute; mer = s.meridiem; ts = maxTime; }
    setHour12(h12); setMinute(mm); setMeridiem(mer);
    onChange(ts);
  };

  const isHourDisabled = (h12) => {
    const hour24 = to24Hour(h12, meridiem);
    return buildTimeStr(hour24, 59) < minTime || buildTimeStr(hour24, 0) > maxTime;
  };
  const isMinuteDisabled = (mm) => {
    const ts = buildTimeStr(to24Hour(hour12, meridiem), mm);
    return ts < minTime || ts > maxTime;
  };
  const isMeridiemDisabled = (mer) => {
    const blockMin = mer === 'AM' ? '00:00' : '12:00';
    const blockMax = mer === 'AM' ? '11:59' : '23:59';
    return blockMax < minTime || blockMin > maxTime;
  };

  const colBase = 'flex-1 max-h-[176px] overflow-y-auto py-1 scrollbar-thin';
  const itemBase = 'text-[11px] text-center py-1.5 rounded-lg transition-colors cursor-pointer select-none';

  return (
    <div className={`absolute z-50 bg-white border border-[#EAE4E0] rounded-xl shadow-lg p-2 w-[210px] right-0 ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
      <div className="flex gap-1 border-b border-[#EAE4E0] pb-2 mb-2">
        <div className={colBase}>
          {HOURS_12.map(h => {
            const disabled = isHourDisabled(h);
            return <div key={h} onClick={() => !disabled && commit(h, minute, meridiem)} className={`${itemBase} ${disabled ? 'text-[#D8CFC9] cursor-not-allowed' : h === hour12 ? 'bg-[#4A3B36] text-white' : 'text-[#3B1F0A] hover:bg-[#F5EFEB]'}`}>{String(h).padStart(2, '0')}</div>;
          })}
        </div>
        <div className={colBase}>
          {MINUTES_5.map(m => {
            const disabled = isMinuteDisabled(m);
            return <div key={m} onClick={() => !disabled && commit(hour12, m, meridiem)} className={`${itemBase} ${disabled ? 'text-[#D8CFC9] cursor-not-allowed' : m === minute ? 'bg-[#4A3B36] text-white' : 'text-[#3B1F0A] hover:bg-[#F5EFEB]'}`}>{String(m).padStart(2, '0')}</div>;
          })}
        </div>
        <div className={colBase}>
          {['AM', 'PM'].map(mer => {
            const disabled = isMeridiemDisabled(mer);
            return <div key={mer} onClick={() => !disabled && commit(hour12, minute, mer)} className={`${itemBase} ${disabled ? 'text-[#D8CFC9] cursor-not-allowed' : mer === meridiem ? 'bg-[#4A3B36] text-white' : 'text-[#3B1F0A] hover:bg-[#F5EFEB]'}`}>{mer}</div>;
          })}
        </div>
      </div>
      <button type="button" onClick={onClose} className="w-full text-[11px] font-semibold text-white bg-[#4A3B36] rounded-lg py-1.5 hover:bg-[#3B1F0A] transition-colors">Done</button>
    </div>
  );
}


// --- MAIN POS CART COMPONENT ---
export default function PosCart({ cart, orderType, setOrderType, onUpdateQty, onClearCart }) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false); 
  const [isDiscountsOpen, setIsDiscountsOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [additionalCharge, setAdditionalCharge] = useState('');
  const [discountName, setDiscountName] = useState('');
  const [discountPercentage, setDiscountPercentage] = useState('');
  const [paymentMode, setPaymentMode] = useState('Full Payment'); 

  // --- CART COMPOSITION LOGIC ---
  const hasPreOrder = cart.some(item => item.order_type === 'Pre-order');
  const hasBuyNow = cart.some(item => item.order_type === 'Pick-up Today');
  
  const isPreOrderOnly = hasPreOrder && !hasBuyNow;
  const isBuyNowOnly = hasBuyNow && !hasPreOrder;

  const prevCartLength = useRef(cart.length);

  useEffect(() => {
    // I-a-auto switch natin ang order type base sa laman ng cart o kung pa-empty ito
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

  const getLiveNow = () => {
    const now = new Date();
    const dateStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);
    return { dateStr, timeStr };
  };

  const [form, setForm] = useState({
    name: '',
    phone: '',
    altPhone: '',
    pickupDate: orderType === 'Buy Now' ? getLiveNow().dateStr : '',
    pickupTime: '',
  });

  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarOpenUpward, setCalendarOpenUpward] = useState(false);
  const calendarWrapRef = useRef(null);
  const calendarTriggerRef = useRef(null);

  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerOpenUpward, setTimePickerOpenUpward] = useState(false);
  const timePickerWrapRef = useRef(null);
  const timePickerTriggerRef = useRef(null);

  const SHOP_OPEN_TIME = '08:00';
  const SHOP_CLOSE_TIME = '17:00';

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showCalendar && calendarWrapRef.current && !calendarWrapRef.current.contains(e.target)) setShowCalendar(false);
      if (showTimePicker && timePickerWrapRef.current && !timePickerWrapRef.current.contains(e.target)) setShowTimePicker(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendar, showTimePicker]);

  useEffect(() => {
    if (orderType === 'Buy Now') {
      const { dateStr, timeStr } = getLiveNow();
      setForm(f => ({
        ...f,
        pickupDate: dateStr,
        pickupTime: timeStr > SHOP_CLOSE_TIME ? '' : (timeStr > SHOP_OPEN_TIME ? timeStr : SHOP_OPEN_TIME)
      }));
    } else {
      setForm(f => ({ ...f, pickupDate: '', pickupTime: '' }));
    }
  }, [orderType]);

  const addDaysToDateString = (dateStr, days) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  };

  const minPreOrderDate = addDaysToDateString(getLiveNow().dateStr, 1);
  const getEffectiveMinTimeForToday = () => {
    const { timeStr } = getLiveNow();
    return timeStr > SHOP_OPEN_TIME ? timeStr : SHOP_OPEN_TIME;
  };

  const formatTime = (time24) => {
    if (!time24) return '';
    let [hours, minutes] = time24.split(':');
    hours = parseInt(hours, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  const handleCompleteOrder = async () => {
    if (cart.length === 0) return;

    if (orderType === 'Buy Now' && getLiveNow().timeStr > SHOP_CLOSE_TIME) {
      return setToastMessage('Shop is already closed for today. Please select Pre-Order.');
    }

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

    setIsProcessing(true);

    const formattedItems = cart.map(item => ({
      productId: item.id,
      name: item.name,
      quantity: item.qty,
      unitPrice: item.price,
      subtotal: item.price * item.qty,
      specialInstructions: item.details || ''
    }));

    const subtotalCalc = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const percentageNumberVal = Number(discountPercentage) || 0;
    const discountAmountCalc = subtotalCalc * (percentageNumberVal / 100);
    const chargeAmountCalc = Number(additionalCharge) || 0;
    const grandTotalCalc = subtotalCalc - discountAmountCalc + chargeAmountCalc;
    const amountDueCalc = paymentMode === '50% Deposit' ? grandTotalCalc / 2 : grandTotalCalc;

    const payload = {
      orderType: orderType,
      customer: {
        name: form.name,
        phone: form.phone,
        altPhone: form.altPhone
      },
      payment: {
        subtotal: subtotalCalc,
        grandTotal: grandTotalCalc,
        type: paymentMode,
        amountDueNow: amountDueCalc,
        balance: grandTotalCalc - amountDueCalc
      },
      pickup: orderType === 'Pre-Order' ? {
        date: form.pickupDate,
        time: form.pickupTime
      } : null,
      items: formattedItems
    };

    try {
      const token = localStorage.getItem('token'); 
      const response = await fetch('http://localhost:3000/api/pos/order', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to process order');
      }

      alert(`Order successful! Order Ref: ${result.data.order_number}`);
      
      onClearCart();
      setForm({ name: '', phone: '', altPhone: '', pickupDate: getLiveNow().dateStr, pickupTime: '' });
      setAdditionalCharge('');
      setDiscountName('');
      setDiscountPercentage('');
      setPaymentMode('Full Payment');
      
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
    <div className="w-full lg:w-[400px] lg:min-w-[400px] lg:max-w-[400px] bg-white rounded-3xl border border-[#EAE4E0] shadow-sm flex flex-col shrink-0 h-full overflow-hidden relative">
      
      {/* Order Type Toggle - NOW WITH DYNAMIC DISABLE LOGIC */}
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
      {!isBuyNow && (
      <div className="shrink-0 border-b border-[#F1EBE6] bg-[#FCFAF9]">
        <button 
          onClick={handleToggleDetails}
          className="w-full flex items-center justify-between px-5 py-3 hover:bg-[#F5EFEB] transition-colors"
        >
          <div className="flex items-center gap-2">
            <User size={14} className="text-[#8A7264]" />
            <span className="text-xs font-semibold text-[#8A7264]">
              Customer Details
              <span className="text-red-500 font-normal ml-1">· Required</span>
            </span>
          </div>
          {isDetailsOpen ? <ChevronUp size={16} className="text-[#8A7264]" /> : <ChevronDown size={16} className="text-[#8A7264]" />}
        </button>

        {isDetailsOpen && (
          <div className="px-5 pb-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
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
              <div>
                <input 
                  type="text" 
                  placeholder={isBuyNow ? "Customer Name" : "Customer Name *"}
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="relative" ref={calendarWrapRef}>
                {isBuyNow ? (
                  <div className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl bg-[#F5EFEB] opacity-70 cursor-not-allowed text-[#3B1F0A] flex items-center gap-2">
                    <Lock size={12} /> Today
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      ref={calendarTriggerRef}
                      onClick={() => {
                        if (!showCalendar && calendarTriggerRef.current) {
                          const rect = calendarTriggerRef.current.getBoundingClientRect();
                          setCalendarOpenUpward(window.innerHeight - rect.bottom < 340);
                        }
                        setShowCalendar(s => !s);
                      }}
                      className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors text-left bg-white flex items-center justify-between"
                    >
                      <span className={form.pickupDate ? 'text-[#3B1F0A] truncate' : 'text-[#8A7264] truncate'}>
                        {form.pickupDate ? formatDateLong(form.pickupDate) : 'Pick-up Date *'}
                      </span>
                      <CalendarIcon size={14} className="text-[#8A7264] shrink-0 ml-1" />
                    </button>
                    {showCalendar && (
                      <MonthCalendar
                        selectedDate={form.pickupDate}
                        minDate={minPreOrderDate}
                        todayDate={getLiveNow().dateStr}
                        openUpward={calendarOpenUpward}
                        onSelect={(dateStr) => setForm(f => ({...f, pickupDate: dateStr}))}
                        onClose={() => setShowCalendar(false)}
                      />
                    )}
                  </>
                )}
              </div>
              
              <div className="relative" ref={timePickerWrapRef}>
                {isBuyNow && getLiveNow().timeStr > SHOP_CLOSE_TIME ? (
                  <div className="w-full border border-red-200 px-3.5 py-2.5 text-xs rounded-xl bg-red-50 text-red-600 flex items-center gap-2">
                    <Lock size={12} /> Closed
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      ref={timePickerTriggerRef}
                      onClick={() => {
                        if (!showTimePicker && timePickerTriggerRef.current) {
                          const rect = timePickerTriggerRef.current.getBoundingClientRect();
                          setTimePickerOpenUpward(window.innerHeight - rect.bottom < 230);
                        }
                        setShowTimePicker(s => !s);
                      }}
                      className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors text-left bg-white flex items-center justify-between"
                    >
                      <span className={form.pickupTime ? 'text-[#3B1F0A] truncate' : 'text-[#8A7264] truncate'}>
                        {form.pickupTime ? formatTime(form.pickupTime) : 'Pick-up Time *'}
                      </span>
                    </button>
                    {showTimePicker && (
                      <TimePicker
                        value={form.pickupTime}
                        minTime={isBuyNow ? getEffectiveMinTimeForToday() : SHOP_OPEN_TIME}
                        maxTime={SHOP_CLOSE_TIME}
                        openUpward={timePickerOpenUpward}
                        onChange={(val) => setForm(f => ({...f, pickupTime: val}))}
                        onClose={() => setShowTimePicker(false)}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      )}

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
            
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-[#4A3B36] whitespace-nowrap">Discount</label>
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  placeholder="Name (e.g. Senior)"
                  value={discountName}
                  onChange={(e) => setDiscountName(e.target.value)}
                  className="w-32 border border-[#EAE4E0] rounded-xl px-3 py-2 text-xs text-[#3B1F0A] focus:outline-none focus:border-[#5A453C] bg-white transition-colors"
                />
                <input 
                  type="number" 
                  min="0"
                  max="100"
                  placeholder="%"
                  value={discountPercentage}
                  onChange={(e) => setDiscountPercentage(e.target.value)}
                  className="w-16 border border-[#EAE4E0] rounded-xl px-3 py-2 text-xs text-[#3B1F0A] text-right focus:outline-none focus:border-[#5A453C] bg-white transition-colors"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-b border-[#F1EBE6] shrink-0 flex justify-between items-center bg-white">
        <h3 className="font-serif text-sm text-[#8A7264] font-semibold">Current Order</h3>
        <span className="text-[11px] text-[#8A7264]">{cart.length} items</span>
      </div>

      <div className="p-5 flex flex-col gap-4 bg-white">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-[#B7A99F] gap-2 opacity-60">
            <ShoppingCart size={32} />
            <p className="text-xs">No items yet. Select from the left panel.</p>
          </div>
        ) : (
          cart.map((item, idx) => (
            <div key={idx} className="flex justify-between items-start gap-3 pb-4 border-b border-[#F1EBE6] last:border-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-[#3B1F0A] truncate">{item.name}</p>
                {item.details && <p className="text-[10px] text-[#8A7264] leading-snug mt-0.5 max-w-[200px] truncate">Note: {item.details}</p>}
                
                <div className="flex items-center gap-2 mt-2">
                  <button onClick={() => onUpdateQty(idx, -1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Minus size={12} /></button>
                  <span className="font-mono text-xs w-4 text-center">{item.qty}</span>
                  <button onClick={() => onUpdateQty(idx, 1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Plus size={12} /></button>
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
          onClick={handleCompleteOrder}
          disabled={cart.length === 0 || isProcessing}
          className="w-full bg-[#3B1F0A] text-white py-3 rounded-xl text-sm font-semibold hover:bg-[#2A1608] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {isProcessing ? 'Processing...' : 'Complete Order'}
        </button>
      </div>

      {toastMessage && (
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
        </div>
      )}
    </div>
  );
}