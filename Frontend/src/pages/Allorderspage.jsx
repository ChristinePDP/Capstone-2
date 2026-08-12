import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Phone, Calendar, Image as ImageIcon, ReceiptText, QrCode, Search } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { useApp } from '../context/AppContext';
import { useToast } from '../components/ui';
import { Badge, Button, Modal, Table, Tr, Td, Pagination, SearchBar, FilterPills, Input } from '../components/ui';

const ORDER_STATUSES = ['All', 'Confirmed', 'Ready', 'Completed', 'Cancelled'];

function fmt(n) {
  return '₱' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statusVariant(s) {
  return { Confirmed: 'confirmed', Ready: 'ready', Completed: 'completed', Cancelled: 'cancelled' }[s] || 'default';
}
function typeVariant(t) {
  return t === 'Pre-Order' ? 'preorder' : 'buynow';
}
function paymentDisplay(order) {
  const payType   = order.paymentType   || order.payment_type;
  const amtPaid   = order.amountPaid    || order.amount_paid;
  const grandTotal = order.grandTotal   || order.grand_total;
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

// ─── ORDER DETAIL MODAL ───────────────────────────────────────
function OrderDetailModal({ order, isOpen, onClose, onStatusChange }) {
  if (!order) return null;

  // Support both camelCase (AppContext mapped) and snake_case (direct backend)
  const customer    = order.customer    || order.customers || {};
  const items       = order.items       || order.order_items || [];
  const grandTotal  = order.grandTotal  || order.grand_total || 0;
  const subtotal    = order.subtotal    || 0;
  const paymentType = order.paymentType || order.payment_type;
  const amountPaid  = order.amountPaid  || order.amount_paid;
  const pickupDate  = order.pickupDate  || order.pickup_date;
  const pickupTime  = order.pickupTime  || order.pickup_time;
  const specialInstructions = order.specialInstructions || order.special_instructions;
  const orderNumber = order.order_number || order.id;

  const nextStatus = { Confirmed: 'Ready', Ready: 'Completed' };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl"
      title={
        <div className="flex items-center gap-3">
          <span className="font-black text-brand-950 text-xl">Order #{orderNumber}</span>
          <Badge variant={statusVariant(order.status)} className="px-3 py-1 text-[11px] uppercase font-black tracking-widest border-2 border-brand-200">
            {order.status}
          </Badge>
        </div>
      }
    >
      <div className="grid grid-cols-12 gap-6">
        {/* Customer */}
        <div className="col-span-4 bg-[#fdf8f6] rounded-2xl p-6 border-2 border-brand-100 flex flex-col h-full">
          <p className="text-[11px] font-black uppercase tracking-widest text-brand-600 mb-5">Customer Details</p>
          <h3 className="text-2xl font-black text-brand-950 mb-6 leading-tight">{customer.name || 'Walk-in'}</h3>
          <div className="space-y-4 mb-8 text-[14px]">
            {customer.phone && (
              <div className="flex items-center gap-3 text-brand-900">
                <div className="bg-white p-1.5 rounded-lg border border-brand-200 shadow-sm"><Phone size={14} className="text-brand-700" /></div>
                <span className="font-bold">{customer.phone}</span>
              </div>
            )}
          </div>
          <div className="mt-auto pt-6 border-t-2 border-brand-100">
            <p className="text-[11px] font-black uppercase tracking-widest text-brand-600 mb-2">Pick-up Schedule</p>
            <p className="text-[15px] font-black text-brand-950 flex items-center gap-2">
              <Calendar size={16} className="text-brand-700" />
              {pickupDate || '—'} {pickupTime && <span className="text-brand-700 ml-1">— {pickupTime}</span>}
            </p>
          </div>
        </div>

        {/* Order Summary */}
        <div className="col-span-4 flex flex-col h-full">
          <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl overflow-hidden flex flex-col flex-1">
            <div className="px-5 py-3 border-b-2 border-slate-200 bg-white flex items-center gap-2">
              <ReceiptText size={14} className="text-slate-600" />
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">Order Summary</p>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-200">
                  {items.map((item, i) => (
                    <tr key={i}>
                      <td className="py-3 text-brand-950 font-bold pr-2">
                        {item.name || item.product_name} <span className="text-slate-500 font-black ml-1 text-xs">x{item.qty || item.quantity}</span>
                      </td>
                      <td className="py-3 text-right font-black text-brand-950">{fmt(item.total || item.total_price || (item.unit_price * item.quantity))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white border-t-2 border-slate-200 p-5 space-y-3">
              <div className="flex justify-between text-[13px] text-brand-800 font-bold">
                <span>Subtotal</span><span>{fmt(subtotal || grandTotal)}</span>
              </div>
              <div className="flex justify-between text-2xl font-black text-brand-950 pt-2 border-t-2 border-slate-100">
                <span>Grand Total</span><span className="text-green-900">{fmt(grandTotal)}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 bg-amber-50 border-2 border-amber-200 rounded-xl p-4 flex items-center justify-between">
            <span className="text-amber-900 font-black text-[10px] uppercase tracking-widest">Payment Status</span>
            <span className={`font-black px-3 py-1 rounded-lg text-xs border-2 ${paymentType === 'deposit' ? 'bg-amber-200 text-amber-950 border-amber-300' : 'bg-green-100 text-green-950 border-green-300'}`}>
              {paymentType === 'deposit' ? `Deposit ${fmt(amountPaid)}` : 'Fully Paid'}
            </span>
          </div>
        </div>

        {/* Reference & Instructions */}
        <div className="col-span-4 space-y-5 flex flex-col h-full">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-brand-700 mb-3 px-1">Customer Reference</p>
            <div className="rounded-2xl overflow-hidden bg-brand-100 border-2 border-brand-200 aspect-video flex items-center justify-center shadow-inner">
              {order.customerReference || order.reference_image_url ? (
                <img src={order.customerReference || order.reference_image_url} alt="reference" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center gap-1 text-brand-400 opacity-60">
                  <ImageIcon size={32} strokeWidth={2} />
                  <span className="text-[10px] font-black tracking-widest uppercase">No Reference Image</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-brand-700 mb-2 px-1">Special Instructions</p>
            <div className="bg-[#fdf8f6] rounded-2xl p-5 text-[14px] text-brand-950 font-bold leading-relaxed border-2 border-brand-200 shadow-inner flex-1 overflow-y-auto italic">
              {specialInstructions || 'No special instructions provided.'}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-10 pt-6 border-t-2 border-brand-200">
        <Button variant="secondary" onClick={onClose} className="px-8 border-2 border-brand-300 text-brand-950 font-black">Close</Button>
        {order.status === 'Confirmed' && (
          <Button variant="danger" onClick={() => { onStatusChange(order.id, 'Cancelled'); onClose(); }} className="px-8 bg-red-100 text-red-900 border-2 border-red-200 font-black hover:bg-red-200">
            Cancel Order
          </Button>
        )}
        {nextStatus[order.status] && (
          <Button variant="primary" className="px-10 bg-brand-950 text-white shadow-xl shadow-brand-200 font-black hover:bg-black transition-all"
            onClick={() => { onStatusChange(order.id, nextStatus[order.status]); onClose(); }}>
            Mark as {nextStatus[order.status]}
          </Button>
        )}
      </div>
    </Modal>
  );
}

function ScanResultModal({ order, isOpen, onClose, onStatusChange, onViewDetails }) {
  if (!order) return null;
  const grandTotal   = order.grandTotal  || order.grand_total || 0;
  const subtotal     = order.subtotal    || grandTotal;
  const items        = order.items       || order.order_items || [];
  const orderNumber  = order.order_number || order.id;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md"
      title={
        <div className="flex items-center gap-3">
          <span className="font-black text-brand-950 text-lg">Scan Result</span>
          <Badge variant={statusVariant(order.status)} className="px-3 py-1 text-[11px] uppercase font-black tracking-widest border-2 border-brand-200">{order.status}</Badge>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="bg-[#fdf8f6] rounded-xl p-4 border-2 border-brand-100">
          <p className="text-[10px] font-black uppercase tracking-widest text-brand-600 mb-2">Order Details</p>
          <p className="text-[10px] font-black text-brand-950 mb-2">#{orderNumber}</p>
          <p className="text-[15px] font-bold text-brand-900 mb-3">{(order.customer || order.customers)?.name || 'Walk-in'}</p>
          <div className="bg-white rounded-lg p-3 max-h-[120px] overflow-y-auto">
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-200">
                {items.map((item, i) => (
                  <tr key={i} className="py-2">
                    <td className="font-bold text-brand-950 py-1">{item.name || item.product_name}</td>
                    <td className="text-right font-black text-brand-950 py-1">x{item.qty || item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-4 border-2 border-slate-200">
          <div className="flex justify-between mb-2 text-sm font-bold">
            <span className="text-slate-600">Subtotal</span><span className="text-brand-950">₱{Number(subtotal).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-lg font-black border-t-2 border-slate-200 pt-2">
            <span className="text-brand-950">Total</span><span className="text-green-700">{fmt(grandTotal)}</span>
          </div>
        </div>
        {order.status === 'Completed' && (
          <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 text-center">
            <p className="text-2xl mb-2">✓</p>
            <p className="text-green-900 font-black text-[14px]">This order is already completed.</p>
          </div>
        )}
        {order.status === 'Cancelled' && (
          <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 text-center">
            <p className="text-2xl mb-2">✕</p>
            <p className="text-red-900 font-black text-[14px]">This order has been cancelled.</p>
          </div>
        )}
        {(order.status === 'Confirmed' || order.status === 'Ready') && (
          <div className="space-y-2">
            <Button variant="primary" className="w-full bg-green-600 text-white font-black hover:bg-green-700 flex items-center justify-center gap-2 py-3 rounded-lg"
              onClick={() => { onStatusChange(order.id, 'Completed'); onClose(); }}>
              ✓ Mark as Completed
            </Button>
            {order.status === 'Confirmed' && (
              <Button variant="secondary" className="w-full bg-blue-100 text-blue-900 font-black hover:bg-blue-200 py-2 rounded-lg border-2 border-blue-200"
                onClick={() => { onStatusChange(order.id, 'Ready'); onClose(); }}>
                Mark as Ready
              </Button>
            )}
          </div>
        )}
        <Button variant="secondary" className="w-full border-2 border-brand-200 text-brand-900 font-bold py-2 rounded-lg hover:bg-brand-50" onClick={onViewDetails}>
          View Full Details
        </Button>
      </div>
    </Modal>
  );
}

const PER_PAGE = 8;

export default function AllOrdersPage() {
  const { orders, updateOrderStatus, fetchOrders, loading } = useApp();
  const { show: showToast } = useToast();

  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOpen, setDetailOpen]       = useState(false);
  const [scanResultOpen, setScanResultOpen]   = useState(false);
  const [scanResultOrder, setScanResultOrder] = useState(null);
  const [scannerOpen, setScannerOpen]     = useState(false);
  const [manualOrderId, setManualOrderId] = useState('');

  const filtered = orders.filter(o => {
    const statusOk = statusFilter === 'All' || o.status === statusFilter;
    const name     = (o.customer || o.customers)?.name || '';
    const ordNum   = o.order_number || o.id || '';
    const searchOk = !search || name.toLowerCase().includes(search.toLowerCase()) || String(ordNum).toLowerCase().includes(search.toLowerCase());
    return statusOk && searchOk;
  });

  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleStatusChange = async (id, status) => {
    try {
      await updateOrderStatus(id, status);
      showToast(`Order status updated to ${status}.`);
    } catch (err) {
      showToast(err.message || 'Failed to update status.', 'error');
    }
  };

  const processOrderSearch = (scannedId) => {
    let foundOrder = null;
    try {
      let payloadStr = String(scannedId);
      const firstBrace = payloadStr.indexOf('{');
      if (firstBrace >= 0) payloadStr = payloadStr.slice(firstBrace);
      const payload = JSON.parse(payloadStr);
      foundOrder = orders.find(o => o.id === payload.orderId || o.order_number === payload.orderId);
    } catch {
      const cleanId = String(scannedId).replace('#', '').trim().toUpperCase();
      foundOrder = orders.find(o =>
        String(o.id).replace('#', '').toUpperCase() === cleanId ||
        String(o.order_number || '').replace('#', '').toUpperCase() === cleanId
      );
    }
    if (foundOrder) {
      setScannerOpen(false); setManualOrderId('');
      setScanResultOrder(foundOrder); setScanResultOpen(true);
      showToast(`✓ Order found!`, 'success');
    } else {
      showToast('❌ Order not found.', 'error');
    }
  };

  const handleScan = (detectedCodes) => {
    if (detectedCodes?.length > 0) processOrderSearch(detectedCodes[0].rawValue);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualOrderId) processOrderSearch(manualOrderId);
  };

  const columns = [
    { label: 'Order ID' }, { label: 'Customer' }, { label: 'Type' },
    { label: 'Amount' }, { label: 'Payment' }, { label: 'Pick-up / Date' },
    { label: 'Status' }, { label: 'Action', align: 'center' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <SearchBar value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Search order or customer..." className="w-72 border-2 border-brand-200" />
          <FilterPills options={ORDER_STATUSES} value={statusFilter} onChange={v => { setStatusFilter(v); setPage(1); }} />
        </div>
        <Button variant="primary" className="bg-brand-900 text-white font-bold shadow-md flex items-center gap-2"
          onClick={() => { setScannerOpen(true); setManualOrderId(''); }}>
          <QrCode size={18} /> Scan Receipt QR
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <Table columns={columns}>
          {loading ? (
            <Tr><Td className="text-center py-16 text-slate-400 font-medium" colSpan={8}>Loading orders…</Td></Tr>
          ) : paged.map(order => {
            const customer   = order.customer || order.customers || {};
            const grandTotal = order.grandTotal || order.grand_total || 0;
            const orderType  = order.orderType  || order.order_type  || order.type;
            const pickupDate = order.pickupDate || order.pickup_date;
            const pickupTime = order.pickupTime || order.pickup_time;
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
                <Td><Badge variant={typeVariant(orderType)} className="font-medium px-2 py-0.5 text-xs">{orderType}</Badge></Td>
                <Td className="font-semibold text-slate-900 text-[14px]">{fmt(grandTotal)}</Td>
                <Td>{paymentDisplay(order)}</Td>
                <Td className="text-[13px] text-slate-700 font-medium">{pickupDate ? `${pickupDate}${pickupTime ? ' — ' + pickupTime : ''}` : '—'}</Td>
                <Td><Badge variant={statusVariant(order.status)} className="font-medium px-2 py-0.5 text-xs shadow-none">{order.status}</Badge></Td>
                <Td align="center">
                  <Button size="sm" variant="secondary" className="font-medium border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs px-3 py-1.5"
                    onClick={() => { setSelectedOrder(order); setDetailOpen(true); }}>
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

      <OrderDetailModal order={selectedOrder} isOpen={detailOpen} onClose={() => setDetailOpen(false)} onStatusChange={handleStatusChange} />
      <ScanResultModal order={scanResultOrder} isOpen={scanResultOpen} onClose={() => setScanResultOpen(false)} onStatusChange={handleStatusChange}
        onViewDetails={() => { setScanResultOpen(false); setSelectedOrder(scanResultOrder); setDetailOpen(true); }} />

      <Modal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} size="md" title="Find Customer Order" subtitle="I-scan ang QR Code o i-type ang Order ID.">
        <div className="flex flex-col gap-6 p-2">
          <div className="w-full bg-black rounded-xl overflow-hidden shadow-inner flex items-center justify-center relative min-h-[300px]">
            {scannerOpen && (
              <Scanner onScan={handleScan} onError={err => showToast(`Camera error: ${err?.message || 'Unable to access camera'}`, 'error')}
                formats={['qr_code']} components={{ audio: false, torch: true }}
                constraints={{ video: { facingMode: 'environment' } }} />
            )}
            <div className="absolute top-2 right-2 bg-black/50 text-white/80 px-2 py-1 rounded text-[10px] font-bold tracking-widest uppercase">Camera Active</div>
          </div>
          <div className="flex items-center gap-4">
            <hr className="flex-1 border-brand-200" />
            <span className="text-xs font-bold text-brand-400 uppercase tracking-widest">OR ENTER MANUALLY</span>
            <hr className="flex-1 border-brand-200" />
          </div>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="flex-1">
              <Input value={manualOrderId} onChange={e => setManualOrderId(e.target.value)} placeholder="e.g. ORD-0001" className="w-full" />
            </div>
            <Button type="submit" variant="primary" className="bg-brand-900 text-white shrink-0 px-6"><Search size={16} /></Button>
          </form>
        </div>
      </Modal>
    </div>
  );
}