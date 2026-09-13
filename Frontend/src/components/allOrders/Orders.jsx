import { useState, useEffect } from 'react';
import { Calendar, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Button, Table, Tr, Td } from '../ui';
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
// Shows "-" instead of the generic "Walk-in Customer" placeholder name.
function displayName(customer) {
  const name = (customer.name || '').trim();
  if (!name || /^walk-in customer$/i.test(name)) return '-';
  return name;
}
// Shows "-" instead of a placeholder phone number like "00000000000".
function displayPhone(customer) {
  const phone = String(customer.phone || '').trim();
  if (!phone || /^0+$/.test(phone)) return '-';
  return phone;
}
// Stacks the order source (Online / Walk-in) above the order type
// (Pre-Order / Buy Now) label so both live together in one cell.
// No badge background, no color — plain text — and never wraps to a
// second line.
function TypeCell({ order, orderType }) {
  const label = sourceLabel(order);
  return (
    <div className="flex flex-col gap-1 items-start whitespace-nowrap">
      {label && (
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap">{label}</span>
      )}
      <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">
        {orderType}
      </span>
    </div>
  );
}
// Single line only: "Fully Paid" or "Deposit: ₱X,XXX.XX" — no color,
// no balance line underneath, and never wraps to a second line.
function PaymentDisplay({ order }) {
  const payType = order.paymentType || order.payment_type;
  const amtPaid = order.amountPaid  || order.amount_paid;
  const grandTotal = order.grandTotal || order.grand_total;
  if (payType === 'deposit') {
    return <p className="text-slate-700 font-semibold text-[13.5px] whitespace-nowrap">Deposit: {fmt(amtPaid)}</p>;
  }
  return <p className="text-slate-700 font-semibold text-[13.5px] whitespace-nowrap">Fully Paid</p>;
}
// Renders pick-up info as two stacked lines: "Date: ..." and "Time: ...".
function PickupCell({ date, time, timeEnd }) {
  const d = formatDate(date);
  const start = formatTime(time);
  const end = formatTime(timeEnd);
  const timeStr = start ? `${start}${end ? ` – ${end}` : ''}` : '—';
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-[13px] text-slate-700 font-medium">Date: {d || '—'}</p>
      <p className="text-[13px] text-slate-700 font-medium">Time: {timeStr}</p>
    </div>
  );
}

const COLUMNS = [
  { label: 'Order ID' }, { label: 'Customer' }, { label: 'Type' },
  { label: 'Amount' }, { label: 'Payment' }, { label: 'Pick-up / Date' },
  { label: 'Status' }, { label: 'Action', align: 'center' },
];

// ─── INLINE COMPONENTS ────────────────────────────────────────
function SearchBar({ value, onChange, placeholder, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A7264]" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3.5 py-2.5 text-xs border border-[#DED4CC] rounded-xl outline-none focus:border-[#5A453C] bg-white transition-colors placeholder:text-gray-400"
      />
    </div>
  );
}

function Pagination({ page, count, perPage, total, onChange, className = '' }) {
  const maxPage = Math.max(1, Math.ceil(count / perPage));

  const getPages = () => {
    if (maxPage <= 5) {
      return Array.from({ length: maxPage }, (_, i) => i + 1);
    }
    if (page <= 3) {
      return [1, 2, 3, '...', maxPage];
    }
    if (page >= maxPage - 2) {
      return [1, '...', maxPage - 2, maxPage - 1, maxPage];
    }
    return [1, '...', page, '...', maxPage];
  };

  const start = count === 0 ? 0 : (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, count);

  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 text-sm ${className}`}>
      <div className="text-slate-500 text-xs">
        Showing <span className="font-medium text-slate-700">{start}</span> to <span className="font-medium text-slate-700">{end}</span> of <span className="font-medium text-slate-700">{count}</span> {total}
      </div>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          className="p-1 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        {getPages().map((p, i) => (
          <button
            key={i}
            disabled={p === '...'}
            onClick={() => p !== '...' && onChange(p)}
            className={`min-w-[28px] h-7 px-2 rounded-md flex items-center justify-center text-xs font-medium transition-colors ${
              p === page
                ? 'bg-[#3B1F0A] text-white'
                : p === '...'
                ? 'text-slate-400 cursor-default'
                : 'text-[#8A7264] hover:bg-[#F5EFEB] hover:text-[#3B1F0A]'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          disabled={page === maxPage}
          onClick={() => onChange(page + 1)}
          className="p-1 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
// ─────────────────────────────────────────────────────────────

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
    // FIX: i-normalize ang parehong side bago ikumpara — i-trim ang search
    // input at alisin ang "#" prefix sa dulo, dahil sa table/card ipinapakita
    // ang order number bilang "#ORD-2632" pero ang aktwal na order_number/id
    // field ay walang "#". Dati, kapag na-type o na-copy ng user ang buong
    // "#ORD-2632" (kasama ang "#"), hindi ito nagma-match kahit tama ang
    // order number, dahil wala talagang "#" sa ordNum kaya laging fail ang
    // .includes() check.
    const query = search.trim().toLowerCase().replace(/^#/, '');
    const searchOk = !query
      || name.toLowerCase().includes(query)
      || String(ordNum).toLowerCase().replace(/^#/, '').includes(query);
    return statusOk && searchOk;
  });

  const maxPage = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  useEffect(() => {
    if (page > maxPage) setPage(maxPage);
  }, [maxPage, page]);

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
        <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search order or customer..." className="w-full lg:w-64 lg:shrink-0" />

        <div className="flex w-full lg:flex-1 justify-between lg:justify-start gap-5 sm:gap-7 lg:gap-6 overflow-x-auto overflow-y-hidden scrollbar-hide border-b border-[#EAE4E0] lg:border-b-0">
          {ORDER_STATUSES.map(status => {
            const active = statusFilter === status;
            return (
              <button
                key={status}
                onClick={() => { setStatusFilter(status); setPage(1); }}
                className={`relative shrink-0 pb-2.5 text-xs sm:text-sm font-semibold tracking-wide whitespace-nowrap transition-colors ${
                  active
                    ? 'text-[#3B1F0A]'
                    : 'text-[#8A7264] hover:text-[#3B1F0A]'
                }`}
              >
                {status}
                {active && (
                  <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#3B1F0A] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        <QrScanner orders={orders} onStatusChange={onStatusChange} onViewOrder={onViewOrder} />
      </div>

      <div className="lg:hidden">
        {loading ? (
          <p className="text-center py-16 text-slate-400 font-medium bg-white rounded-xl border border-slate-200 shadow-sm">Loading orders…</p>
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
                      <p className="font-semibold text-slate-900 text-[15px] leading-tight truncate">{displayName(customer)}</p>
                      <p className="text-[12px] text-slate-500">{displayPhone(customer)}</p>
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
                      More Details
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-center text-slate-500 font-medium py-16 text-sm bg-white rounded-xl border border-slate-200 shadow-sm">No orders found.</p>
        )}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 mt-4">
          <Pagination page={page} count={filtered.length} perPage={PER_PAGE} total="Orders" onChange={setPage} />
        </div>
      </div>

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
                <Td className="text-[12px] font-medium text-slate-500 whitespace-nowrap">#{orderId}</Td>
                <Td>
                  <div className="flex flex-col gap-0.5 whitespace-nowrap">
                    <p className="font-semibold text-slate-900 text-[14px]">{displayName(customer)}</p>
                    <p className="text-[12px] text-slate-500">{displayPhone(customer)}</p>
                  </div>
                </Td>
                <Td><TypeCell order={order} orderType={orderType} /></Td>
                <Td className="font-semibold text-slate-900 text-[14px] whitespace-nowrap">{fmt(grandTotal)}</Td>
                <Td><PaymentDisplay order={order} /></Td>
                <Td><PickupCell date={pickupDate} time={pickupTime} timeEnd={pickupTimeEnd} /></Td>
                <Td className="whitespace-nowrap"><Badge variant={statusVariant(order.status)} className="font-medium px-2 py-0.5 text-xs shadow-none whitespace-nowrap">{order.status}</Badge></Td>
                <Td align="center">
                  <Button size="sm" variant="secondary" className="font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs px-3 py-1.5"
                    onClick={() => onViewOrder(order)}>
                    More Details
                  </Button>
                </Td>
              </Tr>
            );
          })}
          {!loading && !paged.length && (
            <Tr><Td className="text-center text-slate-500 font-medium py-16 text-sm" colSpan={8}>No orders found.</Td></Tr>
          )}
        </Table>
        <div className="px-4 py-3 border-t border-slate-200">
          <Pagination page={page} count={filtered.length} perPage={PER_PAGE} total="Orders" onChange={setPage} />
        </div>
      </div>
    </div>
  );
}