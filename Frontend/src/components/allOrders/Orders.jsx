import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Badge, Button, Table, Tr, Td, Pagination, SearchBar } from '../ui';
import QrScanner from './QrScanner';

const ORDER_STATUSES = ['All', 'Confirmed', 'Ready', 'Completed', 'Cancelled'];
const PER_PAGE = 8;

function fmt(n) {
  return '₱' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
function pickupLabel(date, time, timeEnd) {
  const d = formatDate(date);
  if (!d) return '—';
  const start = formatTime(time);
  const end = formatTime(timeEnd);
  if (!start) return d;
  return `${d} — ${start}${end ? ` – ${end}` : ''}`;
}
function statusVariant(s) {
  return { Confirmed: 'confirmed', Ready: 'ready', Completed: 'completed', Cancelled: 'cancelled' }[s] || 'default';
}
function typeVariant(t) {
  return t === 'Pre-Order' ? 'preorder' : 'buynow';
}
function sourceLabel(order) {
  const placedByAdmin = order.placedByAdmin || order.placed_by_admin;
  if (placedByAdmin) return 'Walk-in (Staff)';
  const source = order.source || order.order_source;
  if (!source) return null;
  return source === 'online' ? 'Online' : source.charAt(0).toUpperCase() + source.slice(1);
}
// Stacks the order source (Online / Walk-in) above the order type
// (Pre-Order / Buy Now) badge so both live together in one cell.
function TypeCell({ order, orderType }) {
  const label = sourceLabel(order);
  return (
    <div className="flex flex-col gap-1 items-start">
      {label && (
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
      )}
      <Badge variant={typeVariant(orderType)} className="font-medium px-2 py-0.5 text-xs">{orderType}</Badge>
    </div>
  );
}
function PaymentDisplay({ order }) {
  const payType    = order.paymentType || order.payment_type;
  const amtPaid    = order.amountPaid  || order.amount_paid;
  const grandTotal = order.grandTotal  || order.grand_total;
  if (payType === 'deposit') {
    return (
      <div className="flex flex-col gap-0.5">
        <p className="text-amber-700 font-semibold text-[13.5px]">Deposit {fmt(amtPaid)}</p>
        <p className="text-xs text-slate-500 font-medium">Balance {fmt(grandTotal - amtPaid)}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-emerald-700 font-semibold text-[13.5px]">Fully Paid</p>
      <p className="text-xs text-slate-500 font-medium">{fmt(grandTotal)}</p>
    </div>
  );
}

const COLUMNS = [
  { label: 'Order ID' }, { label: 'Customer' }, { label: 'Type' },
  { label: 'Amount' }, { label: 'Payment' }, { label: 'Pick-up / Date' },
  { label: 'Status' }, { label: 'Action', align: 'center' },
];

// ─── ORDERS ───────────────────────────────────────────────────
// The listing itself: toolbar (search/filter/scan), mobile cards,
// desktop table, and pagination. Tells the parent when a row is
// picked via onViewOrder, and when a status changes via onStatusChange.
export default function Orders({ orders, loading, onViewOrder, onStatusChange }) {
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = orders.filter(o => {
    const statusOk = statusFilter === 'All' || o.status === statusFilter;
    const name     = (o.customer || o.customers)?.name || '';
    const ordNum   = o.order_number || o.id || '';
    const searchOk = !search || name.toLowerCase().includes(search.toLowerCase()) || String(ordNum).toLowerCase().includes(search.toLowerCase());
    return statusOk && searchOk;
  });

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="space-y-5">
      {/* Desktop (lg+): iisang row na lang ang search, status tabs, at
          QR button — makatipid sa space. Mobile/tablet: hiwalay pa rin
          ang bawat isa sa sariling row, mas komportable sa maliit na
          screen. */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search order or customer..." className="w-full lg:w-64 lg:shrink-0 border-2 border-brand-200" />

        {/* Order status tabs — underline style (gaya ng category tabs sa
            customer-facing Menu). Sa mobile, "justify-between" para
            kumalat/mag-spread ang mga tab sa buong lapad; sa desktop
            (lg+), "justify-start" na lang para naka-left-align sila sa
            loob ng natitirang espasyo sa row, hindi na naka-spread. */}
        <div className="flex w-full lg:flex-1 justify-between lg:justify-start gap-4 sm:gap-8 lg:gap-6 overflow-x-auto scrollbar-hide border-b border-slate-200 lg:border-b-0">
          {ORDER_STATUSES.map(status => (
            <button
              key={status}
              onClick={() => { setStatusFilter(status); setPage(1); }}
              className={`shrink-0 pb-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                statusFilter === status
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        <QrScanner orders={orders} onStatusChange={onStatusChange} onViewOrder={onViewOrder} />
      </div>

      {/* Mobile / tablet — cards. Gamit ang "lg" breakpoint (1024px) sa
          halip na "md" (768px): may 8 columns ang table (ID, Customer,
          Type, Amount, Payment, Pick-up, Status, Action), kaya kahit sa
          mga tablet-width na screen (768–1024px) masisikip/maiipit pa rin
          ito kung ipipilit — mas maganda pa ring cards ang lumabas doon.
          Totoong desktop-width (1024px+) na lang talaga dapat lumabas
          ang table view. */}
      <div className="lg:hidden bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        {loading ? (
          <p className="text-center py-16 text-slate-400 font-medium">Loading orders…</p>
        ) : paged.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {paged.map(order => {
              const customer   = order.customer   || order.customers || {};
              const grandTotal = order.grandTotal || order.grand_total || 0;
              const orderType  = order.orderType  || order.order_type  || order.type;
              const pickupDate = order.pickupDate || order.pickup_date;
              const pickupTime = order.pickupTime || order.pickup_time;
              const pickupTimeEnd = order.pickupTimeEnd || order.pickup_time_end;
              const orderId    = order.order_number || order.id;
              const items      = order.items      || order.order_items || [];
              return (
                <div key={order.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col gap-3 hover:shadow-md hover:border-slate-300 transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-400 truncate">#{orderId}</p>
                      <p className="font-semibold text-slate-900 text-[15px] leading-tight truncate">{customer.name || 'Walk-in'}</p>
                      {customer.phone && <p className="text-[12px] text-slate-500">{customer.phone}</p>}
                    </div>
                    <Badge variant={statusVariant(order.status)} className="font-medium px-2 py-0.5 text-xs shadow-none shrink-0">
                      {order.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <TypeCell order={order} orderType={orderType} />
                    <span className="text-[13px] text-slate-700 font-medium flex items-center gap-1">
                      <Calendar size={13} className="text-slate-400" />
                      {pickupLabel(pickupDate, pickupTime, pickupTimeEnd)}
                    </span>
                  </div>
                  {items.length > 0 && (
                    <div className="border-t border-slate-100 pt-2 space-y-1">
                      {items.slice(0, 3).map((item, i) => (
                        <div key={i} className="flex justify-between gap-2 text-[12.5px] text-slate-600">
                          <span className="truncate">{item.name || item.product_name}</span>
                          <span className="text-slate-400 shrink-0">x{item.qty || item.quantity}</span>
                        </div>
                      ))}
                      {items.length > 3 && (
                        <p className="text-[11px] text-slate-400">+{items.length - 3} more item(s)</p>
                      )}
                    </div>
                  )}
                  <div className="flex items-end justify-between border-t border-slate-100 pt-3 mt-auto gap-2">
                    <div className="min-w-0">
                      <p className="text-[12px] text-slate-400 mb-0.5">Total {fmt(grandTotal)}</p>
                      <PaymentDisplay order={order} />
                    </div>
                    <Button size="sm" variant="secondary"
                      className="font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs px-3 py-1.5 shrink-0"
                      onClick={() => onViewOrder(order)}>
                      View Details
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-slate-500 font-medium py-16 text-sm">No orders found.</p>
        )}
        <Pagination page={page} count={filtered.length} perPage={PER_PAGE} total="Orders" onChange={setPage} />
      </div>

      {/* Desktop — table. Lumalabas lang mula lg (1024px) pataas, para
          may sapat na lapad ang 8 columns. Dinagdagan pa rin ng
          overflow-x-auto bilang safety net kung sakaling masikipan pa
          rin sa mismong 1024px width. */}
      <div className="hidden lg:block bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <Table columns={COLUMNS}>
          {loading ? (
            <Tr><Td className="text-center py-16 text-slate-400 font-medium" colSpan={8}>Loading orders…</Td></Tr>
          ) : paged.map(order => {
            const customer   = order.customer || order.customers || {};
            const grandTotal = order.grandTotal || order.grand_total || 0;
            const orderType  = order.orderType  || order.order_type  || order.type;
            const pickupDate = order.pickupDate || order.pickup_date;
            const pickupTime = order.pickupTime || order.pickup_time;
            const pickupTimeEnd = order.pickupTimeEnd || order.pickup_time_end;
            const orderId    = order.order_number || order.id;
            return (
              <Tr key={order.id} className="hover:bg-slate-50 transition-colors border-b border-slate-100">
                <Td className="text-[12px] font-medium text-slate-500">#{orderId}</Td>
                <Td>
                  <div className="flex flex-col gap-0.5">
                    <p className="font-semibold text-slate-900 text-[14px]">{customer.name || 'Walk-in'}</p>
                    {customer.phone && <p className="text-[12px] text-slate-500">{customer.phone}</p>}
                  </div>
                </Td>
                <Td><TypeCell order={order} orderType={orderType} /></Td>
                <Td className="font-semibold text-slate-900 text-[14px]">{fmt(grandTotal)}</Td>
                <Td><PaymentDisplay order={order} /></Td>
                <Td className="text-[13px] text-slate-700 font-medium">{pickupLabel(pickupDate, pickupTime, pickupTimeEnd)}</Td>
                <Td><Badge variant={statusVariant(order.status)} className="font-medium px-2 py-0.5 text-xs shadow-none">{order.status}</Badge></Td>
                <Td align="center">
                  <Button size="sm" variant="secondary" className="font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs px-3 py-1.5"
                    onClick={() => onViewOrder(order)}>
                    View Details
                  </Button>
                </Td>
              </Tr>
            );
          })}
          {!loading && !paged.length && (
            <Tr><Td className="text-center text-slate-500 font-medium py-16 text-sm" colSpan={8}>No orders found.</Td></Tr>
          )}
        </Table>
        <Pagination page={page} count={filtered.length} perPage={PER_PAGE} total="Orders" onChange={setPage} />
      </div>
    </div>
  );
}