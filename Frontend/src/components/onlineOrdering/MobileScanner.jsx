import { useState, useRef } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import jsQR from 'jsqr';
import { X, QrCode, CheckCircle2, ImageUp } from 'lucide-react';

export default function MobileScanner() {
  const [scanResultOpen, setScanResultOpen] = useState(false);
  const [orderData, setOrderData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [isDecodingImage, setIsDecodingImage] = useState(false);
  const lastScanTime = useRef(0);
  const fileInputRef = useRef(null);

  const fetchOrderDetails = async (orderNumber) => {
    setIsLoading(true);
    try {
      // Naka-align na ngayon sa /api/Qr/... batay sa App.js at Qr.routes.js mo
      const response = await fetch(`${import.meta.env.VITE_API_URL}/Qr/scan/${orderNumber}`);
      const data = await response.json();
      if (data.success) {
        setOrderData(data.order);
        setScanResultOpen(true);
      } else {
        alert(data.message);
      }
    } catch (err) {
      console.error(err);
      alert('Network error.');
    } finally {
      setIsLoading(false);
    }
  };

  const processScannedValue = (scannedData) => {
    let finalOrderNumber = scannedData;

    // Foolproof check kung JSON format (luma) o Plain String (bago) ang QR
    try {
      const parsedData = JSON.parse(scannedData);
      if (parsedData && parsedData.orderId) {
        finalOrderNumber = parsedData.orderId;
      }
    } catch (e) {
      // Plain string na order number na ito (hal. "ORD-0086")
    }

    fetchOrderDetails(finalOrderNumber.trim());
  };

  const handleScan = (detectedCodes) => {
    if (!detectedCodes?.length) return;
    const now = Date.now();
    if (now - lastScanTime.current < 3000) return; // Iwas double scan
    lastScanTime.current = now;

    processScannedValue(detectedCodes[0].rawValue);
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsDecodingImage(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, image.width, image.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        setIsDecodingImage(false);

        if (code && code.data) {
          processScannedValue(code.data);
        } else {
          alert('No QR code found in that image. Please try a clearer photo.');
        }
      };
      image.onerror = () => {
        setIsDecodingImage(false);
        alert('Could not read that image file.');
      };
      image.src = event.target.result;
    };
    reader.onerror = () => {
      setIsDecodingImage(false);
      alert('Could not read that image file.');
    };
    reader.readAsDataURL(file);

    // Reset input so selecting the same file again still fires onChange
    e.target.value = '';
  };

  const updateStatus = async (newStatus) => {
    if (!orderData) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/Qr/update-status/${orderData.order_number}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await response.json();
      if (data.success) {
        setOrderData({ ...orderData, status: newStatus });
      }
    } catch (err) {
      alert('Failed to update status');
    }
  };

  const formatPeso = (n) =>
    `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const statusStyles = {
    Completed: 'bg-[#DCFCE7] text-[#15803D]',
    Ready: 'bg-[#FEF3C7] text-[#92400E]',
    Confirmed: 'bg-[#DBEAFE] text-[#1E40AF]',
  };
  const badgeClass = statusStyles[orderData?.status] || 'bg-[#F5EFEB] text-[#5A453C]';

  const getPaidLabel = () => {
    if (!orderData) return 'Paid';
    const grandTotal = Number(orderData.grand_total || 0);
    const amountPaid = Number(orderData.amount_paid || 0);
    const isFull =
      orderData.payment_type === 'full' ||
      (grandTotal > 0 && amountPaid >= grandTotal);
    if (isFull) return 'Paid (Full)';
    const percent = grandTotal > 0 ? Math.round((amountPaid / grandTotal) * 100) : 0;
    return `Paid (${percent}% Deposit)`;
  };
  const paidLabel = getPaidLabel();

  return (
    <div className="bg-[#FCFAF9] min-h-screen flex flex-col">
      {/* --- HEADER --- */}
      <div className="bg-white border-b border-[#EAE4E0] px-5 py-4 flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-full bg-[#F5EFEB] flex items-center justify-center text-[#3B1F0A]">
          <QrCode size={16} strokeWidth={2.2} />
        </div>
        <div>
          <h1 className="font-serif text-[17px] text-[#3B1F0A] leading-tight">Admin Scanner</h1>
          <p className="text-[9px] tracking-[0.25em] uppercase font-semibold text-[#B7A99F] mt-0.5">
            Aileen Cake Max
          </p>
        </div>
      </div>

      {/* --- SCANNER --- */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="bg-[#3B1F0A] rounded-[2rem] overflow-hidden shadow-sm border-[6px] border-white relative aspect-square">
            {cameraAvailable ? (
              <Scanner
                onScan={handleScan}
                onError={() => setCameraAvailable(false)}
                formats={['qr_code']}
                components={{ audio: false, torch: true }}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#F5EFEB] text-center">
                <p className="text-[#3B1F0A] font-semibold text-sm">Camera Access Required</p>
                <p className="text-[11px] text-[#8A7264] mt-1">
                  Enable camera permissions to scan order QR codes.
                </p>
              </div>
            )}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-dashed border-white/50 rounded-2xl"></div>
            </div>
          </div>
          {isLoading && (
            <p className="text-center mt-4 text-[11px] uppercase tracking-[0.15em] font-semibold text-[#8A7264]">
              Fetching Order Details…
            </p>
          )}

          {/* --- UPLOAD IMAGE FALLBACK --- */}
          <div className="flex items-center gap-3 mt-5">
            <div className="flex-1 h-px bg-[#EAE4E0]" />
            <span className="text-[9px] uppercase tracking-[0.15em] font-semibold text-[#B7A99F]">or</span>
            <div className="flex-1 h-px bg-[#EAE4E0]" />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            onClick={handleUploadClick}
            disabled={isDecodingImage || isLoading}
            className="w-full mt-4 flex items-center justify-center gap-2 border border-[#DED4CC] text-[#3B1F0A] text-xs font-semibold py-3 rounded-full hover:bg-[#F5EFEB] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ImageUp size={15} />
            {isDecodingImage ? 'Reading QR from Image…' : 'Upload QR Image'}
          </button>
        </div>
      </div>

      {/* --- ORDER SUMMARY MODAL --- */}
      {scanResultOpen && orderData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white w-full max-w-[400px] rounded-3xl shadow-xl flex flex-col overflow-hidden border border-[#EAE4E0]">

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-dashed border-[#DED4CC]">
              <div className="flex items-center gap-3">
                <h2 className="font-serif text-[18px] text-[#3B1F0A]">Scan Result</h2>
                <span
                  className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-[0.15em] ${badgeClass}`}
                >
                  {orderData.status}
                </span>
              </div>
              <button
                onClick={() => setScanResultOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl border border-[#EAE4E0] text-[#8A7264] hover:bg-[#F5EFEB] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">

              {/* Order Details */}
              <div className="bg-[#FCFAF9] border border-[#EAE4E0] rounded-2xl p-5">
                <p className="text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] font-semibold mb-1">
                  Order No.
                </p>
                <p className="text-xs font-semibold text-[#3B1F0A] mb-3">#{orderData.order_number}</p>

                <p className="text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] font-semibold mb-1">
                  Customer
                </p>
                <h3 className="font-serif text-[19px] text-[#3B1F0A] mb-4">
                  {orderData.customers ? orderData.customers.name : 'Walk-in'}
                </h3>

                <div className="border-t border-dashed border-[#DED4CC] pt-3 flex flex-col gap-2 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin">
                  {orderData.order_items?.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-start text-[12px] text-[#5A453C]"
                    >
                      <span className="pr-2 leading-snug font-medium">{item.product_name}</span>
                      <span className="font-semibold text-[#3B1F0A] shrink-0">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div className="bg-[#F5EFEB] rounded-2xl p-4 flex flex-col gap-2">
                <div className="flex justify-between items-center text-[11px] text-[#8A7264]">
                  <span className="uppercase tracking-[0.1em] font-semibold">Grand Total</span>
                  <span className="text-sm font-semibold text-[#3B1F0A]">{formatPeso(orderData.grand_total)}</span>
                </div>

                <div className="flex justify-between items-center text-[11px] text-[#8A7264]">
                  <span className="uppercase tracking-[0.1em] font-semibold">{paidLabel}</span>
                  <span className="text-sm font-semibold text-[#15803D]">{formatPeso(orderData.amount_paid)}</span>
                </div>

                <div className="w-full h-px bg-[#DED4CC] my-0.5" />

                <div className="flex justify-between items-center">
                  <span className="text-[11px] uppercase tracking-[0.15em] text-[#8A7264] font-bold">
                    Balance
                  </span>
                  <span className="font-serif text-lg text-[#3B1F0A]">
                    {formatPeso(orderData.balance ?? (orderData.grand_total - (orderData.amount_paid || 0)))}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2 mt-1">
                {orderData.status !== 'Completed' && (
                  <button
                    onClick={() => updateStatus('Completed')}
                    className="w-full bg-[#16A34A] text-white text-sm font-semibold py-3.5 rounded-full shadow-sm hover:bg-[#15803D] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    Mark as Completed
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  ); 
}