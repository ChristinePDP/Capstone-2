import { useState, useEffect, useRef } from 'react';
import { QrCode, Search, CheckCircle2, ReceiptText } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Badge, Button, Modal, Input, ConfirmModal, useToast } from '../ui';

function fmt(n) {
  return '₱' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statusVariant(s) {
  return { Confirmed: 'confirmed', Ready: 'ready', Completed: 'completed', Cancelled: 'cancelled' }[s] || 'default';
}

const SAVE_KEY = 'qr-scanner-ui';
function loadSaved(locKey) {
  try {
    const s = JSON.parse(sessionStorage.getItem(SAVE_KEY) || 'null');
    return s && s.key === locKey ? s : null;
  } catch { return null; }
}

// ─── QR SCANNER ───────────────────────────────────────────────
// Button that opens a camera/manual-entry modal to find an order, then
// shows a quick scan-result modal with status actions.
export default function QrScanner({ orders, onStatusChange, onViewOrder }) {
  const { show: showToast } = useToast();
  const { key: locKey } = useLocation();

  // Survive a remount/reload (auto-refresh): the open modal is kept in sessionStorage together
  // with the history entry's location.key, so it only comes back for the same page visit.
  const [scannerOpen, setScannerOpen]     = useState(() => loadSaved(locKey)?.mode === 'scanner');
  const [manualOrderId, setManualOrderId] = useState('');
  const [resultOpen, setResultOpen]       = useState(() => loadSaved(locKey)?.mode === 'result');
  const [resultOrder, setResultOrder]     = useState(() => loadSaved(locKey)?.order ?? null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const lastScanRef = useRef({ value: '', at: 0 });

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

  useEffect(() => {
    try {
      if (resultOpen && resultOrder) sessionStorage.setItem(SAVE_KEY, JSON.stringify({ key: locKey, mode: 'result', order: resultOrder }));
      else if (scannerOpen) sessionStorage.setItem(SAVE_KEY, JSON.stringify({ key: locKey, mode: 'scanner' }));
      else sessionStorage.removeItem(SAVE_KEY);
    } catch { /* storage unavailable */ }
  }, [scannerOpen, resultOpen, resultOrder, locKey]);

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
      try { navigator.vibrate?.(80); } catch { /* not supported */ }
      showToast(`✓ Order found!`, 'success');
    } else {
      showToast('❌ Order not found.', 'error');
    }
  };

  const handleScan = (detectedCodes) => {
    const raw = detectedCodes?.[0]?.rawValue;
    if (!raw) return;
    // the camera re-reads the same QR many times a second — ignore repeats for 2.5s
    // so the beep and the "not found" toast don't spam
    const now = Date.now();
    if (raw === lastScanRef.current.value && now - lastScanRef.current.at < 2500) return;
    lastScanRef.current = { value: raw, at: now };
    processOrderSearch(raw);
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualOrderId) processOrderSearch(manualOrderId);
  };

  const order       = resultOrder ? (orders.find(o => o.id === resultOrder.id) || resultOrder) : null;
  const grandTotal  = order ? (order.grandTotal || order.grand_total || 0) : 0;
  const items       = order ? (order.items || order.order_items || []) : [];
  const orderNumber = order ? (order.order_number || order.id) : null;
  const balance     = order ? (order.balance ?? (grandTotal - (order.amountPaid || order.amount_paid || 0))) : 0;
  const isDeposit   = order ? ((order.paymentType || order.payment_type) === 'deposit' && Number(balance) > 0) : false;
  const canComplete = order ? (order.status === 'Confirmed' || order.status === 'Ready') : false;

  return (
    <>
      <Button variant="primary" className="w-full sm:w-auto bg-brand-900 text-white font-bold shadow-md flex items-center justify-center gap-2"
        onClick={() => { setScannerOpen(true); setManualOrderId(''); lastScanRef.current = { value: '', at: 0 }; }}>
        <QrCode size={18} /> Scan Receipt QR
      </Button>

      {/* Camera / manual entry */}
      <Modal isOpen={scannerOpen} onClose={() => setScannerOpen(false)} size="md" title="Find Customer Order" subtitle="I-scan ang QR Code o i-type ang Order ID.">
        <div className="flex flex-col gap-6 p-2">
          <div className="w-full bg-black rounded-xl overflow-hidden shadow-inner flex items-center justify-center relative min-h-[300px]">
            {scannerOpen && (
              <Scanner onScan={handleScan} onError={err => showToast(`Camera error: ${err?.message || 'Unable to access camera'}`, 'error')}
                formats={['qr_code']} components={{ audio: true, torch: true }}
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
              <Input value={manualOrderId} onChange={e => setManualOrderId(e.target.value)} placeholder="e.g. ORD-0001" className="w-full text-base sm:text-sm" />
            </div>
            <Button type="submit" variant="primary" className="bg-brand-900 text-white shrink-0 px-6 min-h-[44px]" aria-label="Find order"><Search size={18} /></Button>
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
          <div className="space-y-4">
            {/* Who + what */}
            <div>
              <p className="text-xs font-semibold text-brand-600">#{orderNumber}</p>
              <p className="text-lg font-bold text-brand-950 leading-tight">{(order.customer || order.customers)?.name || 'Walk-in'}</p>
              <p className="mt-3 mb-1.5 text-xs font-semibold text-brand-600">Items ({items.length})</p>
              {/* every item is listed; scrolls inside the box when the order is long */}
              <ul className="max-h-[34dvh] overflow-y-auto overscroll-contain divide-y divide-slate-100 rounded-xl border border-slate-200 px-3">
                {items.map((item, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-sm text-brand-950">
                    <span className="min-w-0 break-words">{item.name || item.product_name}</span>
                    <span className="shrink-0 font-bold text-brand-900 tabular-nums">×{item.qty || item.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Total + payment — one compact row */}
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-xl font-bold text-brand-950 leading-tight tabular-nums">{fmt(grandTotal)}</p>
              </div>
              {order.status !== 'Cancelled' && (
                isDeposit ? (
                  <span className="shrink-0 rounded-full bg-amber-50 text-amber-800 text-[13px] font-bold px-3 py-1.5 text-right leading-tight">
                    Balance due<br />{fmt(balance)}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-green-50 text-green-800 text-[13px] font-bold px-3 py-1.5">✓ Fully paid</span>
                )
              )}
            </div>

            {order.status === 'Completed' && (
              <p className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-center text-sm font-bold text-green-900">✓ This order is already completed.</p>
            )}
            {order.status === 'Cancelled' && (
              <p className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-center text-sm font-bold text-red-900">✕ This order has been cancelled.</p>
            )}

            {/* Two actions, side by side */}
            <div className="flex gap-2.5">
              <button type="button" aria-label="View full details"
                className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#DED4CC] bg-white text-[15px] font-semibold text-brand-900 hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 focus-visible:ring-offset-2"
                onClick={() => { setResultOpen(false); onViewOrder(order); }}>
                <ReceiptText size={18} /> Details
              </button>
              {canComplete && (
                <button type="button" aria-label="Mark as completed"
                  className="flex-[1.3] min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-green-700 text-white text-[15px] font-semibold shadow-sm hover:bg-green-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
                  onClick={() => setConfirmComplete(true)}>
                  <CheckCircle2 size={18} /> Complete
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal
        isOpen={confirmComplete && Boolean(order)}
        onClose={() => setConfirmComplete(false)}
        onConfirm={async () => {
          try {
            await onStatusChange(order.id, 'Completed');
          } catch {
            // Parent handles the error toast.
          }
        }}
        title="Mark as Completed"
        message={`Complete order #${orderNumber}?`}
        confirmLabel="Confirm Complete"
        variant="primary"
      />
    </>
  );
}