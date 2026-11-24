import { useState, useEffect, useRef } from 'react';
import { QrCode, Search, CheckCircle2, ReceiptText, Copy, ChevronRight, Info } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Badge, Button, Modal, Input, ConfirmModal, useToast } from '../ui';
import { formatCount } from '../../utils/numberGuards';

function fmt(n) {
  return '₱' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function statusVariant(s) {
  return { 'Pending Verification': 'pending', Confirmed: 'confirmed', Ready: 'ready', Completed: 'completed', Cancelled: 'cancelled' }[s] || 'default';
}

// Same math used for every order card, so the list and the summary never disagree.
function orderMeta(o) {
  const total   = Number(o.grandTotal || o.grand_total || 0);
  const balance = Number(o.balance ?? (total - (o.amountPaid || o.amount_paid || 0)));
  return {
    items: o.items || o.order_items || [],
    total,
    balance,
    deposit: (o.paymentType || o.payment_type) === 'deposit' && balance > 0,
    canComplete: o.status === 'Ready',
    needsVerification: o.status === 'Pending Verification',
    customer: (o.customer || o.customers)?.name || 'Walk-in',
  };
}
function typeChip(t) {
  const k = String(t || '').toLowerCase().replace(/[_\s-]/g, '');
  if (k === 'preorder') return 'bg-violet-50 text-violet-700 border-violet-200';
  if (k === 'buynow')   return 'bg-sky-50 text-sky-700 border-sky-200';
  return 'bg-slate-50 text-slate-700 border-slate-200';
}
function typeLabel(t) {
  const s = String(t || 'Order').replace(/[_-]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
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
    let foundOrder;
    try {
      let payloadStr = String(scannedId);
      const firstBrace = payloadStr.indexOf('{');
      if (firstBrace >= 0) payloadStr = payloadStr.slice(firstBrace);
      const payload = JSON.parse(payloadStr);
      foundOrder = orders.find(o =>
        o.id === payload.orderId
        || o.order_number === payload.orderId
        || o.transaction_group_id === payload.orderId
        || o.transaction_group_id === payload.transactionId
      );
    } catch {
      const cleanId = String(scannedId).replace('#', '').trim().toUpperCase();
      foundOrder = orders.find(o =>
        String(o.id).replace('#', '').toUpperCase() === cleanId ||
        String(o.order_number || '').replace('#', '').toUpperCase() === cleanId ||
        String(o.transaction_group_id || '').toUpperCase() === cleanId
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
  const canComplete = order ? (order.status === 'Ready') : false;
  const transactionGroupId = order?.transaction_group_id || null;
  const transactionOrders = transactionGroupId
    ? orders.filter(o => o.transaction_group_id === transactionGroupId)
    : [order].filter(Boolean);
  const mixedTransactionOrders = transactionOrders.length > 1 ? transactionOrders : [];
  const mixedMeta          = mixedTransactionOrders.map(orderMeta);
  const mixedGrandTotal    = mixedMeta.reduce((s, m) => s + m.total, 0);
  const mixedBalanceDue    = mixedMeta.reduce((s, m) => s + (m.deposit ? m.balance : 0), 0);
  const mixedCustomers     = [...new Set(mixedMeta.map(m => m.customer))];
  const sharedCustomer     = mixedCustomers.length === 1 ? mixedCustomers[0] : null;
  const mixedPaid          = Math.max(0, mixedGrandTotal - mixedBalanceDue);
  const mixedStatuses      = [...new Set(mixedTransactionOrders.map(o => o.status))];
  const sharedStatus       = mixedStatuses.length === 1 ? mixedStatuses[0] : null;
  const anyNeedsVerify     = mixedMeta.some(m => m.needsVerification);
  const copyTransactionId  = async () => {
    try { await navigator.clipboard.writeText(String(transactionGroupId)); showToast('Transaction ID copied', 'success'); }
    catch { showToast('Unable to copy', 'error'); }
  };

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
            <div className="flex items-center gap-2.5">
              <span className="font-bold text-brand-950 text-lg">Scan Result</span>
              {/* One status for the whole group when they agree; otherwise each row shows its own. */}
              {(mixedTransactionOrders.length === 0 || sharedStatus) && (
                <Badge variant={statusVariant(mixedTransactionOrders.length ? sharedStatus : order.status)} className="px-2.5 py-0.5 text-xs font-semibold shadow-none">
                  {mixedTransactionOrders.length ? sharedStatus : order.status}
                </Badge>
              )}
            </div>
          }
        >
          <div className="flex flex-col gap-3">
            {mixedTransactionOrders.length > 0 ? (
              <>
                {/* Who: tinted band with avatar */}
                <div className="flex items-center gap-3 rounded-xl bg-brand-50 border border-brand-200 px-4 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-900 text-base font-bold text-white" aria-hidden="true">
                    {(sharedCustomer || 'M').charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-brand-950 leading-tight">{sharedCustomer || 'Multiple customers'}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-brand-600">
                      <span>{mixedTransactionOrders.length} orders</span>
                      <span aria-hidden="true">·</span>
                      <button type="button" onClick={copyTransactionId} aria-label="Copy transaction ID"
                        className="inline-flex items-center gap-1 rounded tabular-nums hover:text-brand-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-900">
                        Txn {String(transactionGroupId).slice(0, 8)} <Copy size={12} aria-hidden="true" />
                      </button>
                    </p>
                  </div>
                </div>

                {/* Money: Total / Paid / Balance — each its own colour */}
                <div className={`grid gap-2 ${mixedBalanceDue > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-[13px] text-slate-600">Total</p>
                    <p className="text-lg font-bold text-brand-950 leading-tight tabular-nums">{fmt(mixedGrandTotal)}</p>
                  </div>
                  <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
                    <p className="text-[13px] text-green-800">Paid</p>
                    <p className="text-lg font-bold text-green-800 leading-tight tabular-nums">{fmt(mixedPaid)}</p>
                  </div>
                  {mixedBalanceDue > 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <p className="text-[13px] text-amber-800">Balance due</p>
                      <p className="text-lg font-bold text-amber-800 leading-tight tabular-nums">{fmt(mixedBalanceDue)}</p>
                    </div>
                  )}
                </div>

                {/* Orders: payment state is shown by the green/amber text on the right */}
                <ul className="max-h-[38dvh] overflow-y-auto overscroll-contain space-y-2">
                  {mixedTransactionOrders
                    .slice()
                    .sort((a, b) => String(a.order_type).localeCompare(String(b.order_type)))
                    .map((mixedOrder) => {
                      const m = orderMeta(mixedOrder);
                      const num = mixedOrder.order_number || mixedOrder.id;
                      const cancelled = mixedOrder.status === 'Cancelled';
                      return (
                        <li key={mixedOrder.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                          <button type="button" aria-label={`View details for order ${num}`}
                            onClick={() => onViewOrder(mixedOrder)}
                            className="flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-900">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                                <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${typeChip(mixedOrder.order_type)}`}>{typeLabel(mixedOrder.order_type)}</span>
                                <span className="text-[13px] font-semibold text-brand-700">#{num}</span>
                                {!sharedStatus && <Badge variant={statusVariant(mixedOrder.status)} className="px-2 py-0.5 text-xs font-semibold shadow-none">{mixedOrder.status}</Badge>}
                              </div>
                              {m.items.map((item, i) => (
                                <p key={i} className="text-[15px] font-medium text-brand-950 break-words">
                                  {item.name || item.product_name}
                                  <span className="ml-1.5 font-normal text-brand-600 tabular-nums">×{formatCount(item.qty || item.quantity)}</span>
                                </p>
                              ))}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-[15px] font-bold text-brand-950 tabular-nums">{fmt(m.total)}</p>
                              {!cancelled && (
                                <p className={`mt-0.5 text-[13px] font-semibold tabular-nums ${m.deposit ? 'text-amber-800' : 'text-green-700'}`}>
                                  {m.deposit ? `Balance ${fmt(m.balance)}` : '✓ Paid'}
                                </p>
                              )}
                            </div>
                            <ChevronRight size={18} className="mt-0.5 shrink-0 text-brand-400" aria-hidden="true" />
                          </button>
                          {m.canComplete && (
                            <div className="flex justify-end border-t border-slate-100 bg-slate-50 px-3.5 py-2">
                              <button type="button" aria-label={`Mark order ${num} as completed`}
                                className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
                                onClick={() => { setResultOrder(mixedOrder); setConfirmComplete(true); }}>
                                <CheckCircle2 size={16} aria-hidden="true" /> Complete
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                </ul>

                {anyNeedsVerify && (
                  <p className="flex items-start gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-3.5 py-2.5 text-[13px] text-yellow-800">
                    <Info size={16} className="mt-px shrink-0" aria-hidden="true" />
                    Verify payment in Details before completing an order.
                  </p>
                )}
              </>
            ) : (
            <>
            {/* Who: same band as the mixed view */}
            {(() => {
              const customerName = (order.customer || order.customers)?.name || 'Walk-in';
              return (
                <div className="flex items-center gap-3 rounded-xl bg-brand-50 border border-brand-200 px-4 py-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-900 text-base font-bold text-white" aria-hidden="true">
                    {customerName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-brand-950 leading-tight">{customerName}</p>
                    <p className="mt-0.5 text-[13px] text-brand-600">#{orderNumber}</p>
                  </div>
                </div>
              );
            })()}

            {/* Money: Total / Paid / Balance */}
            {(() => {
              const cancelled = order.status === 'Cancelled';
              const paid = Math.max(0, Number(grandTotal) - (isDeposit ? Number(balance) : 0));
              const cols = cancelled ? 'grid-cols-1' : isDeposit ? 'grid-cols-3' : 'grid-cols-2';
              return (
                <div className={`grid gap-2 ${cols}`}>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-[13px] text-slate-600">Total</p>
                    <p className="text-lg font-bold text-brand-950 leading-tight tabular-nums">{fmt(grandTotal)}</p>
                  </div>
                  {!cancelled && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2.5">
                      <p className="text-[13px] text-green-800">Paid</p>
                      <p className="text-lg font-bold text-green-800 leading-tight tabular-nums">{fmt(paid)}</p>
                    </div>
                  )}
                  {!cancelled && isDeposit && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
                      <p className="text-[13px] text-amber-800">Balance due</p>
                      <p className="text-lg font-bold text-amber-800 leading-tight tabular-nums">{fmt(balance)}</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Items: same card as one order in the mixed view; every item listed, scrolls if long */}
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-3.5 py-2.5">
                {order.order_type && (
                  <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${typeChip(order.order_type)}`}>{typeLabel(order.order_type)}</span>
                )}
                <span className="text-[13px] text-brand-600">{items.length} {items.length === 1 ? 'item' : 'items'}</span>
              </div>
              <ul className="max-h-[34dvh] overflow-y-auto overscroll-contain divide-y divide-slate-100 px-3.5">
                {items.map((item, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-2.5 text-[15px] font-medium text-brand-950">
                    <span className="min-w-0 break-words">{item.name || item.product_name}</span>
                    <span className="shrink-0 font-normal text-brand-600 tabular-nums">×{formatCount(item.qty || item.quantity)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {order.status === 'Pending Verification' && (
              <p className="flex items-start gap-2 rounded-xl border border-yellow-200 bg-yellow-50 px-3.5 py-2.5 text-[13px] text-yellow-800">
                <Info size={16} className="mt-px shrink-0" aria-hidden="true" />
                Verify payment in Details before completing this order.
              </p>
            )}
            {order.status === 'Completed' && (
              <p className="rounded-xl border border-green-200 bg-green-50 px-3.5 py-2.5 text-[13px] font-semibold text-green-800">✓ This order is already completed.</p>
            )}
            {order.status === 'Cancelled' && (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold text-red-800">✕ This order has been cancelled.</p>
            )}

            <div className="flex gap-2.5">
              <button type="button" aria-label="View full details"
                className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl border border-[#DED4CC] bg-white text-[15px] font-semibold text-brand-900 hover:bg-brand-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-900 focus-visible:ring-offset-2"
                onClick={() => { setResultOpen(false); onViewOrder(order); }}>
                <ReceiptText size={18} aria-hidden="true" /> Details
              </button>
              {canComplete && (
                <button type="button" aria-label="Mark as completed"
                  className="flex-[1.3] min-h-[48px] inline-flex items-center justify-center gap-2 rounded-xl bg-green-700 text-white text-[15px] font-semibold shadow-sm hover:bg-green-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2"
                  onClick={() => setConfirmComplete(true)}>
                  <CheckCircle2 size={18} aria-hidden="true" /> Complete
                </button>
              )}
            </div>
            </>
            )}
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