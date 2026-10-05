import { useState, useEffect } from 'react';
import { X, Phone, Calendar, Image as ImageIcon, ReceiptText, Clock, Wallet, User, FileText, MessageSquareText, Download, ChevronLeft, ChevronRight, CheckCircle2 } from 'lucide-react';

// ── formatting helpers ──────────────────────────────────────────
function fmt(n) {
  return '₱' + Number(n || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d) {
  if (!d) return null;
  const date = new Date(`${d}T00:00:00`);
  if (isNaN(date)) return d;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(t) {
  if (!t) return null;
  const [h, m] = String(t).split(':');
  const hour = Number(h);
  if (isNaN(hour)) return t;
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m} ${period}`;
}

function formatDateTime(ts) {
  if (!ts) return null;
  const date = new Date(ts);
  if (isNaN(date)) return null;
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const STATUS_STYLES = {
  Confirmed: 'bg-blue-50 text-blue-700',
  'Pending Verification': 'bg-yellow-50 text-yellow-700',
  Ready: 'bg-orange-50 text-orange-700',
  Completed: 'bg-green-50 text-green-700',
  Cancelled: 'bg-red-50 text-red-600',
};

const STATUS_BUTTON_STYLES = {
  Ready: 'bg-[#C2570C] hover:bg-[#A84A0A] focus-visible:ring-[#C2570C]',
  Completed: 'bg-green-700 hover:bg-green-800 focus-visible:ring-green-700',
};

const BTN_BASE = 'items-center justify-center gap-1.5 min-h-[44px] px-3 sm:px-5 rounded-xl text-xs sm:text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const BTN_CLOSE  = 'border border-[#DED4CC] bg-white text-[#5A453C] hover:bg-[#F5EFEB] focus-visible:ring-[#5A453C]';
const BTN_CANCEL = 'border border-red-300 bg-white text-red-700 hover:bg-red-50 focus-visible:ring-red-500';
const BTN_DANGER = 'bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-700';

function StatusBadge({ status }) {
  return (
    <span className={`text-xs sm:text-sm font-bold px-3 py-1 rounded-full shrink-0 ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

function TagBadge({ children }) {
  return (
    <span className="text-[13px] font-bold px-3 py-1 rounded-full bg-[#F5EFEB] text-[#5A453C]">
      {children}
    </span>
  );
}

function BundleTag() {
  return (
    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-[#3B1F0A] text-white uppercase tracking-wide shrink-0">
      Bundle
    </span>
  );
}

function groupOrderItems(items) {
  const groups = [];
  const bundleIndex = new Map();

  for (const item of items) {
    const groupId = item.bundle_group_id || item.bundleGroupId;
    if (groupId) {
      let group = bundleIndex.get(groupId);
      if (!group) {
        group = {
          isBundle: true,
          groupId,
          bundleName: item.bundle_name || item.bundleName || 'Bundle Deal',
          items: [],
        };
        bundleIndex.set(groupId, group);
        groups.push(group);
      }
      group.items.push(item);
    } else {
      groups.push({ isBundle: false, item });
    }
  }
  return groups;
}

function itemLineTotal(item) {
  return Number(item.total ?? item.total_price ?? (item.unit_price * item.quantity) ?? 0) || 0;
}

function parseSlipDetails(raw) {
  if (!raw) return null;
  let data = raw;
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return null; }
  }
  if (typeof data !== 'object' || Array.isArray(data)) return null;
  return Object.keys(data).length > 0 ? data : null;
}

function formatSlipKey(key) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatSlipValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length ? value.join(', ') : '—';
  return String(value);
}

// ── customer-uploaded images (Multi-image order slip fields) ──────
const IMAGE_URL_RE = /^https?:\/\/.+\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)(\?.*)?$/i;
const isImageUrl = (v) => typeof v === 'string' && IMAGE_URL_RE.test(v);
const isImageUrlList = (v) => Array.isArray(v) && v.length > 0 && v.every(isImageUrl);

const imageExt = (url) => {
  const m = String(url).match(/\.([a-z0-9]+)(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'jpg';
};
const safeName = (str) => String(str || 'image').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

async function downloadAllImages(urls, baseName) {
  for (let i = 0; i < urls.length; i += 1) {
    await downloadImage(urls[i], `${baseName}-${i + 1}.${imageExt(urls[i])}`);
    await new Promise((r) => setTimeout(r, 300));
  }
}

function SlipImageGallery({ label, urls, baseName, onView }) {
  return (
    <div className="py-3">
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <span className="text-[13px] font-semibold text-[#8A7264]">
          {label} <span className="text-xs font-bold text-[#B7A99F]">({urls.length})</span>
        </span>
        <button
          type="button"
          onClick={() => downloadAllImages(urls, baseName)}
          className="shrink-0 inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-lg border border-[#DED4CC] bg-white text-[13px] font-bold text-[#5A453C] hover:bg-[#F5EFEB]"
        >
          <Download size={14} /> {urls.length > 1 ? 'Download all' : 'Download'}
        </button>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {urls.map((url, i) => (
          <button
            key={`${url}-${i}`}
            type="button"
            onClick={() => onView(urls, i)}
            aria-label={`View image ${i + 1}`}
            className="group relative aspect-square rounded-xl overflow-hidden bg-[#F5EFEB] border border-[#EAE4E0] cursor-zoom-in"
          >
            <img src={url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
          </button>
        ))}
      </div>
    </div>
  );
}

function getItemSlipFields(item) {
  const slip = parseSlipDetails(item.order_slip_details ?? item.orderSlipDetails);
  if (!slip) return null;

  const productId = item.product_id || item.productId;
  const isFieldGroup = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const groupKeys = Object.keys(slip).filter(k => isFieldGroup(slip[k]));

  let fields = null;

  if (productId && groupKeys.length) {
    const idStr = String(productId).toLowerCase();
    const matchKey = groupKeys.find(k => k.toLowerCase() === idStr);
    if (matchKey) fields = slip[matchKey];
  }

  if (!fields) {
    if (groupKeys.length === 0) {
      fields = slip;
    } else if (groupKeys.length === 1 && groupKeys.length === Object.keys(slip).length) {
      fields = slip[groupKeys[0]];
    }
  }

  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return null;
  return Object.keys(fields).length > 0 ? fields : null;
}

function SectionLabel({ icon: Icon, children, className = '' }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {Icon && <Icon size={16} className="text-[#8A7264]" />}
      <h3 className="text-sm font-bold text-[#3B1F0A]">{children}</h3>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-[15px]">
      <span className="text-[#8A7264]">{label}</span>
      <span className="text-[#3B1F0A] font-semibold text-right tabular-nums">{value}</span>
    </div>
  );
}

function SlipField({ label, value }) {
  return (
    <div className="py-3 sm:grid sm:grid-cols-[9.5rem_1fr] sm:gap-4">
      <p className="text-[13px] font-semibold text-[#8A7264]">{label}</p>
      <p className="mt-0.5 sm:mt-0 text-[15px] font-semibold text-[#3B1F0A] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{value}</p>
    </div>
  );
}

function IconTile({ icon: Icon }) {
  return (
    <span className="w-11 h-11 rounded-xl bg-[#F5EFEB] text-[#5A453C] flex items-center justify-center shrink-0">
      <Icon size={20} />
    </span>
  );
}

function QtyChip({ children }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-md bg-[#F5EFEB] text-[13px] font-bold text-[#5A453C] tabular-nums">
      ×{children}
    </span>
  );
}

function TabButton({ active, icon: Icon, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center justify-center gap-2 min-h-[44px] sm:min-h-0 rounded-lg sm:rounded-none sm:pb-2.5 text-sm font-bold whitespace-nowrap transition-colors sm:border-b-2 ${
        active
          ? 'bg-white shadow-sm text-[#3B1F0A] sm:shadow-none sm:bg-transparent sm:border-[#3B1F0A]'
          : 'text-[#8A7264] hover:text-[#5A453C] sm:border-transparent'
      }`}
    >
      <Icon size={16} className={active ? 'text-[#3B1F0A]' : 'text-[#8A7264]'} />
      {children}
    </button>
  );
}

// ── DETAILS MODAL ────────────────────────────────────────────
export default function DetailsModal({ order, isOpen, onClose, onStatusChange, onPaymentVerification }) {
  const [activeTab, setActiveTab] = useState('order');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [paymentVerificationPending, setPaymentVerificationPending] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const openLightbox = (images, index = 0) => setLightbox({ images, index });
  const closeLightbox = () => setLightbox(null);
  const stepLightbox = (delta) => setLightbox(prev => (
    prev ? { ...prev, index: (prev.index + delta + prev.images.length) % prev.images.length } : prev
  ));

  const items = order ? (order.items || order.order_items || []) : [];

  const hasOrderSlipCheck = items.some(item =>
    parseSlipDetails(item.order_slip_details ?? item.orderSlipDetails) ||
    item.customer_reference_url ||
    item.customerReference
  );

  const hasReferenceImageCheck = !!(order?.customerReference || order?.customer_reference_url);

  useEffect(() => {
    if (activeTab === 'slip' && !hasOrderSlipCheck && !hasReferenceImageCheck) {
      setActiveTab('order');
    }
  }, [order?.id, hasOrderSlipCheck, hasReferenceImageCheck, activeTab]);

  useEffect(() => {
    setConfirmCancel(false);
    setPaymentVerificationPending(false);
  }, [order?.id, isOpen]);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setLightbox(null); }
      else if (lightbox.images.length > 1 && e.key === 'ArrowLeft') stepLightbox(-1);
      else if (lightbox.images.length > 1 && e.key === 'ArrowRight') stepLightbox(1);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [lightbox]);

  useEffect(() => {
    if (!isOpen || !order) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, order, onClose]);

  if (!isOpen || !order) return null;

  const customer     = order.customer || order.customers || {};
  const orderNumber   = order.order_number || order.id;
  const orderType     = order.orderType || order.order_type || order.type;
  const source        = order.source || order.order_source;
  const placedByAdmin = order.placedByAdmin || order.placed_by_admin;

  const subtotal         = order.subtotal || 0;
  const additionalCharge = order.additionalCharge || order.additional_charge || 0;
  const discount          = order.discount;
  const discountAmount    = Number(discount?.amount ?? discount?.value ?? 0) || 0;
  const grandTotal        = order.grandTotal || order.grand_total || 0;

  const paymentType     = order.paymentType || order.payment_type;
  const amountPaid       = order.amountPaid || order.amount_paid || 0;
  const balance           = order.balance ?? (grandTotal - amountPaid);
  const paymentRef         = order.paymongoPaymentId || order.paymongo_payment_id;
  const isDeposit = paymentType === 'deposit' && Number(balance) > 0;

  const pickupDate     = order.pickupDate || order.pickup_date;
  const pickupTime     = order.pickupTime || order.pickup_time;
  const pickupTimeEnd = order.pickupTimeEnd || order.pickup_time_end;

  const createdAt = order.createdAt || order.created_at;
  const updatedAt = order.updatedAt || order.updated_at;

  const globalReferenceImage = order.customerReference || order.customer_reference_url;

  const specialInstructions = [...new Set([
    ...items.map(it => (it.special_instructions ?? it.specialInstructions ?? '').toString().trim()),
    (order.special_instructions ?? order.specialInstructions ?? '').toString().trim(),
  ].filter(Boolean))];

  const orderSlipCards = (() => {
    const cards = [];
    groupOrderItems(items).forEach(g => {
      if (g.isBundle) {
        const sections = g.items
          .map(item => ({
            item,
            fields: getItemSlipFields(item),
            image: item.customer_reference_url || item.customerReference
          }))
          .filter(({ fields, image }) => fields || image);

        if (sections.length > 0) {
          cards.push({ title: g.bundleName, sections });
        }
      } else {
        const fields = getItemSlipFields(g.item);
        const image = g.item.customer_reference_url || g.item.customerReference;
        if (fields || image) {
          cards.push({ title: g.item.name || g.item.product_name || 'Item', sections: [{ item: g.item, fields, image }] });
        }
      }
    });
    return cards;
  })();

  const hasOrderSlip = orderSlipCards.length > 0;
  const showSlipTab = hasOrderSlip || !!globalReferenceImage;

  const nextStatus = { Confirmed: 'Ready', Ready: 'Completed' };
  const next = nextStatus[order.status];
  const canCancel = order.status === 'Confirmed';
  const hasActions = canCancel || !!next;

  const pickupTimeLabel = pickupTime
    ? formatTime(pickupTime) + (pickupTimeEnd ? ` – ${formatTime(pickupTimeEnd)}` : '')
    : null;

  const itemRows = [];
  groupOrderItems(items).forEach((g, i) => {
    if (g.isBundle) {
      const bundleTotal = g.items.reduce((sum, it) => sum + itemLineTotal(it), 0);
      itemRows.push(
        <li key={`bundle-${g.groupId}-${i}`} className="py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-[15px] font-bold text-[#3B1F0A] break-words">{g.bundleName}</span>
              <BundleTag />
            </div>
            <span className="text-[15px] font-bold text-[#3B1F0A] shrink-0 tabular-nums">{fmt(bundleTotal)}</span>
          </div>
          <ul className="mt-2.5 ml-1 pl-3.5 border-l-2 border-[#EAE4E0] space-y-2">
            {g.items.map((item, j) => (
              <li key={`bundle-${g.groupId}-item-${j}`} className="flex items-start justify-between gap-3 text-sm text-[#5A453C]">
                <span className="min-w-0 break-words">
                  {item.name || item.product_name} <QtyChip>{item.qty || item.quantity}</QtyChip>
                </span>
                <span className="text-[#8A7264] shrink-0 tabular-nums">{fmt(itemLineTotal(item))}</span>
              </li>
            ))}
          </ul>
        </li>
      );
    } else {
      const item = g.item;
      itemRows.push(
        <li key={`item-${i}`} className="flex items-start justify-between gap-3 py-3.5">
          <span className="min-w-0 text-[15px] font-semibold text-[#3B1F0A] break-words">
            {item.name || item.product_name} <QtyChip>{item.qty || item.quantity}</QtyChip>
          </span>
          <span className="text-[15px] font-bold text-[#3B1F0A] shrink-0 tabular-nums">{fmt(itemLineTotal(item))}</span>
        </li>
      );
    }
  });

  const TABS = [
    { id: 'order', label: 'Order Details', icon: ReceiptText },
    ...(showSlipTab ? [{ id: 'slip', label: 'Order Slip', icon: FileText }] : []),
  ];

  const metaStrip = (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2">
      {[
        orderType && { k: 'Type', node: <TagBadge>{orderType}</TagBadge> },
        source && { k: 'Source', node: <TagBadge>{placedByAdmin ? 'Walk-in (Staff)' : source === 'online' ? 'Online' : source}</TagBadge> },
        createdAt && { k: 'Placed', node: <span className="text-sm font-semibold text-[#5A453C]">{formatDateTime(createdAt)}</span>, wide: true },
        updatedAt && updatedAt !== createdAt && { k: 'Updated', node: <span className="text-sm font-semibold text-[#5A453C]">{formatDateTime(updatedAt)}</span>, wide: true },
      ].filter(Boolean).map(({ k, node, wide }) => (
        <div key={k} className={`flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2 ${wide ? 'col-span-2 sm:col-auto' : ''}`}>
          <span className="text-xs sm:text-[11px] font-semibold sm:font-bold sm:uppercase sm:tracking-wider text-[#8A7264]">{k}</span>
          {node}
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex overflow-y-auto bg-[#1F1108]/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-heading"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92dvh] sm:max-h-[90dvh] mt-auto sm:m-auto flex flex-col overflow-hidden border border-[#EAE4E0]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile grab handle */}
        <div className="sm:hidden mx-auto mt-2.5 h-1 w-10 rounded-full bg-[#DED4CC] shrink-0" aria-hidden="true" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-7 pt-3 pb-3 sm:py-5 border-b border-[#EAE4E0] bg-white shrink-0">
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap min-w-0">
            <h2 id="order-details-heading" className="text-xl sm:text-2xl font-bold text-[#3B1F0A]">Order #{orderNumber}</h2>
            <StatusBadge status={order.status} />
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close order details"
            className="w-11 h-11 sm:w-9 sm:h-9 -mr-2 sm:mr-0 rounded-full flex items-center justify-center text-[#5A453C] hover:bg-[#F5EFEB] transition-colors shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Desktop meta strip */}
        <div className="hidden sm:block px-7 pt-5 pb-4 border-b border-[#EAE4E0] shrink-0">
          {metaStrip}
        </div>

        {/* Tabs */}
        {TABS.length > 1 && (
          <div className="px-4 sm:px-7 pt-3 sm:pt-4 pb-3 sm:pb-0 border-b border-[#EAE4E0] sm:border-b-0 shrink-0">
            <div className="grid grid-cols-2 gap-1 p-1 bg-[#F5EFEB] rounded-xl sm:flex sm:gap-8 sm:p-0 sm:bg-transparent sm:rounded-none sm:border-b sm:border-[#EAE4E0]">
              {TABS.map(tab => (
                <TabButton
                  key={tab.id}
                  icon={tab.icon}
                  active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                </TabButton>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-4 sm:px-7 py-4 sm:py-6 overflow-y-auto overscroll-contain flex-1 bg-[#FAF7F4]">

          {activeTab === 'order' && (
            <div className="flex flex-col gap-4">

              {/* Mobile-only meta card */}
              <section className="sm:hidden bg-white border border-[#EAE4E0] rounded-2xl p-4">
                {metaStrip}
              </section>

              {/* Customer + Pick-up */}
              <section className="bg-white border border-[#EAE4E0] rounded-2xl divide-y divide-[#EAE4E0] md:grid md:grid-cols-2 md:divide-y-0 md:divide-x">
                <div className="flex items-center gap-3.5 p-4 sm:p-5 min-w-0">
                  <IconTile icon={User} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#8A7264]">Customer</p>
                    <p className="text-base sm:text-lg font-bold text-[#3B1F0A] leading-snug break-words">{customer.name || 'Walk-in'}</p>
                    {customer.phone && (
                      <a href={`tel:${customer.phone}`} className="inline-flex items-center gap-1.5 mt-0.5 text-sm font-semibold text-[#5A453C] hover:underline underline-offset-2">
                        <Phone size={14} className="text-[#8A7264]" />
                        {customer.phone}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3.5 p-4 sm:p-5 min-w-0">
                  <IconTile icon={Calendar} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#8A7264]">Pick-up</p>
                    <p className="text-base sm:text-lg font-bold text-[#3B1F0A] leading-snug">{formatDate(pickupDate) || '—'}</p>
                    {pickupTimeLabel && (
                      <p className="inline-flex items-center gap-1.5 mt-0.5 text-sm font-semibold text-[#5A453C]">
                        <Clock size={14} className="text-[#8A7264]" />
                        {pickupTimeLabel}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* Order Items */}
              <section className="bg-white border border-[#EAE4E0] rounded-2xl overflow-hidden">
                <div className="px-4 sm:px-5 pt-4 pb-1">
                  <SectionLabel icon={ReceiptText}>
                    Order items <span className="text-[#8A7264] font-semibold">({items.length})</span>
                  </SectionLabel>
                </div>
                <ul className="px-4 sm:px-5 divide-y divide-[#F0EAE5]">
                  {itemRows}
                </ul>
                <div className="bg-[#FAF7F4] border-t border-[#EAE4E0] px-4 sm:px-5 py-4 space-y-2">
                  <InfoRow label="Subtotal" value={fmt(subtotal || grandTotal)} />
                  {additionalCharge > 0 && <InfoRow label="Additional Charge" value={fmt(additionalCharge)} />}
                  {discountAmount > 0 && <InfoRow label="Discount" value={`−${fmt(discountAmount)}`} />}
                  <div className="flex items-baseline justify-between gap-3 pt-3 mt-1 border-t border-[#EAE4E0]">
                    <span className="text-base font-bold text-[#3B1F0A]">Grand Total</span>
                    <span className="text-2xl sm:text-3xl font-bold text-green-700 tabular-nums">{fmt(grandTotal)}</span>
                  </div>
                </div>
              </section>

              {/* Payment Section */}
              <section className="bg-white border border-[#EAE4E0] rounded-2xl p-4 sm:p-5">
                <SectionLabel icon={Wallet}>Payment</SectionLabel>
                <div className="mt-3 flex items-center justify-between gap-3">
                  {isDeposit ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-amber-50 text-amber-800 text-sm font-bold">Deposit paid</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 text-green-800 text-sm font-bold">
                      <CheckCircle2 size={15} /> Fully paid
                    </span>
                  )}
                  <span className="text-lg font-bold text-[#3B1F0A] tabular-nums">{isDeposit ? fmt(amountPaid) : fmt(grandTotal)}</span>
                </div>
                {isDeposit && (
                  <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-amber-50 px-3.5 py-3">
                    <span className="text-sm font-semibold text-amber-900">Balance due</span>
                    <span className="text-base font-bold text-amber-900 tabular-nums">{fmt(balance)}</span>
                  </div>
                )}
                {paymentRef && (
                  <p className="mt-3 text-xs text-[#8A7264] font-mono break-all">Ref: {paymentRef}</p>
                )}

                {/* Proof of Payment Thumbnail */}
                {order.proof_of_payment_url && (
                  <div className="mt-4 pt-4 border-t border-[#EAE4E0]">
                    <p className="text-xs font-semibold text-[#8A7264] mb-2">Proof of payment</p>
                    <button
                      type="button"
                      onClick={() => openLightbox([order.proof_of_payment_url])}
                      className="group relative w-full sm:w-48 aspect-video rounded-xl overflow-hidden bg-[#F5EFEB] border border-[#EAE4E0] cursor-zoom-in flex items-center justify-center"
                      aria-label="Enlarge payment proof"
                    >
                      <img
                        src={order.proof_of_payment_url}
                        alt="Payment proof"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-bold uppercase tracking-wide transition-opacity">
                          View Image
                        </span>
                      </div>
                    </button>
                  </div>
                )}
              </section>

              {/* Special Instructions */}
              {specialInstructions.length > 0 && (
                <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 sm:p-5 min-w-0">
                  <SectionLabel icon={MessageSquareText} className="mb-2">Special instructions</SectionLabel>
                  <div className="space-y-2">
                    {specialInstructions.map((text, i) => (
                      <p key={i} className="text-[15px] text-[#3B1F0A] font-medium whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</p>
                    ))}
                  </div>
                </section>
              )}

            </div>
          )}

          {activeTab === 'slip' && showSlipTab && (
            <div className="flex flex-col gap-4 items-start">

              {/* Product Component Cards */}
              {hasOrderSlip && orderSlipCards.map((card, idx) => (
                <section key={idx} className="w-full bg-white border border-[#EAE4E0] rounded-2xl overflow-hidden">
                  <div className="px-4 sm:px-5 py-3.5 bg-[#F5EFEB] border-b border-[#EAE4E0] flex items-center gap-2 flex-wrap">
                    <FileText size={16} className="text-[#8A7264] shrink-0" />
                    <h3 className="text-[15px] font-bold text-[#3B1F0A]">{card.title}</h3>
                    {card.sections.length > 1 && <BundleTag />}
                  </div>
                  <div className="divide-y-8 divide-[#FAF7F4]">
                    {card.sections.map(({ item, fields, image }, i) => (
                      <div key={i} className="p-4 sm:p-5 flex flex-col md:flex-row gap-5">

                        {/* Text Fields */}
                        <div className="flex-1 min-w-0">
                          {card.sections.length > 1 && (
                            <p className="flex items-center gap-2 text-sm font-bold text-[#3B1F0A] pb-1">
                              <span className="w-1 h-4 rounded-full bg-[#C2570C]" aria-hidden="true" />
                              {item.name || item.product_name}
                            </p>
                          )}
                          <div className="divide-y divide-[#F0EAE5]">
                            {fields ? Object.entries(fields).map(([key, value], j) => (
                              isImageUrlList(value) ? (
                                <SlipImageGallery
                                  key={`${key}-${j}`}
                                  label={formatSlipKey(key)}
                                  urls={value}
                                  baseName={safeName(`${orderNumber}-${item.name || item.product_name || 'item'}-${key}`)}
                                  onView={openLightbox}
                                />
                              ) : (
                                <SlipField key={`${key}-${j}`} label={formatSlipKey(key)} value={formatSlipValue(value)} />
                              )
                            )) : (
                              <p className="py-3 text-sm text-[#8A7264] italic">No slip details provided.</p>
                            )}
                          </div>
                        </div>

                        {/* Specific Component Image */}
                        {image && (
                          <div className="w-full md:w-56 shrink-0">
                            <div className="flex items-center gap-1.5 mb-2">
                              <ImageIcon size={14} className="text-[#8A7264]" />
                              <p className="text-[13px] font-semibold text-[#8A7264]">Reference image</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => openLightbox([image])}
                              className="w-full group relative cursor-zoom-in rounded-xl overflow-hidden bg-[#F5EFEB] border border-[#EAE4E0] flex items-center justify-center aspect-video md:aspect-square"
                              aria-label="View reference image"
                            >
                              <img src={image} alt="reference" className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                                <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-bold uppercase tracking-wide transition-opacity">
                                  View Image
                                </span>
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              {/* Global Reference Fallback */}
              {globalReferenceImage && !hasOrderSlip && (
                <section className="w-full bg-white border border-[#EAE4E0] rounded-2xl p-4 sm:p-5">
                  <SectionLabel icon={ImageIcon} className="mb-3">Order reference</SectionLabel>
                  <div className="rounded-xl overflow-hidden bg-[#F5EFEB] border border-[#EAE4E0] flex items-center justify-center max-w-sm">
                    <button
                      type="button"
                      onClick={() => openLightbox([globalReferenceImage])}
                      className="w-full group relative cursor-zoom-in"
                    >
                      <img src={globalReferenceImage} alt="reference" className="w-full h-auto object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-bold uppercase tracking-wide transition-opacity">
                          View Image
                        </span>
                      </div>
                    </button>
                  </div>
                </section>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[#EAE4E0] bg-white px-4 sm:px-7 pt-3 sm:pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-5">
          {order.status === 'Pending Verification' ? (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={paymentVerificationPending}
                onClick={async () => {
                  setPaymentVerificationPending(true);
                  try {
                    await onPaymentVerification(order.id, true);
                  } catch {
                    // Parent handles toast error
                  } finally {
                    setPaymentVerificationPending(false);
                  }
                }}
                className={`inline-flex ${BTN_BASE} flex-1 bg-green-700 text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {paymentVerificationPending ? 'Updating...' : 'Accept Payment'}
              </button>
              <button
                type="button"
                disabled={paymentVerificationPending}
                onClick={async () => {
                  const reason = window.prompt('Reason for rejecting this payment:');
                  if (!reason?.trim()) return;
                  setPaymentVerificationPending(true);
                  try {
                    await onPaymentVerification(order.id, false, reason.trim());
                  } catch {
                    // Parent handles toast error
                  } finally {
                    setPaymentVerificationPending(false);
                  }
                }}
                className={`inline-flex ${BTN_BASE} flex-1 ${BTN_DANGER} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {paymentVerificationPending ? 'Updating...' : 'Reject'}
              </button>
            </div>
          ) : confirmCancel ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-[#3B1F0A]">Cancel order #{orderNumber}? It will be marked as Cancelled.</p>
              <div className="flex gap-2.5">
                <button type="button" onClick={() => setConfirmCancel(false)} className={`inline-flex ${BTN_BASE} ${BTN_CLOSE} flex-1 sm:flex-none`}>
                  Keep order
                </button>
                <button
                  type="button"
                  onClick={() => { onStatusChange(order.id, 'Cancelled'); onClose(); }}
                  className={`inline-flex ${BTN_BASE} ${BTN_DANGER} flex-1 sm:flex-none`}
                >
                  Yes, cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 sm:justify-between">
              {/* Sa mobile, hidden ang Close kapag may action buttons (dahil may header X naman). Sa desktop, lalabas ang Close sa kaliwa. */}
              <button
                type="button"
                onClick={onClose}
                className={`${hasActions ? 'hidden sm:inline-flex' : 'inline-flex flex-1 sm:flex-none'} ${BTN_BASE} ${BTN_CLOSE}`}
              >
                <X size={15} />
                Close
              </button>

              {hasActions && (
                <div className="flex flex-1 sm:flex-none gap-2.5 w-full sm:w-auto">
                  {canCancel && (
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(true)}
                      className={`inline-flex ${BTN_BASE} ${BTN_CANCEL} flex-1 sm:flex-none whitespace-nowrap`}
                    >
                      Cancel Order
                    </button>
                  )}
                  {next && (
                    <button
                      type="button"
                      onClick={() => { onStatusChange(order.id, next); onClose(); }}
                      className={`inline-flex ${BTN_BASE} text-white shadow-sm flex-1 sm:flex-none whitespace-nowrap ${
                        STATUS_BUTTON_STYLES[next] || 'bg-green-700 hover:bg-green-800 focus-visible:ring-green-700'
                      }`}
                    >
                      Mark as {next}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && lightbox.images[lightbox.index] && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute -top-3 -right-3 z-10 w-10 h-10 rounded-full bg-white shadow-lg hover:bg-gray-100 flex items-center justify-center text-[#3B1F0A] transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <img
              src={lightbox.images[lightbox.index]}
              alt="reference full size"
              className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl block"
            />
            {lightbox.images.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => stepLightbox(-1)}
                  aria-label="Previous image"
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-[#3B1F0A]"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => stepLightbox(1)}
                  aria-label="Next image"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-[#3B1F0A]"
                >
                  <ChevronRight size={18} />
                </button>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-bold">
                    {lightbox.index + 1} / {lightbox.images.length}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}