import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import html2canvas from 'html2canvas';
import Header from '../onlineOrdering/Header';
import Footer from '../onlineOrdering/Footer';

const DUMMY_CART = [
  { name: 'Package B', qty: 1, price: 550 },
  { name: 'Special Ensaymada', qty: 2, price: 70 },
];

export default function Confirm({ orderId }) {
  const navigate = useNavigate();
  const location = useLocation();
  const mobileReceiptRef = useRef(null);

  const storedData = JSON.parse(sessionStorage.getItem('tempOrderData') || '{}');
  const state = location.state || storedData || {};

  // GAGAMITIN NA NATIN ANG TOTOONG ID GALING SA DATABASE
  const id = state.savedOrderNumber || orderId || `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
  const cart = state.cart && state.cart.length ? state.cart : DUMMY_CART;
  
  const totalAmount =
    state.totalAmount ??
    cart.reduce((sum, item) => sum + (item.price ?? 0) * (item.qty ?? 1), 0);
    
  const paymentType = state.paymentType || 'full';
  const halfAmount = totalAmount / 2;
  const amountPaid = paymentType === 'half' ? halfAmount : totalAmount;
  const balance = paymentType === 'half' ? halfAmount : 0;

  const form = state.form || {};

  const orderDate = state.orderDate
    ? new Date(state.orderDate)
    : new Date();
  const formattedDate = orderDate.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
  const formattedTime = orderDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const qrPayload = JSON.stringify({ orderId: id, token: btoa(id + '_secret_key') });

  const formatPeso = (n) =>
    `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSaveAsImage = async () => {
    if (!mobileReceiptRef.current) return;
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      const node = mobileReceiptRef.current;
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
      link.download = `Receipt-${id}.png`;
      link.click();
    } catch (err) {
      console.error('Failed to save receipt', err);
    }
  };

  return (
    <div className="bg-[#FCFAF9] min-h-screen flex flex-col relative">
      <Header page="confirm" />

      <div className="flex-1 w-full max-w-[1440px] mx-auto flex flex-col items-center justify-center px-4 sm:px-8 py-4 lg:pl-[140px] xl:pl-[160px]">
        
        <div className="w-full flex flex-col items-center justify-center h-full lg:h-[calc(100vh-112px)] min-h-0">

          <div className="text-center mb-3 sm:mb-4 shrink-0 w-full">
            <div className="w-10 h-10 rounded-full bg-[#DCFCE7] text-[#16A34A] flex items-center justify-center mx-auto mb-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h2 className="text-lg sm:text-xl font-serif text-[#3B1F0A] mb-1">Order Placed!</h2>
            <p className="text-[11px] sm:text-xs text-[#8A7264] max-w-[420px] mx-auto truncate px-2">
              Please save your digital receipt. Present the QR code at the counter to claim your order.
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-[#EAE4E0] shadow-sm overflow-hidden flex flex-col w-full max-w-[340px] md:flex-row md:max-w-[650px] shrink-0">

            <div className="flex-1 p-4 sm:p-5 flex flex-col min-h-0">
              <div className="text-center mb-2">
                <div className="font-serif text-lg text-[#3B1F0A]">Aileen Cake Max</div>
                <div className="text-[9px] text-[#B7A99F] tracking-[0.25em] uppercase font-semibold mt-0.5">
                  Bake Shop
                </div>
              </div>

              <div className="border-b border-dashed border-[#DED4CC] my-2 sm:my-3 shrink-0" />

              <div className="grid grid-cols-2 gap-3 mb-2 sm:mb-3 shrink-0">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">Order No.</p>
                  <p className="text-[11px] sm:text-xs font-semibold text-[#3B1F0A]">{id}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">Date</p>
                  <p className="text-[11px] sm:text-xs font-semibold text-[#3B1F0A]">
                    {formattedDate}, {formattedTime}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-1 overflow-y-auto max-h-[120px] lg:max-h-[16vh] scrollbar-thin pr-1">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-start text-[11px] sm:text-xs text-[#5A453C]">
                    <span className="pr-2 leading-snug">
                      {item.qty}x {item.name}
                    </span>
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
                  <span className="text-[11px] uppercase tracking-[0.15em] text-[#8A7264] font-bold">
                    Balance
                  </span>
                  <span className="font-serif text-base sm:text-lg text-[#3B1F0A]">
                    {formatPeso(balance)}
                  </span>
                </div>
              </div>
            </div>

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

          <div
            style={{ position: 'fixed', top: 0, left: '-10000px' }}
            aria-hidden="true"
          >
            <div
              ref={mobileReceiptRef}
              className="bg-white rounded-3xl border border-[#EAE4E0] flex flex-col w-[340px]"
            >
              <div className="p-6 flex flex-col">
                <div className="text-center mb-2">
                  <div className="font-serif text-lg text-[#3B1F0A]">Aileen Cake Max</div>
                  <div className="text-[9px] text-[#B7A99F] tracking-[0.25em] uppercase font-semibold mt-0.5">
                    Bake Shop
                  </div>
                </div>

                <div className="border-b border-dashed border-[#DED4CC] my-3" />

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <p className="text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">Order No.</p>
                    <p className="text-xs font-semibold text-[#3B1F0A]" style={{ lineHeight: 1.6 }}>{id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">Date</p>
                    <p className="text-xs font-semibold text-[#3B1F0A]" style={{ lineHeight: 1.6 }}>
                      {formattedDate}, {formattedTime}
                    </p>
                  </div>
                </div>

                <div>
                  {cart.map((item, idx) => (
                    <table key={idx} width="100%" style={{ borderCollapse: 'collapse', marginBottom: 8 }}>
                      <tbody>
                        <tr>
                          <td
                            className="text-xs text-[#5A453C]"
                            style={{ lineHeight: 1.6, padding: 0, textAlign: 'left' }}
                          >
                            {item.qty}x {item.name}
                          </td>
                          <td
                            className="text-xs font-medium text-[#3B1F0A]"
                            style={{ lineHeight: 1.6, padding: 0, textAlign: 'right', whiteSpace: 'nowrap' }}
                          >
                            {formatPeso((item.price ?? 0) * (item.qty ?? 1))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  ))}
                </div>

                <div className="bg-[#F5EFEB] rounded-xl p-4 mt-3 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-[11px] text-[#8A7264]" style={{ lineHeight: 1.6 }}>
                    <span className="uppercase tracking-[0.1em]">Grand Total</span>
                    <span>{formatPeso(totalAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-[#3B1F0A] font-semibold" style={{ lineHeight: 1.6 }}>
                    <span className="uppercase tracking-[0.1em]">Paid ({paymentType === 'half' ? '50% Deposit' : 'Full'})</span>
                    <span className="text-[#15803D]">{formatPeso(amountPaid)}</span>
                  </div>
                  <div className="w-full h-px bg-[#DED4CC] my-1"></div>
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] uppercase tracking-[0.15em] text-[#8A7264] font-bold" style={{ lineHeight: 1.6 }}>
                      Balance
                    </span>
                    <span className="font-serif text-lg text-[#3B1F0A]" style={{ lineHeight: 1.6 }}>
                      {formatPeso(balance)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="border-t border-dashed border-[#DED4CC] mx-6" />

              <div className="p-6 flex flex-col items-center">
                <div className="p-2.5 bg-white border border-[#EAE4E0] rounded-xl shadow-sm">
                  <QRCodeSVG value={qrPayload} size={150} fgColor="#3B1F0A" />
                </div>
                <p className="text-[9px] tracking-widest text-[#B7A99F] mt-3 font-bold uppercase" style={{ lineHeight: 1.6 }}>
                  Scan to Verify
                </p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-[340px] flex flex-col mt-5 sm:mt-6 shrink-0">
            <button
              onClick={() => {
                navigate('/onlineOrdering/home');
              }}
              className="w-full text-sm font-bold text-[#8A7264] hover:text-[#4A3B36] text-center transition-colors"
            >
              &larr; Back to Home
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}