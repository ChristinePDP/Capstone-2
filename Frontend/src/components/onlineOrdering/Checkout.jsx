// src/components/onlineOrdering/Checkout.jsx
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, CreditCard, Receipt, ChevronLeft, ChevronRight, ChevronDown, Calendar as CalendarIcon, Lock, AlertCircle } from 'lucide-react';
import Header from '../onlineOrdering/Header';
import Footer from '../onlineOrdering/Footer';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Formats a 'YYYY-MM-DD' string as an unambiguous long date, e.g. "August 8, 2026".
// Avoids the MM/DD vs DD/MM confusion of native date inputs.
function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]} ${d}, ${y}`;
}

// Builds a Date-safe 'YYYY-MM-DD' string from a year/month/day triple.
function toDateStr(year, month, day) {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

// Self-contained month calendar used for Pre-Order date selection.
function MonthCalendar({ selectedDate, minDate, todayDate, openUpward, onSelect, onClose }) {
  const initial = selectedDate || minDate || todayDate;
  const [iy, im] = initial.split('-').map(Number);
  const [viewYear, setViewYear] = useState(iy);
  const [viewMonth, setViewMonth] = useState(im - 1); // 0-indexed

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
    <div className={`absolute z-20 bg-white border border-[#EAE4E0] rounded-xl shadow-lg p-3 w-[280px] ${openUpward ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={goPrev} disabled={!canGoPrev} className={`p-1 rounded-lg hover:bg-[#F5EFEB] ${!canGoPrev ? 'opacity-30 cursor-not-allowed' : ''}`}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-bold text-[#3B1F0A]">{MONTH_LABELS[viewMonth]} {viewYear}</span>
        <button type="button" onClick={goNext} className="p-1 rounded-lg hover:bg-[#F5EFEB]">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_LABELS.map(w => (
          <div key={w} className="text-[10px] font-bold text-[#8A7264] text-center py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell.inMonth) {
            return <div key={idx} className="text-[11px] text-center py-1.5 text-[#D8CFC9]">{cell.day}</div>;
          }
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

export default function Checkout({ cart, setCart }) {
  const navigate = useNavigate();

  const hasPreOrder = cart.some(item => item.order_type === 'Pre-order');
  const hasPickUpToday = cart.some(item => item.order_type === 'Pick-up Today');
  // Pre-order ALWAYS wins, kahit may kasamang item na 'Pick-up Today' o 'Both'
  // sa cart. Kailangan ito dahil literal na hindi maaaring pick-upin ngayon
  // din ang isang Pre-order item (may required lead time) — kaya kapag may
  // isang Pre-order item, ang buong order ay dapat Pre-order na rin, hindi
  // basta ma-o-override ng ibang item na 'Pick-up Today'/'Both'.
  const forcedPickupType = hasPreOrder ? 'later' : (hasPickUpToday ? 'now' : 'now');
  
  const today = new Date();
  const todayString = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

  const [form, setForm] = useState({
    name: '',
    phone: '',
    altPhone: '',
    pickupDate: forcedPickupType === 'now' ? todayString : '',
    pickupTime: '',
    instructions: '',
  });

  const [pickupType, setPickupType] = useState(forcedPickupType);
  const [paymentType, setPaymentType] = useState('half');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarOpenUpward, setCalendarOpenUpward] = useState(false);
  const calendarWrapRef = useRef(null);
  const calendarTriggerRef = useRef(null);

  // Close the custom calendar popover when clicking outside of it.
  useEffect(() => {
    if (!showCalendar) return;
    const handleClickOutside = (e) => {
      if (calendarWrapRef.current && !calendarWrapRef.current.contains(e.target)) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendar]);

  const totalAmount = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const halfAmount = totalAmount / 2;

  const getLiveNow = () => {
    const now = new Date();
    const dateStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);
    return { dateStr, timeStr };
  };

  // Defensive sync: whenever pickupType is 'now', force form.pickupDate to today.
  // Needed because the initial useState only pre-fills pickupDate when
  // hasPickUpToday is true, but items with order_type 'Both' don't set that
  // flag — leaving pickupDate stuck at '' even though the UI shows a locked
  // "(Today)" date. That mismatch was silently failing the required-field check.
  useEffect(() => {
    if (pickupType === 'now') {
      const { dateStr } = getLiveNow();
      setForm(f => (f.pickupDate === dateStr ? f : { ...f, pickupDate: dateStr }));
    }
  }, [pickupType]);

  const addDaysToDateString = (dateStr, days) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  };

  const hasStrictPreOrder = cart.some(item => item.order_type === 'Pre-order');
  const PRE_ORDER_MIN_LEAD_DAYS = hasStrictPreOrder ? 3 : 1;
  const minPreOrderDate = addDaysToDateString(getLiveNow().dateStr, PRE_ORDER_MIN_LEAD_DAYS);

  const SHOP_CLOSE_TIME = '17:00';

  // NOTE: date selection is now handled directly by the custom MonthCalendar's
  // onSelect callback, which only ever passes already-valid, non-disabled dates —
  // so no separate change-handler/alert is needed here anymore.

  // A slot is disabled only for "Pick-up Today" orders once its end time has already passed.
  const isSlotDisabled = (slot) => {
    if (pickupType !== 'now') return false;
    const { timeStr } = getLiveNow();
    return slot.end <= timeStr;
  };

  const handleProceedToOrder = () => {
    // 1. HIGHEST PRIORITY: Check if trying to pick up today when shop is already closed
    if (pickupType === 'now' && getLiveNow().timeStr > SHOP_CLOSE_TIME) {
      return setToastMessage('Shop is already closed for today. Please select Pre-Order.');
    }

    // 2. Check if all required fields are filled out
    // NOTE: pickupDate is only user-selectable (and thus only required) for
    // Pre-Order ('later'). For 'now' orders the date is always "today" and is
    // derived live from getLiveNow() in the payload, so it isn't required here.
    const needsPickupDate = pickupType === 'later';
    if (!form.name || !form.phone || (needsPickupDate && !form.pickupDate) || !form.pickupTime) {
      return setToastMessage('Please complete all required fields (*)');
    }

    // 3. Check number formats (Exactly 11 digits)
    const phoneRegex = /^\d{11}$/;
    
    if (!phoneRegex.test(form.phone)) {
      return setToastMessage('Your Contact Number must be exactly 11 digits.');
    }

    if (form.altPhone && !phoneRegex.test(form.altPhone)) {
      return setToastMessage('Your Alternative Number must be exactly 11 digits.');
    }

    // Passed all validations
    setShowSummaryModal(true);
  };

  const handlePlaceOrder = async () => {
    setIsProcessing(true);
    let updatedCart = [...cart];

    for (let i = 0; i < updatedCart.length; i++) {
      if (updatedCart[i].inspiration_image instanceof File) {
        const formData = new FormData();
        formData.append('image', updatedCart[i].inspiration_image);

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
      }
    }

    // 2. BUILD PAYLOAD
    const selectedSlot = TIME_SLOTS.find(s => s.value === form.pickupTime);
    const orderPayload = {
        orderType: pickupType === 'now' ? 'Buy Now' : 'Pre-Order',
        customer: {
          name: form.name,
          contactNumber: form.phone,
          alternativeNumber: form.altPhone || null,
        },
        pickup: {
          date: pickupType === 'now' ? getLiveNow().dateStr : form.pickupDate,
          time: selectedSlot?.start || '',
          timeEnd: selectedSlot?.end || '',
          timeSlot: form.pickupTime,
          timeLabel: selectedSlot?.label || '',
        },
        specialInstructions: form.instructions || null,
        items: updatedCart.map(item => ({
          productId: item.id ?? null,
          name: item.name,
          category: item.category,
          quantity: item.qty,
          unitPrice: item.price,
          subtotal: item.price * item.qty,
          orderSlip: item.order_slip_details || {},
          selectedPriceOptions: item.selected_price_options || null, 
          inspirationUrl: item.inspiration_url || null,
          // Kailangan ito para malaman ng backend (onlineOrdering.services.js
          // resolveOrderItems) na dapat i-explode ang item na ito sa
          // individual component products ng bundle, sa halip na ituring
          // itong isang regular na product (na magre-resulta sa invalid
          // product_id / walang laman na order_items).
          type: item.type || null,
          bundleId: item.bundleId || null,
        })),
        payment: {
          type: paymentType === 'half' ? 'deposit' : 'full',
          amountDueNow: paymentType === 'half' ? halfAmount : totalAmount,
          balanceAtPickup: paymentType === 'half' ? halfAmount : 0,
          grandTotal: totalAmount,
        },
        createdAt: new Date().toISOString(),
      };

    // IMPORTANT: wala nang direct save sa `orders` table dito. Ang order ay
    // sina-save lang sa database ng backend sa loob ng PayMongo webhook
    // (`/paymongo-webhook`), pagkatapos lang ma-confirm na nabayaran talaga.
    // Ang tempOrderData dito ay para lang sa local receipt preview ni
    // Confirm.jsx habang naghihintay ng webhook confirmation.
    sessionStorage.setItem('tempOrderData', JSON.stringify({
      form,
      pickupType,
      paymentType,
      orderPayload,
      cart: updatedCart,
    }));

    const amountToPay = paymentType === 'half' ? halfAmount : totalAmount;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/paymongo-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountToPay,
          description: `Aileen Cake Max - ${pickupType === 'now' ? 'Pick-up Today' : 'Pre-Order'}`,
          customerName: form.name,
          customerPhone: form.phone,
          frontendUrl: window.location.origin,
          orderPayload, // buong order payload — ito ang ida-stage server-side
        })
      });

      const data = await response.json();
if (data.success && data.checkoutUrl) {
        // I-remember kung anong pending order ang hinihintay natin,
        // gagamitin ito ni Confirm.jsx para mag-poll ng status.
        sessionStorage.setItem('pendingOrderId', data.pendingOrderId);
        window.location.href = data.checkoutUrl;
      } else {
        // Basahin ang error message galing backend (data.message), kung wala, tsaka gamitin ang fallback
        setToastMessage(data.message || 'Failed to generate payment link. Please try again.');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Error initiating payment:', error);
      setToastMessage('Network error. Please try again later.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-[#FCFAF9] min-h-screen flex flex-col relative">
      <Header page="checkout" />

      <div className="flex-1 w-full max-w-[1440px] mx-auto flex flex-col lg:flex-row gap-6 lg:gap-10 px-5 sm:px-8 py-6 lg:py-4 lg:pl-[140px] xl:pl-[160px]">

        {/* LEFT COLUMN: Step 1 */}
        <div className="flex-1 flex flex-col lg:h-[calc(100vh-112px)] min-h-0 lg:border-l lg:border-[#EAE4E0] lg:pl-6 lg:pr-2 lg:overflow-y-auto scrollbar-thin">
          <div className="flex flex-col lg:bg-white lg:rounded-3xl lg:border lg:border-[#EAE4E0] lg:shadow-sm lg:overflow-hidden">

              <div className="bg-white rounded-2xl border border-[#EAE4E0] p-5 sm:p-6 shadow-sm flex flex-col shrink-0 lg:rounded-none lg:border-0 lg:shadow-none">
                  <div className="flex items-center gap-2.5 mb-3.5 shrink-0">
                    <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0">
                      <ClipboardList size={14} />
                    </div>
                    <h3 className="text-lg font-serif text-[#3B1F0A] leading-none">Pick-up & Customer Details</h3>
                  </div>
                  <div className="w-full h-px bg-[#EAE4E0] mb-4 shrink-0"></div>

                  <div className="flex bg-[#F5EFEB] rounded-xl p-1 mb-4 w-full shrink-0">
                    <button
                      onClick={() => {
                        if (hasPreOrder) return;
                        // Re-sync date to the live clock whenever switching to Pick-up Today.
                        const { dateStr } = getLiveNow();
                        setPickupType('now');
                        setForm({...form, pickupDate: dateStr, pickupTime: ''});
                      }}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${pickupType === 'now' ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'} ${hasPreOrder ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Pick-up Today
                    </button>
                    <button
                      onClick={() => {
                        if (hasPickUpToday && !hasPreOrder) return;
                        setPickupType('later');
                        setForm({...form, pickupDate: '', pickupTime: ''});
                      }}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${pickupType === 'later' ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'} ${hasPickUpToday && !hasPreOrder ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Pre-Order
                    </button>
                  </div>

                  <div className="flex flex-col gap-3.5 shrink-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                              <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Full Name <span className="text-red-500">*</span></label>
                              <input 
                                type="text" 
                                placeholder="e.g. Juan Dela Cruz" 
                                value={form.name}
                                className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors" 
                                onChange={e => setForm({...form, name: e.target.value})} 
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Contact Number <span className="text-red-500">*</span></label>
                              <input 
                                type="text" 
                                placeholder="09xxxxxxxxx" 
                                maxLength="11"
                                value={form.phone}
                                className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors" 
                                onChange={e => {
                                  // Regex removes any non-digit character
                                  const onlyNums = e.target.value.replace(/\D/g, '');
                                  setForm({...form, phone: onlyNums});
                                }} 
                              />
                          </div>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Alternative Number</label>
                          <input 
                            type="text" 
                            placeholder="Optional (09xxxxxxxxx)" 
                            maxLength="11"
                            value={form.altPhone}
                            className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors" 
                            onChange={e => {
                                const onlyNums = e.target.value.replace(/\D/g, '');
                                setForm({...form, altPhone: onlyNums});
                            }} 
                          />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-4">
                          <div className="relative" ref={calendarWrapRef}>
                              <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Pickup Date <span className="text-red-500">*</span></label>

                              {pickupType === 'now' ? (
                                <div className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl bg-[#F5EFEB] opacity-70 cursor-not-allowed text-[#3B1F0A] flex items-center gap-2">
                                  <Lock size={12} />
                                  {formatDateLong(getLiveNow().dateStr)} (Today)
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    ref={calendarTriggerRef}
                                    onClick={() => {
                                      if (!showCalendar && calendarTriggerRef.current) {
                                        const rect = calendarTriggerRef.current.getBoundingClientRect();
                                        const CALENDAR_HEIGHT_ESTIMATE = 340;
                                        const spaceBelow = window.innerHeight - rect.bottom;
                                        const spaceAbove = rect.top;
                                        setCalendarOpenUpward(spaceBelow < CALENDAR_HEIGHT_ESTIMATE && spaceAbove > spaceBelow);
                                      }
                                      setShowCalendar(s => !s);
                                    }}
                                    className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors text-left bg-white flex items-center justify-between"
                                  >
                                    <span className={form.pickupDate ? 'text-[#3B1F0A]' : 'text-[#8A7264]'}>
                                      {form.pickupDate ? formatDateLong(form.pickupDate) : 'Select pickup date'}
                                    </span>
                                    <CalendarIcon size={14} className="text-[#8A7264]" />
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
                                  <p className="text-[10px] text-[#8A7264] mt-1">Requires at least {PRE_ORDER_MIN_LEAD_DAYS} {PRE_ORDER_MIN_LEAD_DAYS === 1 ? 'day' : 'days'} advance notice (earliest: {formatDateLong(minPreOrderDate)})</p>
                                </>
                              )}
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Pickup Time <span className="text-red-500">*</span></label>
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

                      <div className="mb-4 pb-6">
                          <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Suggestions / Special Instructions</label>
                          <input
                            type="text"
                            placeholder="Anything else we should know?"
                            value={form.instructions}
                            className="w-full h-[42px] border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors text-ellipsis overflow-hidden whitespace-nowrap"
                            onChange={e => setForm({...form, instructions: e.target.value})}
                          />
                      </div>
                  </div>
              </div>

          </div>
        </div>

        {/* RIGHT COLUMN: Step 2 (Payment) */}
        <div className="flex lg:flex-col w-full lg:w-[360px] bg-white rounded-3xl border border-[#EAE4E0] shadow-sm shrink-0 lg:max-h-[calc(100vh-112px)] overflow-hidden flex-col">

          <div className="flex-1 min-h-0 px-5 py-4 flex flex-col gap-5 overflow-y-auto scrollbar-thin">
              <div className="flex flex-col shrink-0">
                  <div className="flex items-center gap-2.5 mb-3 shrink-0">
                      <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0">
                        <CreditCard size={14} />
                      </div>
                      <h3 className="text-lg font-serif text-[#3B1F0A] leading-none">Payment</h3>
                  </div>
                  <div className="w-full h-px bg-[#EAE4E0] mb-3 shrink-0"></div>
                  <p className="text-[11px] text-[#8A7264] mb-3.5 shrink-0">We require at least a 50% deposit to process your order.</p>

                  <div className="grid grid-cols-1 gap-3 shrink-0">
                      <div
                          onClick={() => setPaymentType('half')}
                          className={`border rounded-xl p-3 cursor-pointer transition-all ${paymentType === 'half' ? 'border-[#4A3B36] bg-[#F5EFEB]' : 'border-[#EAE4E0] bg-white hover:border-[#DED4CC]'}`}
                      >
                          <div className="flex items-center gap-2 mb-1">
                              <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${paymentType === 'half' ? 'border-[#4A3B36]' : 'border-[#B7A99F]'}`}>
                                  {paymentType === 'half' && <div className="w-1.5 h-1.5 rounded-full bg-[#4A3B36]"></div>}
                              </div>
                              <span className="text-xs font-bold text-[#3B1F0A]">50% Deposit</span>
                          </div>
                          <p className="text-[10px] text-[#8A7264] pl-[22px] leading-snug mb-1 opacity-90">Pay half now, balance upon pick-up.</p>
                          <div className="pl-[22px] font-bold text-[#3B1F0A] text-xs">₱{halfAmount.toLocaleString()}</div>
                      </div>

                      <div
                          onClick={() => setPaymentType('full')}
                          className={`border rounded-xl p-3 cursor-pointer transition-all ${paymentType === 'full' ? 'border-[#4A3B36] bg-[#F5EFEB]' : 'border-[#EAE4E0] bg-white hover:border-[#DED4CC]'}`}
                      >
                          <div className="flex items-center gap-2 mb-1">
                              <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${paymentType === 'full' ? 'border-[#4A3B36]' : 'border-[#B7A99F]'}`}>
                                  {paymentType === 'full' && <div className="w-1.5 h-1.5 rounded-full bg-[#4A3B36]"></div>}
                              </div>
                              <span className="text-xs font-bold text-[#3B1F0A]">Full Payment</span>
                          </div>
                          <p className="text-[10px] text-[#8A7264] pl-[22px] leading-snug mb-1 opacity-90">Pay in full for hassle-free pick-up.</p>
                          <div className="pl-[22px] font-bold text-[#3B1F0A] text-xs">₱{totalAmount.toLocaleString()}</div>
                      </div>
                  </div>
              </div>

          </div>

          <div className="px-5 pt-2.5 pb-3.5 shrink-0 border-t border-[#F1EBE6] bg-white">
            <div className="mb-2">
              {paymentType === 'half' ? (
                <>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-[#8A7264]">To Pay Now (50%)</span>
                    <span className="text-[11px] text-[#8A7264]">₱{halfAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#8A7264]">Balance at Pick-up</span>
                    <span className="text-[11px] text-[#8A7264]">₱{halfAmount.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-px bg-[#F1EBE6] mb-1"></div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#8A7264]">To Pay Now</span>
                    <span className="text-[11px] text-[#8A7264]">₱{totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-px bg-[#F1EBE6] mb-1"></div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#5A453C]">Grand Total</span>
                <span className="font-serif text-base text-[#3B1F0A]">₱{totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <button
              onClick={handleProceedToOrder}
              disabled={isProcessing}
              className="w-full bg-[#3B1F0A] text-white py-2.5 rounded-full text-xs font-semibold hover:bg-[#2A1608] disabled:opacity-75 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Processing Payment...' : 'Proceed to Order'}
            </button>
            <button
              onClick={() => navigate('/onlineOrdering/menu')}
              disabled={isProcessing}
              className="w-full text-[11px] font-bold text-[#8A7264] hover:text-[#4A3B36] mt-2 text-center transition-colors disabled:opacity-50"
            >
              &larr; Back to Menu
            </button>
          </div>
        </div>
      </div>

      {/* --- REVISED TWO-COLUMN ORDER SUMMARY MODAL --- */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 px-4 py-6 sm:px-5">
          <div className="bg-white rounded-3xl border border-[#EAE4E0] shadow-xl w-full max-w-[760px] max-h-[90vh] flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="p-4 pb-3 sm:p-5 sm:pb-4 flex items-center gap-2.5 shrink-0 border-b border-[#F1EBE6] bg-[#FCFAF9]">
              <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0">
                <Receipt size={14} />
              </div>
              <h3 className="text-base sm:text-lg font-serif text-[#3B1F0A] leading-none">Order Summary</h3>
            </div>

            {/* Layout Container */}
            <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
              
              {/* Left Column: Customer & Pickup Details */}
              <div className="w-full md:w-[300px] flex-shrink-0 border-b md:border-b-0 md:border-r border-[#F1EBE6] bg-[#FCFAF9] p-4 sm:p-5 overflow-y-auto scrollbar-thin">
                <h4 className="text-xs font-bold text-[#8A7264] uppercase tracking-wider mb-3">Order Details</h4>
                <div className="flex flex-col gap-2.5 text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#B7A99F]">Order Type</span>
                    <span className="text-[#3B1F0A] font-semibold">{pickupType === 'now' ? 'Pick-up Today' : 'Pre-Order'}</span>
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

                  <span className="text-[#8A7264]">Date & Time</span>
                  <span className="text-[#3B1F0A] font-semibold text-right truncate">
                    {form.pickupDate || '—'} {form.pickupTime && `• ${getSlotLabel(form.pickupTime)}`}
                  </span>

                  {form.instructions && (
                    <div className="flex flex-col gap-0.5 mt-2 p-2.5 bg-white border border-[#EAE4E0] rounded-xl">
                      <span className="text-[10px] text-[#B7A99F] uppercase font-semibold">Special Instructions</span>
                      <span className="text-[#3B1F0A] mt-0.5">{form.instructions}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Items & Payment */}
              <div className="flex-1 flex flex-col min-w-0 bg-white">
                
                {/* Scrollable Items List */}
                <div className="flex-1 p-4 sm:p-5 overflow-y-auto scrollbar-thin flex flex-col gap-3.5">
                  <h4 className="text-xs font-bold text-[#8A7264] uppercase tracking-wider mb-1">Items ({cart.length})</h4>
                  
                  {cart.map((item, i) => {
                    // 1. Fallback sa default product image
                    let imgSrc = item.image || item.image_url; 

                    // 2. Override kung may uploaded inspiration image (Pre-order custom cakes)
                    if (item.inspiration_image instanceof File) {
                      imgSrc = URL.createObjectURL(item.inspiration_image);
                    } else if (item.inspiration_image && typeof item.inspiration_image === 'string') {
                      imgSrc = item.inspiration_image;
                    }

                    // 3. Safety check: Kung relative path/filename lang ang item.image mula sa database, 
                    // i-dudugtong natin ang backend URL para lumabas nang tama.
                    if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('blob:') && !imgSrc.startsWith('data:')) {
                      // Note: I-adjust ang '/uploads/' kung iba ang folder name mo sa backend (e.g. '/images/')
                      imgSrc = `${import.meta.env.VITE_API_URL}/uploads/${imgSrc.replace(/^\//, '')}`;
                    }

                    return (
                      <div key={i} className="flex gap-3.5 pb-3.5 border-b border-[#F1EBE6] last:border-0 last:pb-0">
                        {/* Preview Image */}
                        <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 bg-[#F5EFEB] rounded-xl border border-[#EAE4E0] overflow-hidden flex items-center justify-center">
                          {imgSrc ? (
                            <img src={imgSrc} alt={item.name} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[#B7A99F] text-[10px]">No Image</span>
                          )}
                        </div>

                        {/* Item Details */}
                        <div className="min-w-0 flex-1 flex flex-col">
                          <div className="flex justify-between items-start gap-2 mb-1">
                            <p className="font-bold text-xs sm:text-sm text-[#3B1F0A] line-clamp-2 leading-snug">{item.qty}x {item.name}</p>
                            <span className="font-bold text-xs sm:text-sm text-[#5A453C] shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
                          </div>
                          
                          {item.selected_price_options && Object.keys(item.selected_price_options).length > 0 && (
                            <div className="flex flex-col gap-0.5">
                              {Object.entries(item.selected_price_options).map(([label, value]) => (
                                <p key={label} className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">
                                  <span className="font-medium">{label}:</span> {value}
                                </p>
                              ))}
                            </div>
                          )}
                          
                          {item.type === 'bundle' && item.order_slip_details && Object.keys(item.order_slip_details).length > 0 ? (
                            <div className="flex flex-col gap-0.5 mt-1">
                              {Object.entries(item.order_slip_details).map(([prodId, answers]) => {
                                const pName = item.products?.find(p => p.id === prodId)?.name || 'Item';
                                return Object.entries(answers || {}).map(([label, value]) => (
                                  <p key={`slip-${prodId}-${label}`} className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">
                                    <span className="font-medium">{pName} - {label}:</span> {value}
                                  </p>
                                ));
                              })}
                            </div>
                          ) : (
                            item.order_slip_details && Object.keys(item.order_slip_details).length > 0 && (
                              <div className="flex flex-col gap-0.5 mt-1">
                                {Object.entries(item.order_slip_details).map(([label, value]) => (
                                  <p key={label} className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">
                                    <span className="font-medium">{label}:</span> {value}
                                  </p>
                                ))}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Fixed Payment Section */}
                <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-4 sm:pb-5 shrink-0 border-t border-[#EAE4E0] bg-[#FCFAF9]">
                  <div className="mb-4">
                    {paymentType === 'half' ? (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-[#8A7264]">To Pay Now (50%)</span>
                          <span className="text-xs text-[#8A7264] font-medium">₱{halfAmount.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-[#8A7264]">Balance at Pick-up</span>
                          <span className="text-xs text-[#8A7264] font-medium">₱{halfAmount.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-px bg-[#EAE4E0] mb-2"></div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-[#8A7264]">To Pay Now</span>
                          <span className="text-xs text-[#8A7264] font-medium">₱{totalAmount.toLocaleString()}</span>
                        </div>
                        <div className="w-full h-px bg-[#EAE4E0] mb-2"></div>
                      </>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#5A453C]">Grand Total</span>
                      <span className="font-serif text-lg sm:text-xl text-[#3B1F0A]">₱{totalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                  
                  {/* Action Buttons side by side */}
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
        </div>
      )}

      {/* --- Custom Alert Modal (Toast) --- */}
      {toastMessage && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 px-4">
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

      <Footer />
    </div>
  );
}