// src/components/onlineOrdering/Checkout.jsx
import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, CreditCard, Receipt, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Calendar as CalendarIcon, Lock, AlertCircle, Clock, Check, Loader2, ZoomIn, X } from 'lucide-react';
import Footer from '../onlineOrdering/Footer';
import MultiImageField from '../shared/MultiImageField';
import CartSlipImages from '../shared/CartSlipImages';
import UploadProgressNote, { getProcessingLabel } from '../shared/UploadProgressNote';
import { countReferenceFiles, countSlipFiles, pruneEmptySlipAnswers, slipHasFiles, uploadSlipImages, findMissingRequiredSlipImages, formatSlipValueForCart } from '../shared/orderSlipUploads';
import { deleteFiles, getFiles, putFiles } from '../shared/cartImageStore';
import { getOrderErrorMessage } from '../../services/orderErrorMessage';

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Formats a 'YYYY-MM-DD' string as an unambiguous long date, e.g. "August 8, 2026".
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
function MonthCalendar({ selectedDate, minDate, todayDate, triggerRef, popRef, onSelect, onClose }) {
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

  const [pos, setPos] = useState({ top: 0, left: 0, ready: false });
  const reposition = () => {
    const trigger = triggerRef?.current;
    const pop = popRef?.current;
    if (!trigger || !pop) return;
    const rect = trigger.getBoundingClientRect();
    const popH = pop.offsetHeight;
    const popW = pop.offsetWidth;
    const GAP = 4;
    const MARGIN = 8;
    const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
    const spaceAbove = rect.top - MARGIN;
    let top = (spaceBelow >= popH + GAP || spaceBelow >= spaceAbove)
      ? rect.bottom + GAP
      : rect.top - popH - GAP;
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - popH - MARGIN));
    const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - popW - MARGIN));
    setPos({ top, left, ready: true });
  };
  useLayoutEffect(() => {
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [viewYear, viewMonth]);

  const canGoPrev = viewYear > iy || viewMonth > im - 1 ? true : `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}` > minDate.slice(0, 7);
  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(v => v - 1); setViewMonth(11); }
    else setViewMonth(v => v - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(v => v + 1); setViewMonth(0); }
    else setViewMonth(v => v + 1);
  };

  return createPortal(
    <div
      ref={popRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, visibility: pos.ready ? 'visible' : 'hidden' }}
      className="z-[6000] bg-white border border-[#EAE4E0] rounded-xl shadow-lg p-3 w-[280px]"
    >
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
    </div>,
    document.body
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

const CHECKOUT_DRAFT_KEY = 'aileen_cake_max_checkout_draft';
const PAYMENT_PROOF_KEY = 'aileen_cake_max_payment_proof';
const PAYMENT_PROOF_AMOUNT_KEY = 'aileen_cake_max_payment_proof_amount';
const PAYMENT_PROOF_NAMESPACE = 'online-order-payment-proof';

const ORDER_TYPE_STORAGE_KEY = 'aileen_cake_max_order_type';
function readStoredOrderType() {
  try {
    return localStorage.getItem(ORDER_TYPE_STORAGE_KEY) === 'Pre-Order' ? 'Pre-Order' : 'Buy Now';
  } catch (err) {
    return 'Buy Now';
  }
}

function loadCheckoutDraft() {
  try {
    const saved = localStorage.getItem(CHECKOUT_DRAFT_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (err) {
    console.error('Failed to read checkout draft from storage:', err);
    return null;
  }
}

export default function Checkout({ cart, setCart, paymentOnly = false }) {
  const navigate = useNavigate();
  const isPaymentStep = paymentOnly;

  const hasPreOrder = cart.some(item => item.order_type === 'Pre-order');
  const hasPickUpToday = cart.some(item => item.order_type === 'Pick-up Today');

  const pickupType = hasPreOrder
    ? 'later'
    : hasPickUpToday
      ? 'now'
      : (readStoredOrderType() === 'Pre-Order' ? 'later' : 'now');
  
  const today = new Date();
  const todayString = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];

  const draft = loadCheckoutDraft();

  const draftOrderTypeChanged = Boolean(draft?.pickupType) && draft.pickupType !== pickupType;
  const [form, setForm] = useState(() => {
    if (draft?.form) {
      return draftOrderTypeChanged
        ? { ...draft.form, pickupDate: pickupType === 'now' ? todayString : '', pickupTime: '' }
        : draft.form;
    }
    return {
      name: '',
      phone: '',
      altPhone: '',
      pickupDate: pickupType === 'now' ? todayString : '',
      pickupTime: '',
      instructions: '',
    };
  });

  const [paymentType, setPaymentType] = useState(() => draft?.paymentType ?? 'half');
  const [paymentQrUrl, setPaymentQrUrl] = useState(null);
  const [proofOfPayment, setProofOfPayment] = useState(null);
  const [proofPreviewUrl, setProofPreviewUrl] = useState(null);
  const proofInputRef = useRef(null);
  const [paymentConfigLoading, setPaymentConfigLoading] = useState(true);
  const [paymentConfigError, setPaymentConfigError] = useState(false);
  const [paymentConfigAttempt, setPaymentConfigAttempt] = useState(0);
  const [qrImageLoaded, setQrImageLoaded] = useState(false);
  const [isQrExpanded, setIsQrExpanded] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [expandedSummaryIndexes, setExpandedSummaryIndexes] = useState(() => new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setClockTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, []);
  const [errors, setErrors] = useState({});
  const proofHydratedRef = useRef(false);

  useEffect(() => {
    if (!proofOfPayment) {
      setProofPreviewUrl(null);
      return undefined;
    }

    const previewUrl = URL.createObjectURL(proofOfPayment);
    setProofPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [proofOfPayment]);

  useEffect(() => {
    let active = true;

    const restorePaymentProof = async () => {
      try {
        const marker = localStorage.getItem(PAYMENT_PROOF_KEY);
        if (marker) {
          const currentTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
          const savedAmount = localStorage.getItem(PAYMENT_PROOF_AMOUNT_KEY);
          const isStale = cart.length > 0 && savedAmount !== String(currentTotal);
          if (isStale) {
            localStorage.removeItem(PAYMENT_PROOF_KEY);
            localStorage.removeItem(PAYMENT_PROOF_AMOUNT_KEY);
            await deleteFiles([marker]);
          } else {
            const files = await getFiles([marker]);
            const savedProof = files.get(marker);
            if (active && savedProof) setProofOfPayment(savedProof);
          }
        }
      } catch (err) {
        console.error('Failed to restore payment proof from IndexedDB:', err);
      } finally {
        if (active) proofHydratedRef.current = true;
      }
    };

    restorePaymentProof();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!proofHydratedRef.current) return;

    const persistPaymentProof = async () => {
      const previousMarker = localStorage.getItem(PAYMENT_PROOF_KEY);
      if (!proofOfPayment) {
        localStorage.removeItem(PAYMENT_PROOF_KEY);
        localStorage.removeItem(PAYMENT_PROOF_AMOUNT_KEY);
        if (previousMarker) await deleteFiles([previousMarker]);
        return;
      }

      const marker = previousMarker || `${PAYMENT_PROOF_NAMESPACE}:${crypto.randomUUID()}`;
      await putFiles([[marker, proofOfPayment]]);
      localStorage.setItem(PAYMENT_PROOF_KEY, marker);
      localStorage.setItem(PAYMENT_PROOF_AMOUNT_KEY, String(cart.reduce((sum, i) => sum + i.price * i.qty, 0)));
      if (previousMarker && previousMarker !== marker) {
        await deleteFiles([previousMarker]);
      }
    };

    persistPaymentProof().catch(err => {
      console.error('Failed to persist payment proof in IndexedDB:', err);
    });
  }, [proofOfPayment]);

  useEffect(() => {
    let active = true;
    setPaymentConfigLoading(true);
    setPaymentConfigError(false);
    setQrImageLoaded(false);
    fetch(`${import.meta.env.VITE_API_URL}/settings/payment`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => { if (active) setPaymentQrUrl(data.data?.payment_qr_code_url || null); })
      .catch(err => {
        console.error('Failed to load payment QR code:', err);
        if (active) setPaymentConfigError(true);
      })
      .finally(() => { if (active) setPaymentConfigLoading(false); });
    return () => { active = false; };
  }, [paymentConfigAttempt]);

  const handleProofChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors(prev => ({ ...prev, proof: 'Please choose an image file (screenshot).' }));
      return;
    }
    setErrors(prev => ({ ...prev, proof: false }));
    setProofOfPayment(file);
  };

  const toggleSummaryItem = (index) => {
    setExpandedSummaryIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const [showCalendar, setShowCalendar] = useState(false);
  const calendarWrapRef = useRef(null);
  const calendarTriggerRef = useRef(null);
  const calendarPopRef = useRef(null);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const timeDropdownRef = useRef(null);
  const timeDropdownListRef = useRef(null);
  const [timeDropdownPos, setTimeDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [timeDropdownOpenUpward, setTimeDropdownOpenUpward] = useState(false);

  useEffect(() => {
    if (!showCalendar) return;
    const handleClickOutside = (e) => {
      const insideTrigger = calendarWrapRef.current && calendarWrapRef.current.contains(e.target);
      const insidePopover = calendarPopRef.current && calendarPopRef.current.contains(e.target);
      if (!insideTrigger && !insidePopover) {
        setShowCalendar(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCalendar]);

  useEffect(() => {
    if (!showTimeDropdown) return;
    const handleClickOutside = (e) => {
      const clickedTrigger = timeDropdownRef.current && timeDropdownRef.current.contains(e.target);
      const clickedList = timeDropdownListRef.current && timeDropdownListRef.current.contains(e.target);
      if (!clickedTrigger && !clickedList) {
        setShowTimeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTimeDropdown]);

  useEffect(() => {
    if (!showTimeDropdown) return;
    const reposition = () => {
      const btn = timeDropdownRef.current?.querySelector('button');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const DROPDOWN_HEIGHT_ESTIMATE = 240;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setTimeDropdownOpenUpward(spaceBelow < DROPDOWN_HEIGHT_ESTIMATE && spaceAbove > spaceBelow);
      setTimeDropdownPos({ top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [showTimeDropdown]);

  useEffect(() => {
    if (!showSummaryModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showSummaryModal]);

  const totalAmount = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const halfAmount = totalAmount / 2;

  const getLiveNow = () => {
    const now = new Date();
    const dateStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);
    return { dateStr, timeStr };
  };

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

  useEffect(() => {
    try {
      localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify({ form, pickupType, paymentType }));
    } catch (err) {
      console.error('Failed to save checkout draft to storage:', err);
    }
  }, [form, pickupType, paymentType]);

  const stockIssues = useMemo(() => {
    const field = pickupType === 'now' ? 'buy_now_available_stock' : 'pre_order_available_stock';
    const label = pickupType === 'now' ? 'Pick-up Today' : 'Pre-Order';
    const qtyById = {};
    cart.forEach(i => { qtyById[i.id] = (qtyById[i.id] || 0) + (Number(i.qty) || 0); });
    const seen = new Set();
    const issues = [];
    cart.forEach(i => {
      if (seen.has(i.id)) return;
      seen.add(i.id);
      if (i.type === 'bundle' || i.type === 'package') return;
      const limit = i[field];
      if (limit === undefined || limit === null) return;
      if (qtyById[i.id] > Number(limit)) {
        issues.push({ name: i.name, limit: Number(limit), qty: qtyById[i.id], label });
      }
    });
    return issues;
  }, [cart, pickupType]);

  const stockIssueMessage = (issue) => (
    issue.limit <= 0
      ? `${issue.name} is not available for ${issue.label}.`
      : `${issue.name} is not available in that quantity for ${issue.label}.`
  );

  const hasStrictPreOrder = cart.some(item => item.order_type === 'Pre-order');
  const PRE_ORDER_MIN_LEAD_DAYS = hasStrictPreOrder ? 3 : 1;
  const minPreOrderDate = addDaysToDateString(getLiveNow().dateStr, PRE_ORDER_MIN_LEAD_DAYS);

  // Shop hours para sa Pick-up Today. Labas dito = hindi pwede mag-order for today.
  const SHOP_OPEN_TIME = '08:00';
  const SHOP_CLOSE_TIME = '17:00';

  const isShopClosedToday = () => {
    if (pickupType !== 'now') return false;
    const { timeStr } = getLiveNow();
    return timeStr < SHOP_OPEN_TIME || timeStr >= SHOP_CLOSE_TIME;
  };
  const shopClosedMessage = 'Shop is closed for Pick-up Today (open 8:00 AM - 5:00 PM). Please select Pre-Order.';
  const shopClosedNow = isShopClosedToday();

  // Kapag sarado, tanggalin ang napiling time (galing sa naka-save na draft)
  // para hindi mukhang valid pa ang 3:00 PM - 5:00 PM.
  useEffect(() => {
    if (shopClosedNow) {
      setShowTimeDropdown(false);
      setForm(f => (f.pickupTime ? { ...f, pickupTime: '' } : f));
    }
  }, [shopClosedNow]);

  const isSlotDisabled = (slot) => {
    if (pickupType !== 'now') return false;
    if (isShopClosedToday()) return true;
    const { timeStr } = getLiveNow();
    return slot.end <= timeStr;
  };

  const handleProceedToOrder = () => {
    if (isShopClosedToday()) {
      return setToastMessage(shopClosedMessage);
    }

    if (stockIssues.length > 0) {
      return setToastMessage(`${stockIssueMessage(stockIssues[0])} Please go back to the menu and adjust your cart.`);
    }

    const needsPickupDate = pickupType === 'later';
    const phoneRegex = /^\d{11}$/;
    const newErrors = {};

    if (!form.name.trim()) {
      newErrors.name = 'Full name is required.';
    }

    if (!form.phone) {
      newErrors.phone = 'Contact number is required.';
    } else if (!phoneRegex.test(form.phone)) {
      newErrors.phone = 'Must be exactly 11 digits.';
    }

    if (form.altPhone && !phoneRegex.test(form.altPhone)) {
      newErrors.altPhone = 'Must be exactly 11 digits.';
    }

    if (needsPickupDate && !form.pickupDate) {
      newErrors.pickupDate = 'Please select a pickup date.';
    }

    if (!form.pickupTime) {
      newErrors.pickupTime = 'Please select a pickup time.';
    }
    if (paymentConfigLoading || !paymentQrUrl) {
      newErrors.payment = 'Payment QR code is currently unavailable. Please try again later.';
    }
    if (!proofOfPayment) {
      newErrors.proof = 'Please upload your payment screenshot before proceeding.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setShowSummaryModal(true);
  };

  const handleContinueToPayment = () => {
    if (isShopClosedToday()) {
      return setToastMessage(shopClosedMessage);
    }

    const needsPickupDate = pickupType === 'later';
    const phoneRegex = /^\d{11}$/;
    const newErrors = {};

    if (!form.name.trim()) newErrors.name = 'Full name is required.';
    if (!form.phone) newErrors.phone = 'Contact number is required.';
    else if (!phoneRegex.test(form.phone)) newErrors.phone = 'Enter a valid 11-digit contact number.';
    if (form.altPhone && !phoneRegex.test(form.altPhone)) newErrors.altPhone = 'Enter a valid 11-digit number.';
    if (needsPickupDate && !form.pickupDate) newErrors.pickupDate = 'Please select a pickup date.';
    if (!form.pickupTime) newErrors.pickupTime = 'Please select a pickup time.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    navigate('/onlineOrdering/payment');
  };

  const handlePlaceOrder = async () => {
    if (isShopClosedToday()) {
      setShowSummaryModal(false);
      setToastMessage(shopClosedMessage);
      return;
    }

    const missingImages = cart.flatMap(item =>
      findMissingRequiredSlipImages(item).map(label => `${item.name}: ${label}`)
    );
    if (missingImages.length > 0) {
      setShowSummaryModal(false);
      setToastMessage(`Please add the required photo(s) — ${missingImages.join(', ')}.`);
      return;
    }
    if (!proofOfPayment) {
      setShowSummaryModal(false);
      setToastMessage('Please upload your payment screenshot before placing the order.');
      return;
    }

    setIsProcessing(true);
    let updatedCart = [...cart];

    const totalUploads = cart.reduce(
      (n, it) => n + countReferenceFiles(it.inspiration_image) + countSlipFiles(it.order_slip_details), 0
    );
    let doneUploads = 0;
    const tickUpload = () => {
      doneUploads += 1;
      setUploadProgress({ phase: 'uploading', done: doneUploads, total: totalUploads });
    };
    setUploadProgress(totalUploads > 0 ? { phase: 'uploading', done: 0, total: totalUploads } : null);

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
      setShowSummaryModal(false);
      setToastMessage(err.message || 'Image upload failed. Please try again.');
      return;
    }

    if (totalUploads > 0) setUploadProgress({ phase: 'saving' });

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
          orderSlip: pruneEmptySlipAnswers(item.order_slip_details) || {},
          selectedPriceOptions: item.selected_price_options || null, 
          inspirationUrl: item.inspiration_url || null,
          inspirationUrls: item.inspiration_urls || null,
          type: item.type || (item.category === 'Package' ? 'package' : null),
          bundleId: item.bundleId || null,
          packageId: (item.type === 'package' || item.category === 'Package')
            ? (item.packageId || item.id || null)
            : null,
        })),
        payment: {
          type: paymentType === 'half' ? 'deposit' : 'full',
          amountDueNow: paymentType === 'half' ? halfAmount : totalAmount,
          balanceAtPickup: paymentType === 'half' ? halfAmount : 0,
          grandTotal: totalAmount,
        },
        createdAt: new Date().toISOString(),
      };

    sessionStorage.setItem('tempOrderData', JSON.stringify({
      form,
      pickupType,
      paymentType,
      orderPayload,
      cart: updatedCart,
    }));

    try {
      const formData = new FormData();
      formData.append('proof', proofOfPayment);
      formData.append('orderPayload', JSON.stringify(orderPayload));
      const response = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/manual-payment-order`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (data.success && data.order) {
        sessionStorage.setItem('manualOrderResult', JSON.stringify(data.order));
        setCart([]);
        try {
          localStorage.removeItem(CHECKOUT_DRAFT_KEY);
          const proofMarker = localStorage.getItem(PAYMENT_PROOF_KEY);
          localStorage.removeItem(PAYMENT_PROOF_KEY);
          localStorage.removeItem(PAYMENT_PROOF_AMOUNT_KEY);
          if (proofMarker) {
            await deleteFiles([proofMarker]);
          }
        } catch (cleanupError) {
          console.error('Failed to clear successful checkout draft and payment proof:', cleanupError);
        }
        setShowSummaryModal(false);
        navigate('/onlineOrdering/confirm', { state: { ...JSON.parse(sessionStorage.getItem('tempOrderData') || '{}'), order: data.order } });
      } else {
        setToastMessage(getOrderErrorMessage(
          { message: data.message },
          'Failed to submit payment proof. Please try again.'
        ));
        setIsProcessing(false);
        setUploadProgress(null);
      }
    } catch (error) {
      console.error('Error initiating payment:', error);
      setToastMessage('Network error. Please try again later.');
      setIsProcessing(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="bg-[#FCFAF9] min-h-screen flex flex-col relative">

      <div className="flex-1 w-full max-w-[1440px] mx-auto flex flex-col lg:flex-row gap-6 lg:gap-10 px-5 sm:px-8 py-6 lg:py-4 lg:pl-[140px] xl:pl-[160px]">

        {/* LEFT COLUMN: Step 1 */}
        <div className={`${isPaymentStep ? 'hidden' : 'flex'} flex-1 flex-col lg:h-[calc(100vh-112px)] min-h-0 lg:border-l lg:border-[#EAE4E0] lg:pl-6 lg:pr-2 lg:overflow-y-auto scrollbar-thin`}>
          <div className="flex flex-col lg:flex-1 lg:bg-white lg:rounded-3xl lg:border lg:border-[#EAE4E0] lg:shadow-sm lg:overflow-hidden">

              <div className="bg-white rounded-2xl border border-[#EAE4E0] p-5 sm:p-6 shadow-sm flex flex-col shrink-0 lg:grow lg:rounded-none lg:border-0 lg:shadow-none">
                  <div className="flex items-center gap-2.5 mb-3.5 shrink-0">
                    <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0">
                      <ClipboardList size={14} />
                    </div>
                    <h3 className="text-lg font-serif text-[#3B1F0A] leading-none">Pick-up & Customer Details</h3>
                  </div>
                  <div className="w-full h-px bg-[#EAE4E0] mb-4 lg:mb-5 shrink-0"></div>

                  {stockIssues.length > 0 && (
                    <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700 shrink-0">
                      <p className="font-bold mb-1 flex items-center gap-1.5"><AlertCircle size={13} /> Not enough for {stockIssues[0].label}</p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {stockIssues.map(i => <li key={i.name}>{stockIssueMessage(i)}</li>)}
                      </ul>
                      <p className="mt-1 text-red-600">Go back to the menu to reduce the quantity or change the order type.</p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 shrink-0 lg:grow lg:grid-cols-[repeat(3,minmax(0,1fr))] lg:grid-rows-[repeat(3,minmax(auto,1fr))_auto_auto] lg:gap-x-5 lg:gap-y-5">
                      {/* LEFT: name, numbers, pickup date/time */}
                      <div className="contents">
                          <div className="relative lg:col-start-1 lg:col-span-2 lg:row-start-1">
                              <label className={`text-[10px] font-bold mb-1.5 block uppercase tracking-wider ${errors.name ? 'text-red-500' : 'text-[#8A7264]'}`}>Full Name <span className="text-red-500">*</span></label>
                              <input 
                                type="text" 
                                placeholder="e.g. Juan Dela Cruz" 
                                value={form.name}
                                className={`w-full border px-3.5 py-3 text-[13px] rounded-xl focus:outline-none transition-colors ${errors.name ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} 
                                onChange={e => {
                                  setForm({...form, name: e.target.value});
                                  setErrors(prev => ({...prev, name: false}));
                                }} 
                              />
                              {errors.name && <span role="alert" className="absolute left-1 top-full mt-0.5 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none">{errors.name}</span>}
                          </div>
                      <div className="contents">
                          <div className="relative lg:col-start-1 lg:row-start-2">
                              <label className={`text-[10px] font-bold mb-1.5 block uppercase tracking-wider ${errors.phone ? 'text-red-500' : 'text-[#8A7264]'}`}>Contact Number <span className="text-red-500">*</span></label>
                              <input 
                                type="text" 
                                placeholder="09xxxxxxxxx" 
                                maxLength="11"
                                value={form.phone}
                                className={`w-full border px-3.5 py-3 text-[13px] rounded-xl focus:outline-none transition-colors ${errors.phone ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} 
                                onChange={e => {
                                  const onlyNums = e.target.value.replace(/\D/g, '');
                                  setForm({...form, phone: onlyNums});
                                  setErrors(prev => ({...prev, phone: false}));
                                }} 
                              />
                              {errors.phone && <span role="alert" className="absolute left-1 top-full mt-0.5 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none">{errors.phone}</span>}
                          </div>
                      <div className="relative sm:col-span-2 lg:col-span-1 lg:col-start-2 lg:row-start-2">
                          <label className={`text-[10px] font-bold mb-1.5 block uppercase tracking-wider ${errors.altPhone ? 'text-red-500' : 'text-[#8A7264]'}`}>Alternative Number</label>
                          <input 
                            type="text" 
                            placeholder="Optional (09xxxxxxxxx)" 
                            maxLength="11"
                            value={form.altPhone}
                            className={`w-full border px-3.5 py-3 text-[13px] rounded-xl focus:outline-none transition-colors ${errors.altPhone ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} 
                            onChange={e => {
                                const onlyNums = e.target.value.replace(/\D/g, '');
                                setForm({...form, altPhone: onlyNums});
                                setErrors(prev => ({...prev, altPhone: false}));
                            }} 
                          />
                          {errors.altPhone && <span role="alert" className="absolute left-1 top-full mt-0.5 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none">{errors.altPhone}</span>}
                      </div>

                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-4 sm:col-span-2 lg:contents">
                          <div className="relative lg:col-start-1 lg:row-start-3" ref={calendarWrapRef}>
                              <label className={`text-[10px] font-bold mb-1.5 block uppercase tracking-wider ${errors.pickupDate ? 'text-red-500' : 'text-[#8A7264]'}`}>Pickup Date <span className="text-red-500">*</span></label>

                              {pickupType === 'now' ? (
                                <div className="w-full border border-[#EAE4E0] px-3.5 py-3 text-[13px] rounded-xl bg-[#F5EFEB] opacity-70 cursor-not-allowed text-[#3B1F0A] flex items-center gap-2">
                                  <Lock size={12} />
                                  {formatDateLong(getLiveNow().dateStr)} (Today)
                                </div>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    ref={calendarTriggerRef}
                                    onClick={() => {
                                      setShowCalendar(s => !s);
                                    }}
                                    className={`w-full border px-3.5 py-3 text-[13px] rounded-xl focus:outline-none transition-colors text-left bg-white flex items-center justify-between ${errors.pickupDate ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`}
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
                                      triggerRef={calendarTriggerRef}
                                      popRef={calendarPopRef}
                                      onSelect={(dateStr) => {
                                        setForm(f => ({...f, pickupDate: dateStr}));
                                        setErrors(prev => ({...prev, pickupDate: false}));
                                      }}
                                      onClose={() => setShowCalendar(false)}
                                    />
                                  )}
                                  {errors.pickupDate ? (
                                    <span className="text-[10px] text-red-500 mt-1 block">{errors.pickupDate}</span>
                                  ) : (
                                    <p className="text-[10px] text-[#8A7264] mt-1">Requires at least {PRE_ORDER_MIN_LEAD_DAYS} {PRE_ORDER_MIN_LEAD_DAYS === 1 ? 'day' : 'days'} advance notice (earliest: {formatDateLong(minPreOrderDate)})</p>
                                  )}
                                </>
                              )}
                          </div>
                          <div ref={timeDropdownRef} className="relative lg:col-start-2 lg:row-start-3">
                              <label className={`text-[10px] font-bold mb-1.5 block uppercase tracking-wider ${errors.pickupTime ? 'text-red-500' : 'text-[#8A7264]'}`}>Pickup Time <span className="text-red-500">*</span></label>
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setShowTimeDropdown(s => !s)}
                                  disabled={shopClosedNow}
                                  className={`w-full border px-3.5 py-3 text-[13px] rounded-xl focus:outline-none transition-colors flex items-center justify-between text-left ${shopClosedNow ? 'bg-[#F5EFEB] opacity-70 cursor-not-allowed' : 'bg-white'} ${errors.pickupTime ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'} ${form.pickupTime ? 'text-[#3B1F0A]' : 'text-[#8A7264]'}`}
                                >
                                  <span className="flex items-center gap-2 truncate">
                                    <Clock size={13} className="text-[#8A7264] shrink-0" />
                                    <span className="truncate">{shopClosedNow ? 'Open 8:00 AM - 5:00 PM' : form.pickupTime ? getSlotLabel(form.pickupTime) : 'Pick-up Time *'}</span>
                                  </span>
                                  <ChevronDown
                                    size={14}
                                    className={`text-[#8A7264] shrink-0 transition-transform duration-200 ${showTimeDropdown ? 'rotate-180' : ''}`}
                                  />
                                </button>

                                {showTimeDropdown && createPortal(
                                  <div
                                    ref={timeDropdownListRef}
                                    className="fixed z-[1200] bg-white border border-[#EAE4E0] rounded-xl shadow-lg overflow-hidden"
                                    style={{
                                      left: timeDropdownPos.left,
                                      width: timeDropdownPos.width,
                                      ...(timeDropdownOpenUpward
                                        ? { bottom: window.innerHeight - timeDropdownPos.top + 6 }
                                        : { top: timeDropdownPos.bottom + 6 }),
                                    }}
                                  >
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
                                                setErrors(prev => ({...prev, pickupTime: false}));
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
                                                <span className="text-[9px] uppercase tracking-wider text-[#C9BEB6] shrink-0">{shopClosedNow ? 'Closed' : 'Past'}</span>
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
                              {shopClosedNow ? (
                                <span role="alert" className="absolute left-1 top-full mt-0.5 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none">Closed for Pick-up Today. Please choose Pre-Order.</span>
                              ) : errors.pickupTime && <span role="alert" className="absolute left-1 top-full mt-0.5 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none">{errors.pickupTime}</span>}
                          </div>
                      </div>

                      </div>

                      {/* RIGHT: special instructions + actions */}
                      <div className="contents">
                      <div className="min-w-0 sm:col-span-2 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:row-span-3 lg:flex lg:flex-col lg:relative">
                          <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Suggestions / Special Instructions</label>
                          <textarea
                            rows={5}
                            placeholder="Anything else we should know?"
                            maxLength={300}
                            value={form.instructions}
                            onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
                            className="block w-full max-w-full min-w-0 min-h-[110px] max-h-[240px] resize-y lg:flex-1 lg:max-h-none lg:resize-none lg:pb-7 border border-[#EAE4E0] focus:border-[#5A453C] px-3.5 py-3 text-[13px] leading-relaxed rounded-xl focus:outline-none transition-colors whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                          />
                          <p className="mt-1 text-right text-[10px] text-[#B7A99F] lg:absolute lg:bottom-2 lg:right-3.5 lg:mt-0 lg:pointer-events-none">{(form.instructions || '').length}/300</p>
                      </div>

                      <div className="hidden lg:block lg:col-span-3 lg:row-start-4 h-px bg-[#F1EBE6]"></div>

                      <div className="contents lg:flex lg:flex-row-reverse lg:items-center lg:gap-3 lg:col-start-3 lg:row-start-5">
                      <button
                        type="button"
                        onClick={handleContinueToPayment}
                        disabled={shopClosedNow}
                        className={`mt-1 lg:mt-0 w-full sm:col-span-2 lg:col-span-1 lg:flex-1 lg:py-[13px] rounded-full px-4 py-2.5 text-[13px] font-semibold text-white transition-colors ${shopClosedNow ? 'bg-[#9C8B80] opacity-60 cursor-not-allowed' : 'bg-[#3B1F0A] hover:bg-[#2A1608]'}`}
                      >
                        Continue to Payment
                      </button>

                      <button
                        type="button"
                        onClick={() => navigate('/onlineOrdering/menu')}
                        className="w-full sm:col-span-2 lg:col-span-1 lg:flex-1 text-[11px] font-bold text-[#8A7264] hover:text-[#4A3B36] text-center transition-colors"
                      >
                        &larr; Back to Menu
                      </button>
                      </div>
                      </div>

                  </div>
              </div>

          </div>
        </div>

        {/* RIGHT COLUMN: Step 2 (Payment) */}
        <div className={`${isPaymentStep ? 'flex' : 'hidden'} lg:flex-col w-full lg:w-[780px] lg:max-w-[780px] lg:mx-auto lg:h-[calc(100vh-112px)] bg-white rounded-3xl border border-[#EAE4E0] shadow-sm shrink-0 overflow-hidden flex-col`}>

          <div className="flex-1 min-h-0 px-5 lg:px-7 py-4 flex flex-col gap-5 overflow-y-auto scrollbar-thin">
              <div className="flex flex-col shrink-0 lg:flex-1 lg:min-h-0">
                  <div className="flex items-center gap-2.5 mb-3 shrink-0">
                      <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0">
                        <CreditCard size={14} />
                      </div>
                      <h3 className="text-lg font-serif text-[#3B1F0A] leading-none">Payment</h3>
                  </div>
                  <div className="w-full h-px bg-[#EAE4E0] mb-3 shrink-0"></div>
                  <div className="lg:grid lg:grid-cols-2 lg:grid-rows-1 lg:gap-6 lg:items-stretch lg:flex-1 lg:min-h-0">
                  <div className="min-w-0 flex flex-col">
                  <p className="text-[11px] text-[#8A7264] mb-3.5 shrink-0">We require at least a 50% deposit to process your order.</p>

                  <div className="grid grid-cols-1 gap-3 shrink-0 lg:flex-1 lg:grid-rows-2">
                      <div
                          onClick={() => setPaymentType('half')}
                          className={`border rounded-xl p-3 cursor-pointer transition-all lg:flex lg:flex-col lg:justify-center ${paymentType === 'half' ? 'border-[#4A3B36] bg-[#F5EFEB]' : 'border-[#EAE4E0] bg-white hover:border-[#DED4CC]'}`}
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
                          className={`border rounded-xl p-3 cursor-pointer transition-all lg:flex lg:flex-col lg:justify-center ${paymentType === 'full' ? 'border-[#4A3B36] bg-[#F5EFEB]' : 'border-[#EAE4E0] bg-white hover:border-[#DED4CC]'}`}
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
                  <div className="min-w-0 mt-4 lg:mt-0 lg:flex lg:flex-col lg:min-h-0">
                      <div className="rounded-xl border border-[#EAE4E0] bg-[#FCFAF9] p-3 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col lg:items-center lg:justify-center lg:text-center">
                        <p className="text-xs font-semibold text-[#3B1F0A]">Pay via QR code</p>
                        {paymentConfigLoading ? (
                          <div role="status" aria-live="polite" className="mx-auto my-3 flex h-64 w-64 flex-col items-center justify-center gap-2 rounded-lg bg-[#F1EBE6] text-[#8A7264]">
                            <Loader2 size={24} className="animate-spin" />
                            <span className="text-[11px] font-medium">Loading QR code…</span>
                          </div>
                        ) : paymentConfigError ? (
                          <div role="alert" className="mx-auto my-3 flex min-h-[16rem] w-64 flex-col items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 text-center">
                            <AlertCircle size={22} className="text-red-500" />
                            <span className="text-[11px] text-red-700">Couldn't load the payment QR code.</span>
                            <button
                              type="button"
                              onClick={() => setPaymentConfigAttempt(n => n + 1)}
                              className="rounded-full bg-[#3B1F0A] px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-[#2A1608]"
                            >
                              Try again
                            </button>
                          </div>
                        ) : paymentQrUrl ? (
                          <div 
                            className="relative mx-auto my-3 h-64 w-64 group cursor-zoom-in rounded-lg border border-[#EAE4E0] bg-white p-1 overflow-hidden"
                            onClick={() => setIsQrExpanded(true)}
                            title="Click to expand QR code"
                          >
                            {!qrImageLoaded && (
                              <div role="status" aria-live="polite" className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-[#F1EBE6] text-[#8A7264]">
                                <Loader2 size={24} className="animate-spin" />
                                <span className="text-[11px] font-medium">Loading QR code…</span>
                              </div>
                            )}
                            <img
                              ref={el => { if (el && el.complete && el.naturalWidth > 0) setQrImageLoaded(true); }}
                              src={paymentQrUrl}
                              alt="Payment QR code"
                              onLoad={() => setQrImageLoaded(true)}
                              onError={() => setPaymentConfigError(true)}
                              className={`h-full w-full object-contain transition-opacity duration-200 ${qrImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                            />
                            {qrImageLoaded && (
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex flex-col items-end justify-start p-2 pointer-events-none">
                                <span className="bg-[#3B1F0A]/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md">
                                  <ZoomIn size={12} /> Tap to expand
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="py-8 text-center text-xs text-red-700">Payment QR code is not configured.</p>
                        )}
                        <p className="text-[10px] text-[#8A7264]">After paying, upload a screenshot of your successful transaction.</p>
                        <input
                          ref={proofInputRef}
                          id="payment-proof-upload"
                          type="file"
                          accept="image/*"
                          onChange={handleProofChange}
                          className="sr-only"
                        />
                        {proofPreviewUrl ? (
                          <div className="mt-3 flex w-full min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-lg border border-[#DED4CC] bg-white p-2 text-left">
                            <img
                              src={proofPreviewUrl}
                              alt="Selected payment proof preview"
                              className="h-16 w-16 shrink-0 rounded-md border border-[#EAE4E0] object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-semibold text-green-700" title={proofOfPayment?.name}>{proofOfPayment?.name}</p>
                              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                <label
                                  htmlFor="payment-proof-upload"
                                  className={`inline-flex cursor-pointer items-center rounded-full border border-[#DED4CC] bg-white px-3 py-1 text-[10px] font-semibold text-[#3B1F0A] transition-colors hover:bg-[#F5EFEB] ${isProcessing ? 'pointer-events-none opacity-50' : ''}`}
                                >
                                  Choose another
                                </label>
                                <button
                                  type="button"
                                  disabled={isProcessing}
                                  onClick={() => setProofOfPayment(null)}
                                  className="rounded-full px-2 py-1 text-[10px] font-semibold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <label
                            htmlFor="payment-proof-upload"
                            className="mt-2 inline-flex cursor-pointer items-center rounded-lg bg-[#3B1F0A] px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#2A1608]"
                          >
                            Choose payment screenshot
                          </label>
                        )}
                      </div>
                      {errors.proof && <p className="mt-2 text-xs text-red-700">{errors.proof}</p>}
                      {errors.payment && <p className="mt-2 text-xs text-red-700">{errors.payment}</p>}
                  </div>
                  </div>
              </div>

          </div>

          <div className="px-5 lg:px-7 pt-2.5 pb-3.5 lg:pt-4 lg:pb-5 shrink-0 border-t border-[#F1EBE6] bg-white lg:grid lg:grid-cols-2 lg:gap-6 lg:items-center">
            <div className="mb-2 lg:mb-0">
              {/* Fixed-height rows: balance row stays in layout (invisible) on full payment so nothing shifts */}
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] text-[#8A7264]">{paymentType === 'half' ? 'To Pay Now (50%)' : 'To Pay Now'}</span>
                <span className="text-[11px] text-[#8A7264]">₱{(paymentType === 'half' ? halfAmount : totalAmount).toLocaleString()}</span>
              </div>
              <div className={`flex items-center justify-between mb-1 ${paymentType === 'half' ? '' : 'invisible'}`} aria-hidden={paymentType !== 'half'}>
                <span className="text-[11px] text-[#8A7264]">Balance at Pick-up</span>
                <span className="text-[11px] text-[#8A7264]">₱{halfAmount.toLocaleString()}</span>
              </div>
              <div className="w-full h-px bg-[#F1EBE6] mb-1"></div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#5A453C]">Grand Total</span>
                <span className="font-serif text-base text-[#3B1F0A]">₱{totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <div className="min-w-0">
            <button
              onClick={handleProceedToOrder}
              disabled={shopClosedNow || isProcessing || !proofOfPayment || paymentConfigLoading || !paymentQrUrl}
              className="w-full bg-[#3B1F0A] text-white py-2.5 rounded-full text-xs font-semibold hover:bg-[#2A1608] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Processing Payment...' : 'Proceed to Order'}
            </button>
            <button
              onClick={() => navigate(isPaymentStep ? '/onlineOrdering/checkout' : '/onlineOrdering/menu')}
              disabled={isProcessing}
              className="w-full text-[11px] font-bold text-[#8A7264] hover:text-[#4A3B36] mt-2 text-center transition-colors disabled:opacity-50"
            >
              &larr; Back to Details
            </button>
            </div>
          </div>
        </div>
      </div>

      {/* --- EXPANDED QR LIGHTBOX MODAL --- */}
      {isQrExpanded && paymentQrUrl && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setIsQrExpanded(false)}
        >
          <div 
            className="relative bg-white p-5 rounded-3xl max-w-sm w-full flex flex-col items-center shadow-2xl border border-[#EAE4E0]" 
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsQrExpanded(false)}
              className="absolute top-3.5 right-3.5 w-9 h-9 rounded-full bg-[#F5EFEB] hover:bg-[#EAE4E0] flex items-center justify-center text-[#3B1F0A] transition-colors"
              aria-label="Close expanded QR"
            >
              <X size={18} />
            </button>
            <h4 className="text-base font-serif font-bold text-[#3B1F0A] mb-1">Payment QR Code</h4>
            <p className="text-xs text-[#8A7264] mb-4 text-center">Scan directly using your e-wallet app or take a screenshot</p>
            <div className="bg-white p-2.5 rounded-2xl border border-[#EAE4E0] shadow-inner w-full flex justify-center">
              <img
                src={paymentQrUrl}
                alt="Expanded Payment QR code"
                className="w-full max-w-[300px] h-auto object-contain rounded-xl"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsQrExpanded(false)}
              className="mt-4 w-full bg-[#3B1F0A] text-white py-2.5 rounded-full text-xs font-semibold hover:bg-[#2A1608] transition-colors"
            >
              Close
            </button>
          </div>
        </div>,
        document.body
      )}

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

            <div className="flex flex-col md:flex-row flex-1 min-h-0 overflow-y-auto md:overflow-hidden scrollbar-thin">
              
              {/* Left Column: Customer & Pickup Details */}
              <div className="w-full md:w-[300px] shrink-0 border-b md:border-b-0 md:border-r border-[#F1EBE6] bg-[#FCFAF9] p-4 sm:p-5 md:overflow-y-auto scrollbar-thin">
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

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[#B7A99F]">Date & Time</span>
                    <span className="text-[#3B1F0A] font-semibold">
                      {form.pickupDate || '—'} {form.pickupTime && `• ${getSlotLabel(form.pickupTime)}`}
                    </span>
                  </div>

                  {form.instructions && (
                    <div className="flex flex-col gap-0.5 mt-2 p-2.5 bg-white border border-[#EAE4E0] rounded-xl min-w-0">
                      <span className="text-[10px] text-[#B7A99F] uppercase font-semibold">Special Instructions</span>
                      <span className="text-[#3B1F0A] mt-0.5 break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{form.instructions}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Items */}
              <div className="flex-1 min-w-0 bg-white p-4 sm:p-5 md:overflow-y-auto scrollbar-thin flex flex-col gap-3.5">
                  <h4 className="text-xs font-bold text-[#8A7264] uppercase tracking-wider mb-1">Items ({cart.length})</h4>
                  
                  {cart.map((item, i) => {
                    let imgSrc = item.custom_image_url || item.image_url || item.image;

                    if (imgSrc && typeof imgSrc === 'string' && !imgSrc.startsWith('http') && !imgSrc.startsWith('blob:') && !imgSrc.startsWith('data:')) {
                      imgSrc = `${import.meta.env.VITE_API_URL}/uploads/${imgSrc.replace(/^\//, '')}`;
                    }

                    const isMultiItem = item.type === 'bundle' || item.type === 'package';

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
                            <button type="button" onClick={() => toggleSummaryItem(i)} className="flex min-w-0 items-center gap-1 text-left">
                              <span className="font-bold text-xs sm:text-sm text-[#3B1F0A] line-clamp-2 leading-snug">{item.qty}x {item.name}</span>
                              {expandedSummaryIndexes.has(i) ? <ChevronUp size={14} className="text-[#8A7264] shrink-0" /> : <ChevronDown size={14} className="text-[#8A7264] shrink-0" />}
                            </button>
                            <span className="font-bold text-xs sm:text-sm text-[#5A453C] shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
                          </div>
                          {!expandedSummaryIndexes.has(i) && <p className="text-[10px] text-[#8A7264]">Tap item to view details</p>}
                          
                          {expandedSummaryIndexes.has(i) && item.selected_price_options && Object.keys(item.selected_price_options).length > 0 && (
                            <div className="flex flex-col gap-0.5">
                              {Object.entries(item.selected_price_options).map(([label, value]) => (
                                <p key={label} className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">
                                  <span className="font-medium">{label}:</span> {formatSlipValueForCart(value)}
                                </p>
                              ))}
                            </div>
                          )}
                          
                          {expandedSummaryIndexes.has(i) && (item.type === 'bundle' || item.type === 'package') && item.order_slip_details && Object.keys(item.order_slip_details).length > 0 ? (
                            <div className="flex flex-col gap-1.5 mt-1">
                              {Object.entries(item.order_slip_details).map(([prodId, answers]) => {
                                const pName = item.products?.find(p => p.id === prodId)?.name || 'Item';
                                if (!answers || Object.keys(answers).length === 0) return null;
                                return (
                                  <div key={`slip-${prodId}`} className="bg-[#F9F5F1] border border-[#F1EBE6] rounded-lg px-2.5 py-2">
                                    <p className="text-[10px] sm:text-[11px] font-bold text-[#5A453C] uppercase tracking-wide mb-1">{pName}</p>
                                    <div className="flex flex-col gap-0.5">
                                      {Object.entries(answers).map(([label, value]) => (
                                        <p key={label} className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">
                                          <span className="font-medium">{label}:</span> {formatSlipValueForCart(value)}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            expandedSummaryIndexes.has(i) && item.order_slip_details && Object.keys(item.order_slip_details).length > 0 && (
                              <div className="flex flex-col gap-0.5 mt-1">
                                {Object.entries(item.order_slip_details).map(([label, value]) => (
                                  <p key={label} className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">
                                    <span className="font-medium">{label}:</span> {formatSlipValueForCart(value)}
                                  </p>
                                ))}
                              </div>
                            )
                          )}

                          {expandedSummaryIndexes.has(i) && <CartSlipImages item={item} readOnly className="mt-1.5" />}

                          {expandedSummaryIndexes.has(i) && item.inspiration_image && (
                            <p className="text-[10px] sm:text-xs font-semibold text-[#8A7264] leading-snug mt-1">
                              {isMultiItem && typeof item.inspiration_image === 'object' && !(item.inspiration_image instanceof File)
                                ? `Image Attached (${Object.values(item.inspiration_image).filter(Boolean).length})`
                                : 'Image Attached'}
                            </p>
                          )}

                          {expandedSummaryIndexes.has(i) && item.details && (
                            <p className="text-[10px] sm:text-xs text-[#8A7264] leading-snug">Note: {item.details}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-4 sm:pb-5 shrink-0 border-t border-[#EAE4E0] bg-[#FCFAF9]">
              <div className="mb-4">
                {/* Fixed-height rows: balance row stays in layout (invisible) on full payment so nothing shifts */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[#8A7264]">{paymentType === 'half' ? 'To Pay Now (50%)' : 'To Pay Now'}</span>
                  <span className="text-xs text-[#8A7264] font-medium">₱{(paymentType === 'half' ? halfAmount : totalAmount).toLocaleString()}</span>
                </div>
                <div className={`flex items-center justify-between mb-2 ${paymentType === 'half' ? '' : 'invisible'}`} aria-hidden={paymentType !== 'half'}>
                  <span className="text-xs text-[#8A7264]">Balance at Pick-up</span>
                  <span className="text-xs text-[#8A7264] font-medium">₱{halfAmount.toLocaleString()}</span>
                </div>
                <div className="w-full h-px bg-[#EAE4E0] mb-2"></div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#5A453C]">Grand Total</span>
                  <span className="font-serif text-lg sm:text-xl text-[#3B1F0A]">₱{totalAmount.toLocaleString()}</span>
                </div>
              </div>

              {isProcessing && <UploadProgressNote progress={uploadProgress} finalLabel="Connecting to payment..." className="mb-3" />}

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
                  disabled={isProcessing || shopClosedNow}
                  className="w-2/3 bg-[#3B1F0A] text-white py-3 sm:py-3.5 rounded-full text-xs sm:text-sm font-semibold hover:bg-[#2A1608] disabled:opacity-75 disabled:cursor-not-allowed transition-colors"
                >
                  {isProcessing ? getProcessingLabel(uploadProgress, 'Processing...', 'Processing...') : 'Place Order'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

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
