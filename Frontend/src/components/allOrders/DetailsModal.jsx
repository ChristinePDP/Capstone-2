import { useState, useEffect } from 'react';
import { X, Phone, Calendar, Image as ImageIcon, ReceiptText, Clock, Wallet, User, FileText, MessageSquareText, Download, ChevronLeft, ChevronRight } from 'lucide-react';

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
  Ready: 'bg-orange-50 text-orange-700',
  Completed: 'bg-green-50 text-green-700',
  Cancelled: 'bg-red-50 text-red-600',
};

const STATUS_BUTTON_STYLES = {
  Ready: 'bg-orange-500 hover:bg-orange-600',
  Completed: 'bg-green-600 hover:bg-green-700',
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

function TagBadge({ children }) {
  return (
    <span className="text-xs font-bold px-3 py-1 rounded-full bg-[#F5EFEB] text-[#5A453C]">
      {children}
    </span>
  );
}

function BundleTag() {
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#3B1F0A] text-white uppercase tracking-wide shrink-0">
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
// Ang sagot sa Multi-image field ay array ng image URLs sa loob ng
// order_slip_details, kaya dito natin nakikilala at ipinapakita bilang gallery
// sa halip na i-join bilang text.
const IMAGE_URL_RE = /^https?:\/\/.+\.(png|jpe?g|gif|webp|avif|bmp|heic|heif)(\?.*)?$/i;
const isImageUrl = (v) => typeof v === 'string' && IMAGE_URL_RE.test(v);
const isImageUrlList = (v) => Array.isArray(v) && v.length > 0 && v.every(isImageUrl);

const imageExt = (url) => {
  const m = String(url).match(/\.([a-z0-9]+)(?:\?|$)/i);
  return m ? m[1].toLowerCase() : 'jpg';
};
const safeName = (str) => String(str || 'image').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'image';

// Cross-origin ang storage URL kaya hindi gagana ang plain <a download> —
// kinukuha muna bilang blob. Kapag pumalya (CORS, atbp.), bubuksan na lang sa
// bagong tab para makapag-"Save image as" pa rin ang admin.
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
    <div className="pt-1">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-sm text-[#8A7264]">
          {label} <span className="text-[10px] font-bold text-[#B7A99F]">({urls.length})</span>
        </span>
        <button
          type="button"
          onClick={() => downloadAllImages(urls, baseName)}
          className="shrink-0 flex items-center gap-1 text-[11px] font-bold text-[#5A453C] hover:text-[#3B1F0A] underline underline-offset-2"
        >
          <Download size={12} /> Download {urls.length > 1 ? 'all' : ''}
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

function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 mb-3">
      {Icon && <Icon size={13} className="text-[#8A7264]" />}
      <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A7264]">{children}</p>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-[#8A7264]">{label}</span>
      <span className="text-[#3B1F0A] font-semibold text-right">{value}</span>
    </div>
  );
}

function TabButton({ active, icon: Icon, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1 sm:gap-1.5 pb-2.5 text-[11px] sm:text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
        active
          ? 'border-[#3B1F0A] text-[#3B1F0A]'
          : 'border-transparent text-[#8A7264] hover:text-[#5A453C]'
      }`}
    >
      <Icon size={13} className={active ? 'text-[#3B1F0A]' : 'text-[#8A7264]'} />
      {children}
    </button>
  );
}

// ── DETAILS MODAL ────────────────────────────────────────────
export default function DetailsModal({ order, isOpen, onClose, onStatusChange }) {
  const [activeTab, setActiveTab] = useState('order');
  // { images: string[], index: number } — pwedeng isa lang (reference image) o marami (Multi-image field)
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
    if (!lightbox) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setLightbox(null); }
      else if (lightbox.images.length > 1 && e.key === 'ArrowLeft') stepLightbox(-1);
      else if (lightbox.images.length > 1 && e.key === 'ArrowRight') stepLightbox(1);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const pickupDate     = order.pickupDate || order.pickup_date;
  const pickupTime     = order.pickupTime || order.pickup_time;
  const pickupTimeEnd = order.pickupTimeEnd || order.pickup_time_end;

  const createdAt = order.createdAt || order.created_at;
  const updatedAt = order.updatedAt || order.updated_at;

  const globalReferenceImage = order.customerReference || order.customer_reference_url;

  // Special instructions ay nasa order_items.special_instructions (iisang text
  // na inuulit sa bawat row), kaya dine-dedupe para isang beses lang ipakita.
  // Fallback: kung nasa order level (order.special_instructions) ang text.
  const specialInstructions = [...new Set([
    ...items.map(it => (it.special_instructions ?? it.specialInstructions ?? '').toString().trim()),
    (order.special_instructions ?? order.specialInstructions ?? '').toString().trim(),
  ].filter(Boolean))];

  // Grouped by Bundle / Package / Standalone Item na kasama na ang specific reference images per component
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

  const pickupTimeLabel = pickupTime
    ? formatTime(pickupTime) + (pickupTimeEnd ? ` – ${formatTime(pickupTimeEnd)}` : '')
    : null;

  const itemRows = [];
  groupOrderItems(items).forEach((g, i) => {
    if (g.isBundle) {
      const bundleTotal = g.items.reduce((sum, it) => sum + itemLineTotal(it), 0);
      itemRows.push(
        <tr key={`bundle-${g.groupId}-${i}`} className="bg-[#FAF7F4]/70">
          <td className="py-2.5 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[#3B1F0A] font-bold">{g.bundleName}</span>
              <BundleTag />
            </div>
          </td>
          <td className="py-2.5 text-right font-bold text-[#3B1F0A]">{fmt(bundleTotal)}</td>
        </tr>
      );
      g.items.forEach((item, j) => {
        itemRows.push(
          <tr key={`bundle-${g.groupId}-item-${j}`}>
            <td className="py-1.5 pl-5 text-[#5A453C] font-medium pr-2 text-[13px]">
              {item.name || item.product_name}
              <span className="text-[#8A7264] font-normal ml-1.5">x{item.qty || item.quantity}</span>
            </td>
            <td className="py-1.5 text-right text-[13px] text-[#8A7264] font-medium">
              {fmt(itemLineTotal(item))}
            </td>
          </tr>
        );
      });
    } else {
      const item = g.item;
      itemRows.push(
        <tr key={`item-${i}`}>
          <td className="py-2.5 text-[#3B1F0A] font-semibold pr-2">
            {item.name || item.product_name}
            <span className="text-[#8A7264] font-medium ml-1.5">x{item.qty || item.quantity}</span>
          </td>
          <td className="py-2.5 text-right font-bold text-[#3B1F0A]">{fmt(itemLineTotal(item))}</td>
        </tr>
      );
    }
  });

  const TABS = [
    { id: 'order', label: 'Order Details', icon: ReceiptText },
    ...(showSlipTab ? [{ id: 'slip', label: 'Order Slip', icon: FileText }] : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex overflow-y-auto bg-[#1F1108]/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-details-heading"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90dvh] m-auto flex flex-col overflow-hidden border border-[#EAE4E0]"
        onClick={(e) => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-7 py-5 border-b border-[#EAE4E0] bg-white shrink-0">
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <h2 id="order-details-heading" className="text-lg sm:text-2xl font-bold text-[#3B1F0A] truncate">Order #{orderNumber}</h2>
            <StatusBadge status={order.status} />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] transition-colors shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Order meta strip */}
        <div className="px-4 sm:px-7 pt-5 pb-4 border-b border-[#EAE4E0] shrink-0">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {orderType && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A7264]">Type</span>
                <TagBadge>{orderType}</TagBadge>
              </div>
            )}
            {source && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A7264]">Source</span>
                <TagBadge>{placedByAdmin ? 'Walk-in (Staff)' : source === 'online' ? 'Online' : source}</TagBadge>
              </div>
            )}
            {createdAt && (
              <div className="flex items-center gap-2 text-[#5A453C]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A7264]">Placed</span>
                <span className="font-medium">{formatDateTime(createdAt)}</span>
              </div>
            )}
            {updatedAt && updatedAt !== createdAt && (
              <div className="flex items-center gap-2 text-[#5A453C]">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#8A7264]">Updated</span>
                <span className="font-medium">{formatDateTime(updatedAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="px-4 sm:px-7 pt-4 shrink-0">
          <div className="flex items-center gap-4 sm:gap-8 overflow-x-auto scrollbar-hide border-b border-[#EAE4E0] pr-4">
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

        {/* Body */}
        <div className="px-4 sm:px-7 py-6 overflow-y-auto overscroll-contain flex-1">

          {activeTab === 'order' && (
            <div className="flex flex-col gap-5">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
                <div className="bg-[#FAF7F4] rounded-2xl p-5 border border-[#EAE4E0]">
                  <SectionLabel icon={User}>Customer Details</SectionLabel>
                  <h3 className="text-base font-bold text-[#3B1F0A] mb-3 leading-tight">{customer.name || 'Walk-in'}</h3>
                  {customer.phone && (
                    <div className="flex items-center gap-2 text-sm text-[#5A453C]">
                      <Phone size={13} className="text-[#8A7264]" />
                      <span className="font-medium">{customer.phone}</span>
                    </div>
                  )}
                </div>

                <div className="bg-[#FAF7F4] rounded-2xl p-5 border border-[#EAE4E0]">
                  <SectionLabel icon={Calendar}>Pick-up Schedule</SectionLabel>
                  <p className="text-base font-bold text-[#3B1F0A]">{formatDate(pickupDate) || '—'}</p>
                  {pickupTimeLabel && (
                    <p className="text-sm text-[#5A453C] font-medium flex items-center gap-1.5 mt-1.5">
                      <Clock size={13} className="text-[#8A7264]" />
                      {pickupTimeLabel}
                    </p>
                  )}
                </div>
              </div>

              {/* Order Items */}
              <div className="bg-white border border-[#EAE4E0] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#EAE4E0] bg-[#F5EFEB] flex items-center gap-2">
                  <ReceiptText size={14} className="text-[#8A7264]" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A7264]">Order Items</p>
                </div>
                <div className="p-4">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-[#EAE4E0]">
                      {itemRows}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-[#EAE4E0] p-5 space-y-2">
                  <InfoRow label="Subtotal" value={fmt(subtotal || grandTotal)} />
                  {additionalCharge > 0 && <InfoRow label="Additional Charge" value={fmt(additionalCharge)} />}
                  {discountAmount > 0 && <InfoRow label="Discount" value={`−${fmt(discountAmount)}`} />}
                  <div className="flex items-baseline justify-between pt-2.5 mt-1 border-t border-[#EAE4E0]">
                    <span className="text-sm font-bold text-[#3B1F0A]">Grand Total</span>
                    <span className="text-2xl font-bold text-green-700">{fmt(grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Payment Status */}
              <div className="bg-[#FAF7F4] border border-[#EAE4E0] rounded-2xl p-5">
                <SectionLabel icon={Wallet}>Payment Status</SectionLabel>
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-sm text-[#5A453C] font-medium">
                    {paymentType === 'deposit' ? 'Deposit Payment' : 'Fully Paid'}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${paymentType === 'deposit' ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                    {paymentType === 'deposit' ? fmt(amountPaid) : fmt(grandTotal)}
                  </span>
                </div>
                {paymentType === 'deposit' && (
                  <InfoRow label="Balance Due" value={fmt(balance)} />
                )}
                {paymentRef && (
                  <p className="text-[11px] text-[#8A7264] font-mono mt-2.5 break-all">Ref: {paymentRef}</p>
                )}
              </div>

              {/* Special Instructions — pinakababa ng order details */}
              {specialInstructions.length > 0 && (
                <div className="bg-[#FAF7F4] border border-[#EAE4E0] rounded-2xl p-5 min-w-0">
                  <SectionLabel icon={MessageSquareText}>Special Instructions</SectionLabel>
                  <div className="space-y-1.5">
                    {specialInstructions.map((text, i) => (
                      <p key={i} className="text-sm text-[#3B1F0A] font-medium whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{text}</p>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}

          {activeTab === 'slip' && showSlipTab && (
            <div className="flex flex-col gap-6 items-start">
              
              {/* Product Component Cards: Slips + Specific References */}
              {hasOrderSlip && orderSlipCards.map((card, idx) => (
                <div key={idx} className="w-full bg-white border border-[#EAE4E0] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#EAE4E0] bg-[#F5EFEB] flex items-center gap-2">
                    <FileText size={14} className="text-[#8A7264]" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A7264]">
                      {card.title}
                    </p>
                    {card.sections.length > 1 && <BundleTag />}
                  </div>
                  <div className="divide-y divide-[#EAE4E0]">
                    {card.sections.map(({ item, fields, image }, i) => (
                      <div key={i} className="p-5 flex flex-col md:flex-row gap-6">
                        
                        {/* Text Fields */}
                        <div className="flex-1 space-y-2.5 min-w-0">
                          {card.sections.length > 1 && (
                            <p className="text-xs font-bold text-[#3B1F0A] mb-2 border-b border-[#EAE4E0] pb-1.5">
                              {item.name || item.product_name}
                            </p>
                          )}
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
                              <InfoRow key={`${key}-${j}`} label={formatSlipKey(key)} value={formatSlipValue(value)} />
                            )
                          )) : (
                            <p className="text-xs text-[#8A7264] italic">No slip details provided.</p>
                          )}
                        </div>

                        {/* Specific Component Image */}
                        {image && (
                           <div className="w-full md:w-56 shrink-0">
                             <div className="flex items-center gap-1.5 mb-2">
                               <ImageIcon size={13} className="text-[#8A7264]" />
                               <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7264]">Reference Image</p>
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
                </div>
              ))}

              {/* Global Reference Fallback (Kung may reference image ang Order na hindi nakatali sa items) */}
              {globalReferenceImage && !hasOrderSlip && (
                <div className="w-full bg-[#FAF7F4] border border-[#EAE4E0] rounded-2xl p-5">
                  <SectionLabel icon={ImageIcon}>Order Reference</SectionLabel>
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
                </div>
              )}

            </div>
          )}
        </div>

        {/* Footer */}
        {(order.status === 'Confirmed' || nextStatus[order.status]) && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2.5 px-4 sm:px-7 py-5 border-t border-[#EAE4E0] shrink-0">
            {order.status === 'Confirmed' && (
              <button
                onClick={() => { onStatusChange(order.id, 'Cancelled'); onClose(); }}
                className="w-full sm:w-auto bg-red-600 text-white hover:bg-red-700 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
              >
                Cancel Order
              </button>
            )}
            {nextStatus[order.status] && (
              <button
                onClick={() => { onStatusChange(order.id, nextStatus[order.status]); onClose(); }}
                className={`w-full sm:w-auto text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-md transition-colors ${
                  STATUS_BUTTON_STYLES[nextStatus[order.status]] || 'bg-green-600 hover:bg-green-700'
                }`}
              >
                Mark as {nextStatus[order.status]}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Lightbox — isa o maraming larawan (may prev/next at download) */}
      {lightbox && lightbox.images[lightbox.index] && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={closeLightbox}
              className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-white shadow-lg hover:bg-gray-100 flex items-center justify-center text-[#3B1F0A] transition-colors"
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
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-[#3B1F0A]"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => stepLightbox(1)}
                  aria-label="Next image"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-[#3B1F0A]"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2">
              {lightbox.images.length > 1 && (
                <span className="px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-bold">
                  {lightbox.index + 1} / {lightbox.images.length}
                </span>
              )}
              <button
                type="button"
                onClick={() => downloadImage(
                  lightbox.images[lightbox.index],
                  `${safeName(orderNumber)}-image-${lightbox.index + 1}.${imageExt(lightbox.images[lightbox.index])}`
                )}
                className="flex items-center gap-1 px-3 py-1 rounded-full bg-white/95 hover:bg-white text-[#3B1F0A] text-[11px] font-bold shadow"
              >
                <Download size={12} /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}