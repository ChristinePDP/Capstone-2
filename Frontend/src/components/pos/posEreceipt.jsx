import { useRef, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';

/**
 * PosEReceipt
 * -----------
 * Shown as a modal on the POS screen right after a Pre-Order checkout
 * succeeds. No redirect QR, no separate customer-facing page — the customer
 * simply takes a photo of this screen with their own phone.
 *
 * Layout intentionally mirrors the online-ordering Confirm.jsx receipt card:
 * info on the left, QR on the right on md+ screens, stacked on mobile.
 *
 * The QR code on this receipt is the "confirm at pickup" QR: when the
 * customer comes back on their pickup date and shows this photo, the owner
 * scans it (using whatever QR scanner tool/page you set up) to confirm and
 * complete the order.
 *
 * Props:
 *  - orderId: number/string — the real DB order id (used inside the QR payload)
 *  - orderNumber: string — human-readable order ref shown on the receipt
 *  - cart: [{ name, qty, price }]
 *  - totalAmount: number (grand total)
 *  - paymentType: 'full' | 'half'
 *  - pickupDate: string (e.g. "August 20, 2026") — optional
 *  - pickupTime: string (e.g. "8:00 AM - 10:00 AM") — optional
 *  - confirmToken: string — server-generated token to verify at confirm-pickup
 *      time (see pos.service.js `makeReceiptToken`)
 *  - businessName / businessTag: strings
 *  - onClose: () => void
 */
export default function PosEReceipt({
  orderId,
  orderNumber,
  cart = [],
  totalAmount = 0,
  paymentType = 'full',
  pickupDate,
  pickupTime,
  confirmToken,
  businessName = 'Aileen Cake Max',
  businessTag = 'Bake Shop',
  onClose,
}) {
  const receiptRef = useRef(null);
  const now = new Date();

  // This modal is only ever mounted while it's open (parent renders it
  // conditionally via `{ereceiptData && <PosEReceipt .../>}`), so lock the
  // background page's scroll on mount and restore it on unmount/close.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const halfAmount = totalAmount / 2;
  const amountPaid = paymentType === 'half' ? halfAmount : totalAmount;
  const balance = paymentType === 'half' ? halfAmount : 0;

  const formattedDate = now.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
  const formattedTime = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  // What the owner's scanner reads at pickup to confirm this order.
  const qrPayload = JSON.stringify({ orderId, token: confirmToken });

  const formatPeso = (n) =>
    `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSaveAsImage = async () => {
    if (!receiptRef.current) return;
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const node = receiptRef.current;
      const canvas = await html2canvas(node, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: node.scrollWidth,
        windowHeight: node.scrollHeight,
      });
      const image = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = image;
      link.download = `Receipt-${orderNumber || orderId}.png`;
      link.click();
    } catch (err) {
      console.error('Failed to save receipt', err);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6 overflow-y-auto">
      <div className="relative w-full max-w-[340px] md:max-w-[650px] flex flex-col items-center">

        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-2 -right-2 md:top-0 md:right-0 z-10 w-9 h-9 rounded-full bg-white shadow-md hover:bg-[#F5EFEB] text-[#3B1F0A] flex items-center justify-center transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* --- ang mismong e-receipt, ito ang kukunan ng litrato ng customer --- */}
        <div
          ref={receiptRef}
          className="bg-white rounded-3xl border border-[#EAE4E0] shadow-2xl overflow-hidden flex flex-col w-full md:flex-row"
        >

          {/* Kaliwa: order info + items + totals (kapareho ng Confirm.jsx) */}
          <div className="flex-1 p-4 sm:p-5 flex flex-col min-h-0">
            <div className="text-center mb-2">
              <div className="font-serif text-lg text-[#3B1F0A]">{businessName}</div>
              <div className="text-[9px] text-[#B7A99F] tracking-[0.25em] uppercase font-semibold mt-0.5">
                {businessTag}
              </div>
            </div>

            <div className="border-b border-dashed border-[#DED4CC] my-2 sm:my-3 shrink-0" />

            <div className="grid grid-cols-2 gap-3 mb-2 sm:mb-3 shrink-0">
              <div>
                <p className="text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">Order No.</p>
                <p className="text-[11px] sm:text-xs font-semibold text-[#3B1F0A]">{orderNumber || orderId}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">Date</p>
                <p className="text-[11px] sm:text-xs font-semibold text-[#3B1F0A]">
                  {formattedDate}, {formattedTime}
                </p>
              </div>
            </div>

            {pickupDate && (
              <div className="mb-2 sm:mb-3 shrink-0">
                <p className="text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">Pick-up</p>
                <p className="text-[11px] sm:text-xs font-semibold text-[#3B1F0A]">
                  {pickupDate}{pickupTime ? ` · ${pickupTime}` : ''}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 flex-1 overflow-y-auto max-h-[140px] md:max-h-[16vh] scrollbar-thin pr-1">
              {cart.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start text-[11px] sm:text-xs text-[#5A453C]">
                  <span className="pr-2 leading-snug">{item.qty}x {item.name}</span>
                  <span className="font-medium text-[#3B1F0A] shrink-0">
                    {formatPeso((item.price ?? 0) * (item.qty ?? 1))}
                  </span>
                </div>
              ))}
            </div>

            <div className="bg-[#F5EFEB] rounded-xl p-3 sm:p-4 mt-3 shrink-0 flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-[10px] sm:text-[11px] text-[#8A7264]">
                <span className="uppercase tracking-[0.1em]">Grand Total</span>
                <span>{formatPeso(totalAmount)}</span>
              </div>
              <div className="flex justify-between items-center text-[10px] sm:text-[11px] text-[#3B1F0A] font-semibold">
                <span className="uppercase tracking-[0.1em]">Paid ({paymentType === 'half' ? '50% Deposit' : 'Full'})</span>
                <span className="text-[#15803D]">{formatPeso(amountPaid)}</span>
              </div>
              <div className="w-full h-px bg-[#DED4CC] my-0.5"></div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] uppercase tracking-[0.15em] text-[#8A7264] font-bold">Balance</span>
                <span className="font-serif text-base sm:text-lg text-[#3B1F0A]">{formatPeso(balance)}</span>
              </div>
            </div>
          </div>

          {/* Kanan: QR code (mobile: nasa ilalim; desktop: nasa kanan) */}
          <div className="p-4 sm:p-6 flex flex-col items-center justify-center shrink-0 border-t md:border-t-0 md:border-l border-[#F1EBE6]">
            <div className="p-3 bg-white border border-[#EAE4E0] rounded-xl shadow-sm">
              <QRCodeSVG value={qrPayload} size={130} fgColor="#3B1F0A" />
            </div>
            <p className="text-[9px] tracking-widest text-[#B7A99F] mt-3 font-bold uppercase">
              Scan to Verify
            </p>
            <button
              onClick={handleSaveAsImage}
              className="w-full bg-[#3B1F0A] text-white py-2.5 sm:py-3 px-4 rounded-full text-xs sm:text-sm font-semibold hover:bg-[#2A1608] transition-colors mt-4 flex items-center justify-center gap-1.5"
            >
              <span>↓</span>
              <span>Save Receipt as Image</span>
            </button>
          </div>
        </div>
        {/* --- end ng e-receipt --- */}
      </div>
    </div>
  );
}