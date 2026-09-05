import { useState, useEffect } from 'react';
import { QrCode, Search } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Badge, Button, Modal, Input, useToast } from '../ui';

function fmt(n) {
  return '₱' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statusVariant(s) {
  return { Confirmed: 'confirmed', Ready: 'ready', Completed: 'completed', Cancelled: 'cancelled' }[s] || 'default';
}

// ─── QR SCANNER ───────────────────────────────────────────────
// Button that opens a camera/manual-entry modal to find an order, then
// shows a quick scan-result modal with status actions.
export default function QrScanner({ orders, onStatusChange, onViewOrder }) {
  const { show: showToast } = useToast();

  const [scannerOpen, setScannerOpen]     = useState(false);
  const [manualOrderId, setManualOrderId] = useState('');
  const [resultOpen, setResultOpen]       = useState(false);
  const [resultOrder, setResultOrder]     = useState(null);

  // Lock background scroll while either modal is open — otherwise, on
  // mobile, scrolling inside the modal (e.g. the items list) chains up
  // and moves the page underneath it instead of staying inside the modal.
  useEffect(() => {
    if (!scannerOpen && !resultOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [scannerOpen, resultOpen]);

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
      setScannerOpen(false);
      setManualOrderId('');
      setResultOrder(foundOrder);
      setResultOpen(true);
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

  const order       = resultOrder;
  const grandTotal  = order ? (order.grandTotal || order.grand_total || 0) : 0;
  const subtotal    = order ? (order.subtotal || grandTotal) : 0;
  const items       = order ? (order.items || order.order_items || []) : [];
  const orderNumber = order ? (order.order_number || order.id) : null;

  return (
    <>
      <Button variant="primary" className="w-full sm:w-auto bg-brand-900 text-white font-bold shadow-md flex items-center justify-center gap-2"
        onClick={() => { setScannerOpen(true); setManualOrderId(''); }}>
        <QrCode size={18} /> Scan Receipt QR
      </Button>

      {/* Camera / manual entry */}
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

      {/* Scan result */}
      {order && (
        <Modal isOpen={resultOpen} onClose={() => setResultOpen(false)} size="md"
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
              <div className="bg-white rounded-lg p-3 max-h-[120px] overflow-y-auto overscroll-contain">
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
                  onClick={() => { onStatusChange(order.id, 'Completed'); setResultOpen(false); }}>
                  ✓ Mark as Completed
                </Button>
                {order.status === 'Confirmed' && (
                  <Button variant="secondary" className="w-full bg-blue-100 text-blue-900 font-black hover:bg-blue-200 py-2 rounded-lg border-2 border-blue-200"
                    onClick={() => { onStatusChange(order.id, 'Ready'); setResultOpen(false); }}>
                    Mark as Ready
                  </Button>
                )}
              </div>
            )}
            <Button variant="secondary" className="w-full border-2 border-brand-200 text-brand-900 font-bold py-2 rounded-lg hover:bg-brand-50"
              onClick={() => { setResultOpen(false); onViewOrder(order); }}>
              View Full Details
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}