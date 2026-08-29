import { useState, useEffect } from 'react';
import { X, Phone, Calendar, Image as ImageIcon, ReceiptText, Clock, Tag, Wallet, User, FileText } from 'lucide-react';

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
  Confirmed: 'bg-amber-50 text-amber-700',
  Ready: 'bg-blue-50 text-blue-700',
  Completed: 'bg-green-50 text-green-700',
  Cancelled: 'bg-red-50 text-red-600',
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

// order_slip_details comes from order_items as jsonb — could arrive as an
// object already, a JSON string, null, or an empty object ({}) when the
// product has no slip. Treat null/undefined/non-object/empty-object as
// "walang order slip".
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

// The raw jsonb is nested one level deep, grouped under each product's own
// id — e.g. { "<product_id_A>": { "Theme": "...", "Cake Message": "..." },
// "<product_id_B>": { "Baloon Label": "...", ... } }. The same combined
// object is stored on every order_item row in a bundle, so we must only
// pull out the group whose key matches THIS item's product_id — otherwise
// every product in the bundle ends up showing every other product's fields
// too.
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
      // No nested groups at all — the object itself is already flat fields.
      fields = slip;
    } else if (groupKeys.length === 1 && groupKeys.length === Object.keys(slip).length) {
      // Only one group and no product_id to match against — safe to use it.
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
  const [activeTab, setActiveTab] = useState('customer');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const items = order ? (order.items || order.order_items || []) : [];
  const hasOrderSlipCheck = items.some(item => parseSlipDetails(item.order_slip_details ?? item.orderSlipDetails));

  // Guard against the modal being reused for a different order that has no
  // order slip while it was left sitting on the Order Slip tab.
  useEffect(() => {
    if (activeTab === 'slip' && !hasOrderSlipCheck) {
      setActiveTab('customer');
    }
  }, [order?.id, hasOrderSlipCheck, activeTab]);

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

  const specialInstructions = order.specialInstructions || 
                              order.special_instructions || 
                              items.find(i => i.special_instructions)?.special_instructions || 
                              items.find(i => i.specialInstructions)?.specialInstructions;

  const referenceImage       = order.customerReference || 
                               order.customer_reference_url || 
                               items.find(i => i.customer_reference_url)?.customer_reference_url || 
                               items.find(i => i.customerReference)?.customerReference;

  // Order Slip tab only shows up when at least one ordered product actually
  // has slip details attached (order_items.order_slip_details) — kung wala,
  // walang tab.
  //
  // One card per bundle (or per standalone product) — reuses the same
  // bundle grouping as the Order Items table so bundled products still
  // share one box, but each product's slip stays in its own clearly
  // labeled section instead of being merged together. Bundle cards are
  // titled with the bundle/promo name; standalone cards are titled with
  // that specific product's name.
  const orderSlipCards = (() => {
    const cards = [];
    groupOrderItems(items).forEach(g => {
      if (g.isBundle) {
        const sections = g.items
          .map(item => ({ item, fields: getItemSlipFields(item) }))
          .filter(({ fields }) => fields);
        if (sections.length > 0) {
          cards.push({ title: g.bundleName, sections });
        }
      } else {
        const fields = getItemSlipFields(g.item);
        if (fields) {
          cards.push({ title: g.item.name || g.item.product_name || 'Item', sections: [{ item: g.item, fields }] });
        }
      }
    });
    return cards;
  })();
  const hasOrderSlip = orderSlipCards.length > 0;

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
    { id: 'customer', label: 'Customer Details', icon: User },
    { id: 'order', label: 'Order Details', icon: ReceiptText },
    ...(hasOrderSlip ? [{ id: 'slip', label: 'Order Slip', icon: FileText }] : []),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1108]/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-[#EAE4E0]">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-7 py-5 border-b border-[#EAE4E0] bg-white shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-[#3B1F0A]">Order #{orderNumber}</h2>
            <StatusBadge status={order.status} />
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] transition-colors"
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

        {/* Tab switcher — underline style; scrolls horizontally on mobile
            instead of wrapping or squeezing the labels */}
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
        <div className="px-4 sm:px-7 py-6 overflow-y-auto flex-1">

          {activeTab === 'customer' && (
            <div className="flex flex-col gap-5">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
                {/* Left: Customer + Pickup, stacked */}
                <div className="flex flex-col gap-5">
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

                {/* Right: Special Instructions — stretches to match the
                    combined height of the two stacked boxes on the left */}
                <div className="flex flex-col h-full">
                  <SectionLabel icon={Tag}>Special Instructions</SectionLabel>
                  <div className="flex-1 bg-[#FAF7F4] rounded-2xl p-4 text-sm text-[#3B1F0A] leading-relaxed border border-[#EAE4E0] italic">
                    {specialInstructions && specialInstructions !== 'EMPTY' ? specialInstructions : 'No special instructions provided.'}
                  </div>
                </div>
              </div>

            </div>
          )}

          {activeTab === 'order' && (
            <div className="flex flex-col gap-5">

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

              {/* Payment Status — Reference Image now lives in the Order Slip tab */}
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

            </div>
          )}

          {activeTab === 'slip' && hasOrderSlip && (
            <div className="flex flex-col gap-5">

              {/* Order Slip — one card per bundle (or per standalone
                  product); when a bundle has more than one product with
                  slip details, each product gets its own clearly labeled
                  section inside instead of merging them together. */}
              {orderSlipCards.map((card, idx) => (
                <div key={idx} className="bg-white border border-[#EAE4E0] rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 border-b border-[#EAE4E0] bg-[#F5EFEB] flex items-center gap-2">
                    <FileText size={14} className="text-[#8A7264]" />
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A7264]">
                      {card.title}
                    </p>
                    {card.sections.length > 1 && <BundleTag />}
                  </div>
                  <div className="divide-y divide-[#EAE4E0]">
                    {card.sections.map(({ item, fields }, i) => (
                      <div key={i} className="p-5 space-y-2.5">
                        {card.sections.length > 1 && (
                          <p className="text-xs font-bold text-[#3B1F0A] mb-1">
                            {item.name || item.product_name}
                          </p>
                        )}
                        {Object.entries(fields).map(([key, value], j) => (
                          <InfoRow key={`${key}-${j}`} label={formatSlipKey(key)} value={formatSlipValue(value)} />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Reference image — placed below the order slip itself, not beside it */}
              <div className="bg-[#FAF7F4] border border-[#EAE4E0] rounded-2xl p-5">
                <SectionLabel icon={ImageIcon}>Customer Reference</SectionLabel>
                <div className="rounded-xl overflow-hidden bg-[#F5EFEB] border border-[#EAE4E0] flex items-center justify-center">
                  {referenceImage ? (
                    <button
                      type="button"
                      onClick={() => setLightboxOpen(true)}
                      className="w-full group relative cursor-zoom-in"
                      aria-label="View full-size reference image"
                    >
                      <img src={referenceImage} alt="reference" className="w-full h-auto max-h-[280px] object-cover" />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-bold uppercase tracking-wide transition-opacity">
                          View Image
                        </span>
                      </div>
                    </button>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-[#8A7264] opacity-70 p-6 text-center">
                      <ImageIcon size={22} strokeWidth={1.75} />
                      <span className="text-[10px] font-bold tracking-wider uppercase">No Reference Image</span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer — hidden entirely when there's nothing actionable left
            (e.g. the order is already Completed or Cancelled) */}
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
                className="w-full sm:w-auto bg-[#3B1F0A] text-white hover:bg-[#2A1608] px-6 py-2.5 rounded-xl text-sm font-semibold shadow-md transition-colors"
              >
                Mark as {nextStatus[order.status]}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Reference image lightbox — click the thumbnail to view it full-size */}
      {lightboxOpen && referenceImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
          <img
            src={referenceImage}
            alt="reference full size"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}