import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  User, ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  Calendar as CalendarIcon, Clock, Check, Lock, Receipt, AlertTriangle
} from 'lucide-react';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function formatDateLong(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${MONTH_LABELS[m - 1]} ${d}, ${y}`;
}

function toDateStr(year, month, day) {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export const getLiveNow = () => {
  const now = new Date();
  const dateStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  const timeStr = now.toTimeString().slice(0, 5);
  return { dateStr, timeStr };
};

export const addDaysToDateString = (dateStr, days) => {
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

export const TIME_SLOTS = [
  { value: '08:00-10:00', label: '8:00 AM - 10:00 AM', start: '08:00', end: '10:00' },
  { value: '10:00-12:00', label: '10:00 AM - 12:00 PM', start: '10:00', end: '12:00' },
  { value: '12:00-15:00', label: '12:00 PM - 3:00 PM', start: '12:00', end: '15:00' },
  { value: '15:00-17:00', label: '3:00 PM - 5:00 PM', start: '15:00', end: '17:00' },
];

export function getSlotLabel(value) {
  return TIME_SLOTS.find(s => s.value === value)?.label || '';
}

// ─────────────────────────────────────────────────────────────
// OrderSummaryModal — dating "Order Summary" modal ng posCart.jsx.
// Dinala rito ang buong modal (kasama ang calendar + time-slot
// dropdown na dating nasa "Customer Details" collapsible ng cart
// panel). Ang kaliwang column na dating read-only na "Order Details"
// summary ay ngayon ay live, editable na Customer Details form —
// dito na direktang nire-fill out/inaayos ng cashier ang Name,
// Contact, Pick-up Date/Time bago i-Place Order.
// ─────────────────────────────────────────────────────────────
export default function OrderSummaryModal({
  show,
  onBack,
  cart,
  orderType,
  form,
  setForm,
  minPreOrderDate,
  paymentMode,
  discountName,
  percentageNumber,
  discountAmount,
  chargeAmount,
  subtotal,
  cartTotal,
  amountDue,
  isProcessing,
  onPlaceOrder,
  onValidate,
}) {
  const isBuyNow = orderType === 'Buy Now';

  // FIX (req #1): dagdag na "Are you sure?" confirmation bago talaga
  // isubmit ang order — hindi na direktang tumatawag ang "Place Order"
  // button papunta sa onPlaceOrder(); nagpapakita muna ito ng maliit na
  // confirm dialog sa ibabaw ng modal na ito. `onPlaceOrder` (galing sa
  // posCart.jsx) lang ang tumatawag sa backend, kaya isang beses lang
  // itong tatakbo pagkatapos ma-confirm.
  const [showConfirm, setShowConfirm] = useState(false);

  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarPos, setCalendarPos] = useState(null);
  const calendarWrapRef = useRef(null);
  const calendarTriggerRef = useRef(null);
  const calendarPortalRef = useRef(null);

  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [timeDropdownPos, setTimeDropdownPos] = useState(null);
  const timeDropdownWrapRef = useRef(null);
  const timeDropdownTriggerRef = useRef(null);
  const timeDropdownPortalRef = useRef(null);

  // Sinasadyang magkahiwalay na "open" functions (hindi lang simpleng toggle)
  // para tuwing bubuksan ang isa, sarado agad ang kabila — hindi dapat sabay
  // na naka-open ang Pick-up Date calendar at Pick-up Time list.
  const openCalendar = () => {
    if (calendarTriggerRef.current) {
      const rect = calendarTriggerRef.current.getBoundingClientRect();
      const CALENDAR_WIDTH = 280;
      // Tumpak na estimate base sa aktwal na laki ng MonthCalendar (header + weekday row
      // + hanggang 6 na row ng araw); dati 330 na sobrang laki, kaya lumalabas na "sagad
      // sa baba" ang calendar bago pa man ma-trigger yung open-upward logic.
      const CALENDAR_HEIGHT_ESTIMATE = 270;
      const MARGIN = 12;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < CALENDAR_HEIGHT_ESTIMATE + MARGIN && spaceAbove > spaceBelow;
      const left = Math.min(rect.left, window.innerWidth - CALENDAR_WIDTH - MARGIN);
      setCalendarPos({
        position: 'fixed',
        left: Math.max(left, MARGIN),
        // Kapag downward: i-clamp ang top para kahit paborable ang space-below check,
        // hindi na aabot/dadapo ang ilalim ng calendar sa sobrang ilalim ng screen.
        ...(openUpward
          ? { bottom: Math.max(window.innerHeight - rect.top + 4, MARGIN) }
          : { top: Math.min(rect.bottom + 4, window.innerHeight - CALENDAR_HEIGHT_ESTIMATE - MARGIN) })
      });
    }
    setShowTimeDropdown(false);
    setShowCalendar(true);
  };

  const openTimeDropdown = () => {
    if (timeDropdownTriggerRef.current) {
      const rect = timeDropdownTriggerRef.current.getBoundingClientRect();
      const DROPDOWN_WIDTH = 220;
      const DROPDOWN_HEIGHT_ESTIMATE = 250;
      const MARGIN = 12;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < DROPDOWN_HEIGHT_ESTIMATE + MARGIN && spaceAbove > spaceBelow;
      const left = Math.min(rect.left, window.innerWidth - DROPDOWN_WIDTH - MARGIN);
      setTimeDropdownPos({
        position: 'fixed',
        left: Math.max(left, MARGIN),
        ...(openUpward
          ? { bottom: Math.max(window.innerHeight - rect.top + 4, MARGIN) }
          : { top: Math.min(rect.bottom + 4, window.innerHeight - DROPDOWN_HEIGHT_ESTIMATE - MARGIN) })
      });
    }
    setShowCalendar(false);
    setShowTimeDropdown(true);
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
    const handleClickOutside = (e) => {
      if (!showTimeDropdown) return;
      const clickedTrigger = timeDropdownWrapRef.current && timeDropdownWrapRef.current.contains(e.target);
      const clickedPortal = timeDropdownPortalRef.current && timeDropdownPortalRef.current.contains(e.target);
      if (!clickedTrigger && !clickedPortal) setShowTimeDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTimeDropdown]);

  useEffect(() => {
    if (!showTimeDropdown) return;
    const handleScroll = () => setShowTimeDropdown(false);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [showTimeDropdown]);

  // Prevent the background POS screen from scrolling while this modal is open.
  useEffect(() => {
    if (!show) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [show]);

  const isSlotDisabled = (slot) => {
    if (orderType !== 'Buy Now') return false;
    const { timeStr } = getLiveNow();
    return slot.end <= timeStr;
  };

  if (!show) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1900] flex items-center justify-center bg-black/50 px-4 py-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-[#EAE4E0] shadow-xl w-full max-w-[900px] max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
        {/* FIX (req #2): "Order Summary" ang dating label dito, pero hindi
            na ito tumpak — ang laman ng modal na ito ay editable na
            Customer Details FORM (Name, Contact, Pick-up Date/Time) na
            kailangang punan/i-verify pa ng cashier, hindi lang basta
            read-only na buod. "Checkout" (kasama ang small subtitle) ang
            mas tamang tawag dito dahil dito na rin ang huling hakbang
            bago i-submit/i-Place Order. */}
        <div className="p-4 pb-3 sm:p-5 sm:pb-4 flex items-center gap-2.5 shrink-0 border-b border-[#F1EBE6] bg-[#FCFAF9]">
          <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0">
            <Receipt size={14} />
          </div>
          <div className="leading-tight">
            <h3 className="text-base sm:text-lg font-serif text-[#3B1F0A] leading-none">Checkout</h3>
            <p className="text-[10px] sm:text-[11px] text-[#B7A99F] mt-1">Confirm customer details and review items before placing the order</p>
          </div>
        </div>

        {/* Scrollable Body: Customer Details (form) + Items.
            FIX (mobile): dati, ang Payment + Action Buttons ay NASA LOOB ng Right
            Column (kasama ng Items), at ang Left Column (Customer Details) ay may
            sarili ring `overflow-y-auto`. Sa mobile (naka-stack ang mga columns
            pababa dahil `flex-col`), kapag mahaba ang Customer Details + Items, wala
            nang natitirang space ang Place Order/Back buttons sa ilalim ng flex-1
            na Right Column — at dahil `overflow-hidden` ang parent, basta NAWAWALA
            na lang sila (hindi man lang ma-scroll papunta doon). Ginawa na lang
            natin itong buong Customer Details + Items na IISANG unified scroll area sa
            mobile (may sarili pa ring per-column scroll sa md+/desktop), at inilabas
            natin ang Payment + Buttons bilang hiwalay, laging-nakikitang footer sa
            ibaba (see closing tags) — kaya garantisadong visible na ito lagi, kahit
            gaano pa kahaba ang laman sa itaas. Parehong pattern gaya ng Checkout.jsx. */}
        <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden overscroll-contain scrollbar-thin">
          <div className="w-full md:w-[340px] shrink-0 border-b md:border-b-0 md:border-r border-[#F1EBE6] bg-[#FCFAF9] p-4 sm:p-5 md:overflow-y-auto scrollbar-thin">
            <div className="flex items-center gap-2 mb-3">
              <User size={14} className="text-[#8A7264]" />
              <h4 className="text-xs font-bold text-[#8A7264] uppercase tracking-wider">
                Customer Details
                {isBuyNow ? (
                  <span className="text-[#B7A99F] font-normal normal-case ml-1">· Optional</span>
                ) : (
                  <span className="text-red-500 font-normal normal-case ml-1">· Required</span>
                )}
              </h4>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[#B7A99F] font-semibold uppercase tracking-wide">Order Type</span>
                <span className="text-xs text-[#3B1F0A] font-semibold">{orderType}</span>
              </div>

              <input
                type="text"
                placeholder={isBuyNow ? "Customer Name" : "Customer Name *"}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors bg-white"
              />

              <div className="grid grid-cols-2 gap-2.5">
                <input
                  type="text"
                  placeholder={isBuyNow ? "Phone Number" : "Phone Number *"}
                  maxLength="11"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
                  className="w-full min-w-0 border border-[#EAE4E0] px-3 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors bg-white"
                />

                <input
                  type="text"
                  placeholder="Alt. Phone"
                  maxLength="11"
                  value={form.altPhone}
                  onChange={e => setForm({ ...form, altPhone: e.target.value.replace(/\D/g, '') })}
                  className="w-full min-w-0 border border-[#EAE4E0] px-3 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="relative min-w-0" ref={calendarWrapRef}>
                  {orderType === 'Buy Now' ? (
                    <div className="w-full border border-[#EAE4E0] px-3 py-2.5 text-xs rounded-xl bg-[#F5EFEB] opacity-70 cursor-not-allowed text-[#3B1F0A] flex items-center justify-between">
                      <div className="flex items-center gap-1.5 truncate">
                        <Lock size={12} className="shrink-0" />
                        <span className="truncate">Today</span>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      ref={calendarTriggerRef}
                      onClick={() => (showCalendar ? setShowCalendar(false) : openCalendar())}
                      className="w-full min-w-0 border border-[#EAE4E0] px-3 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors text-left bg-white flex items-center justify-between"
                    >
                      <span className={form.pickupDate ? 'text-[#3B1F0A] truncate' : 'text-[#8A7264] truncate'}>
                        {form.pickupDate ? formatDateLong(form.pickupDate) : 'Date *'}
                      </span>
                      <CalendarIcon size={13} className="text-[#8A7264] shrink-0 ml-1" />
                    </button>
                  )}
                  {orderType !== 'Buy Now' && showCalendar && calendarPos && createPortal(
                    <div ref={calendarPortalRef}>
                      <MonthCalendar
                        selectedDate={form.pickupDate}
                        minDate={minPreOrderDate}
                        todayDate={getLiveNow().dateStr}
                        style={calendarPos}
                        onSelect={(dateStr) => setForm(f => ({ ...f, pickupDate: dateStr }))}
                        onClose={() => setShowCalendar(false)}
                      />
                    </div>,
                    document.body
                  )}
                </div>

                <div className="relative min-w-0" ref={timeDropdownWrapRef}>
                  <button
                    type="button"
                    ref={timeDropdownTriggerRef}
                    onClick={() => (showTimeDropdown ? setShowTimeDropdown(false) : openTimeDropdown())}
                    className={`w-full min-w-0 border border-[#EAE4E0] px-3 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors bg-white flex items-center justify-between text-left ${form.pickupTime ? 'text-[#3B1F0A]' : 'text-[#8A7264]'}`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <Clock size={12} className="text-[#8A7264] shrink-0" />
                      <span className="truncate">{form.pickupTime ? getSlotLabel(form.pickupTime) : 'Time *'}</span>
                    </span>
                    <ChevronDown
                      size={13}
                      className={`text-[#8A7264] shrink-0 ml-1 transition-transform duration-200 ${showTimeDropdown ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {showTimeDropdown && timeDropdownPos && createPortal(
                    <div ref={timeDropdownPortalRef} style={timeDropdownPos} className="z-[9999] bg-white border border-[#EAE4E0] rounded-xl shadow-lg overflow-hidden w-[220px]">
                      <ul className="max-h-[240px] overflow-y-auto scrollbar-thin py-1">
                        {TIME_SLOTS.map(slot => {
                          const disabled = isSlotDisabled(slot);
                          const selected = form.pickupTime === slot.value;
                          return (
                            <li key={slot.value}>
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                  setForm(f => ({ ...f, pickupTime: slot.value }));
                                  setShowTimeDropdown(false);
                                }}
                                className={`w-full text-left px-3.5 py-2.5 text-xs flex items-center justify-between gap-2 transition-colors ${
                                  disabled
                                    ? 'text-[#C9BEB6] cursor-not-allowed'
                                    : selected
                                    ? 'bg-[#F5EFEB] text-[#3B1F0A] font-semibold'
                                    : 'text-[#3B1F0A] hover:bg-[#FCFAF9] cursor-pointer'
                                }`}
                              >
                                <span>{slot.label}</span>
                                {disabled ? (
                                  <span className="text-[9px] uppercase tracking-wider text-[#C9BEB6] shrink-0">Past</span>
                                ) : selected ? (
                                  <Check size={13} className="text-[#5A453C] shrink-0" />
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>,
                    document.body
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 bg-white p-4 sm:p-5 md:overflow-y-auto scrollbar-thin flex flex-col gap-3.5">
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
        </div>
        {/* End of scrollable body (Customer Details + Items) */}

        {/* Fixed Payment Section — hiwalay na footer ng buong modal (sibling ng
            scrollable body sa itaas), hindi na nested sa loob ng Right Column.
            `shrink-0` ito kaya hindi ito sinisiksik/nawawala kahit gaano pa
            kahaba ang Customer Details o Items list — palaging visible ang
            Back/Place Order. */}
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
              onClick={onBack}
              disabled={isProcessing}
              className="w-1/3 border border-[#EAE4E0] text-[#3B1F0A] bg-white py-3 sm:py-3.5 rounded-full text-xs sm:text-sm font-semibold hover:bg-[#F5EFEB] disabled:opacity-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => {
                // FIX: i-validate muna ang required Customer Details
                // fields (Name, Contact, Pick-up Date/Time) BAGO ipakita
                // ang "Are you sure?" confirm dialog — kung may kulang,
                // ang lalabas ay ang "Please complete all required
                // fields (*)" toast (via onValidate, posCart.jsx), at
                // hindi na tuloy ang confirm dialog.
                if (onValidate && !onValidate()) return;
                setShowConfirm(true);
              }}
              disabled={isProcessing}
              className="w-2/3 bg-[#3B1F0A] text-white py-3 sm:py-3.5 rounded-full text-xs sm:text-sm font-semibold hover:bg-[#2A1608] disabled:opacity-75 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Processing...' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>

      {/* FIX (req #1): "Are you sure?" confirmation — nagpapakita sa
          ibabaw ng Checkout modal (mas mataas na z-index), hindi bago
          o pagkatapos nito, kaya hindi kailanman "dalawang magkasabay na
          hiwalay na modal" ang lumalabas dito — parte pa rin ito ng
          iisang Checkout flow. Isasara ito agad (at kasabay, ang
          Checkout modal mismo, via onPlaceOrder → posCart.jsx) kapag
          na-confirm. */}
      {showConfirm && (
        <div className="fixed inset-0 z-[1950] flex items-center justify-center bg-black/40 px-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl border border-[#EAE4E0] shadow-2xl w-full max-w-[360px] p-5 sm:p-6 flex flex-col items-center text-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-4">
              <AlertTriangle size={24} />
            </div>
            <h4 className="text-sm sm:text-base font-bold text-[#3B1F0A] mb-1.5">Place this order?</h4>
            <p className="text-xs sm:text-sm text-[#8A7264] mb-6 leading-relaxed">
              Please double-check the customer details, items, and payment amount.
            </p>
            <div className="flex gap-2.5 w-full">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isProcessing}
                className="w-1/2 border border-[#EAE4E0] text-[#3B1F0A] bg-white py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-semibold hover:bg-[#F5EFEB] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  onPlaceOrder();
                }}
                disabled={isProcessing}
                className="w-1/2 bg-[#3B1F0A] text-white py-2.5 sm:py-3 rounded-full text-xs sm:text-sm font-semibold hover:bg-[#2A1608] disabled:opacity-75 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? 'Processing...' : 'Yes, Place Order'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}