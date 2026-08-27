import { X, Phone, Calendar, Image as ImageIcon, ReceiptText, Clock, Tag, Wallet } from 'lucide-react';

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

// ── badges (same visual language as EventManager's Active/Inactive pill) ──
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

// Groups order items by bundle_group_id so items belonging to the same
// promo bundle render together under one bundle-name header, with the
// individual products listed as a breakdown underneath. Items without a
// bundle_group_id render as normal standalone rows.
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

// ── small building blocks ───────────────────────────────────────
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

// ── DETAILS MODAL ────────────────────────────────────────────
export default function DetailsModal({ order, isOpen, onClose, onStatusChange }) {
  if (!isOpen || !order) return null;

  // Support both camelCase (AppContext mapped) and snake_case (direct backend)
  const customer     = order.customer || order.customers || {};
  const items         = order.items || order.order_items || [];
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

  // FETCHING FIX: Kunin ang data mula sa root order kung available, or fall back sa paghanap sa items array.
  const specialInstructions = order.specialInstructions || 
                              order.special_instructions || 
                              items.find(i => i.special_instructions)?.special_instructions || 
                              items.find(i => i.specialInstructions)?.specialInstructions;

  const referenceImage       = order.customerReference || 
                               order.customer_reference_url || 
                               items.find(i => i.customer_reference_url)?.customer_reference_url || 
                               items.find(i => i.customerReference)?.customerReference;

  const nextStatus = { Confirmed: 'Ready', Ready: 'Completed' };

  const pickupTimeLabel = pickupTime
    ? formatTime(pickupTime) + (pickupTimeEnd ? ` – ${formatTime(pickupTimeEnd)}` : '')
    : null;

  // Build the Order Items rows: bundle groups get a bold header row
  // (bundle name + total) followed by an indented breakdown of the
  // products inside it; standalone items render as before.
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1108]/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden border border-[#EAE4E0]">

        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-[#EAE4E0] bg-white shrink-0">
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

        {/* Body */}
        <div className="px-7 py-6 overflow-y-auto flex flex-col gap-5">

          {/* Order meta strip */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pb-5 border-b border-[#EAE4E0] text-sm">
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

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">

            {/* Customer + Pickup */}
            <div className="md:col-span-4 flex flex-col gap-5">
              <div className="bg-[#FAF7F4] rounded-2xl p-5 border border-[#EAE4E0]">
                <SectionLabel>Customer Details</SectionLabel>
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

            {/* Items + Payment */}
            <div className="md:col-span-5 flex flex-col gap-5">
              <div className="bg-white border border-[#EAE4E0] rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-[#EAE4E0] bg-[#F5EFEB] flex items-center gap-2">
                  <ReceiptText size={14} className="text-[#8A7264]" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#8A7264]">Order Items</p>
                </div>
                <div className="p-4 max-h-40 overflow-y-auto">
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

            {/* Reference + Instructions */}
            <div className="md:col-span-3 flex flex-col gap-5">
              <div>
                <SectionLabel icon={ImageIcon}>Customer Reference</SectionLabel>
                <div className="rounded-2xl overflow-hidden bg-[#F5EFEB] border border-[#EAE4E0] aspect-square flex items-center justify-center">
                  {referenceImage ? (
                    <img src={referenceImage} alt="reference" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-[#8A7264] opacity-70 px-2 text-center">
                      <ImageIcon size={26} strokeWidth={1.75} />
                      <span className="text-[10px] font-bold tracking-wider uppercase">No Reference Image</span>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <SectionLabel icon={Tag}>Special Instructions</SectionLabel>
                <div className="bg-[#FAF7F4] rounded-2xl p-4 text-sm text-[#3B1F0A] leading-relaxed border border-[#EAE4E0] italic min-h-[80px]">
                  {specialInstructions && specialInstructions !== 'EMPTY' ? specialInstructions : 'No special instructions provided.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2.5 px-7 py-5 border-t border-[#EAE4E0] shrink-0">
          <button
            onClick={onClose}
            className="w-full sm:w-auto bg-white text-[#5A453C] border border-[#DED4CC] hover:bg-[#F5EFEB] px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            Close
          </button>
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
      </div>
    </div>
  );
}