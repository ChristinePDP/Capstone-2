// src/components/onlineOrdering/Checkout.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, CreditCard, Receipt } from 'lucide-react';
import Header from '../onlineOrdering/Header';
import Footer from '../onlineOrdering/Footer';

export default function Checkout({ cart, setCart }) {
  const navigate = useNavigate();

  const hasPreOrder = cart.some(item => item.order_type === 'Pre-order');
  const hasPickUpToday = cart.some(item => item.order_type === 'Pick-up Today');
  const forcedPickupType = hasPickUpToday ? 'now' : (hasPreOrder ? 'later' : 'now');
  
  const today = new Date();
  // Adjust for local time mapping directly to YYYY-MM-DD
  const todayString = new Date(today.getTime() - (today.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  const currentTimeString = today.toTimeString().slice(0, 5);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    altPhone: '',
    pickupDate: hasPickUpToday ? todayString : '',
    pickupTime: '',
    instructions: '',
  });

  const [pickupType, setPickupType] = useState(forcedPickupType);
  const [paymentType, setPaymentType] = useState('half');
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false); 

  const totalAmount = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const halfAmount = totalAmount / 2;

  // Recompute against the live system clock at the moment of validation,
  // rather than relying on a value captured at an earlier render.
  const getLiveNow = () => {
    const now = new Date();
    const dateStr = new Date(now.getTime() - (now.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
    const timeStr = now.toTimeString().slice(0, 5);
    return { dateStr, timeStr };
  };

  // Adds `days` to a YYYY-MM-DD string and returns a YYYY-MM-DD string,
  // used to derive the 3-day-minimum Pre-Order window from "today".
  const addDaysToDateString = (dateStr, days) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
  };

  const PRE_ORDER_MIN_LEAD_DAYS = 3;
  const minPreOrderDate = addDaysToDateString(getLiveNow().dateStr, PRE_ORDER_MIN_LEAD_DAYS);

  const handleDateChange = (e) => {
    const selectedDate = e.target.value;

    if (pickupType === 'now') {
      // Pick-up Today is always locked to the live current date.
      setForm({...form, pickupDate: getLiveNow().dateStr});
      return;
    }

    // Pre-order: enforce the 3-day minimum preparation window.
    if (selectedDate < minPreOrderDate) {
        alert(`Pre-orders require at least ${PRE_ORDER_MIN_LEAD_DAYS} days of preparation time. Please select a date on or after ${minPreOrderDate}.`);
        setForm({...form, pickupDate: minPreOrderDate});
    } else {
        setForm({...form, pickupDate: selectedDate});
    }
  };

  const handleTimeChange = (e) => {
    const selectedTime = e.target.value;

    // Pre-order dates are always in the future, so no past-time check is needed.
    if (pickupType === 'later') {
      setForm({...form, pickupTime: selectedTime});
      return;
    }

    const { dateStr: liveToday, timeStr: liveNow } = getLiveNow();
    if (form.pickupDate === liveToday && selectedTime < liveNow) {
        alert("You cannot select a time in the past for today's orders.");
        setForm({...form, pickupTime: liveNow});
    } else {
        setForm({...form, pickupTime: selectedTime});
    }
  };

  const handleProceedToOrder = () => {
    if (!form.name || !form.phone || !form.pickupDate || !form.pickupTime) {
      return alert('Please complete all required fields (*)');
    }
    setShowSummaryModal(true);
  };

  const handlePlaceOrder = async () => {
    setIsProcessing(true);
    let updatedCart = [...cart];

    // 1. UPLOAD INDIVIDUAL IMAGES (If defined in Menu)
    for (let i = 0; i < updatedCart.length; i++) {
      if (updatedCart[i].inspiration_image) {
        const formData = new FormData();
        formData.append('image', updatedCart[i].inspiration_image);

        try {
          const uploadRes = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/upload-inspiration`, {
            method: 'POST',
            body: formData,
          });
          const uploadData = await uploadRes.json();
          
          if (uploadData.success) {
            updatedCart[i].inspiration_url = uploadData.url;
          }
        } catch (err) {
          console.error('Item image upload error:', err);
        }
      }
    }

    // 2. BUILD PAYLOAD
    const orderPayload = {
        orderType: pickupType === 'now' ? 'Buy Now' : 'Pre-Order',
        customer: {
          name: form.name,
          contactNumber: form.phone,
          alternativeNumber: form.altPhone || null,
        },
        pickup: {
          date: form.pickupDate,
          time: form.pickupTime,
        },
        specialInstructions: form.instructions || null,
        items: updatedCart.map(item => ({
          productId: item.id ?? null,
          name: item.name,
          category: item.category,
          quantity: item.qty,
          unitPrice: item.price,
          subtotal: item.price * item.qty,
          orderSlip: item.order_slip_details || {},
          selectedPriceOptions: item.selected_price_options || null, // INCLUDED FOR VARIABLE PRICING
          inspirationUrl: item.inspiration_url || null
        })),
        payment: {
          type: paymentType === 'half' ? 'deposit' : 'full',
          amountDueNow: paymentType === 'half' ? halfAmount : totalAmount,
          balanceAtPickup: paymentType === 'half' ? halfAmount : 0,
          grandTotal: totalAmount,
        },
        createdAt: new Date().toISOString(),
      };

    let savedOrderDetails = null;

    // 3. SAVE TO DATABASE
    try {
      const dbRes = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/place-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });
      
      const dbData = await dbRes.json();

      if (!dbData.success) {
        alert('Database Error: ' + dbData.message);
        setIsProcessing(false);
        return; 
      }
      savedOrderDetails = dbData.order; 
    } catch (err) {
      console.error('Database network error:', err);
      alert('Network error while saving order to database.');
      setIsProcessing(false);
      return;
    }

    // 4. SAVE TO SESSION STORAGE
    sessionStorage.setItem('tempOrderData', JSON.stringify({ 
      form, 
      pickupType, 
      paymentType, 
      orderPayload,
      cart: updatedCart, 
      savedOrderNumber: savedOrderDetails.order_number 
    }));

    // 5. PAYMONGO CHECKOUT
    const amountToPay = paymentType === 'half' ? halfAmount : totalAmount;

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/paymongo-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountToPay,
          description: `Aileen Cake Max - ${pickupType === 'now' ? 'Pick-up Today' : 'Pre-Order'}`,
          customerName: form.name,
          customerPhone: form.phone,
          frontendUrl: window.location.origin 
        })
      });

      const data = await response.json();

      if (data.success && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert('Failed to generate payment link. Please try again.');
        setIsProcessing(false);
      }
    } catch (error) {
      console.error('Error initiating payment:', error);
      alert('Network error. Please try again later.');
      setIsProcessing(false);
    }
  };

  const formatTime = (time24) => {
    if (!time24) return '';
    let [hours, minutes] = time24.split(':');
    hours = parseInt(hours, 10);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  };

  return (
    <div className="bg-[#FCFAF9] min-h-screen flex flex-col relative">
      <Header page="checkout" />

      <div className="flex-1 w-full max-w-[1440px] mx-auto flex flex-col lg:flex-row gap-6 lg:gap-10 px-5 sm:px-8 py-6 lg:py-4 lg:pl-[140px] xl:pl-[160px]">

        {/* LEFT COLUMN: Step 1 */}
        <div className="flex-1 flex flex-col lg:h-[calc(100vh-112px)] min-h-0 lg:border-l lg:border-[#EAE4E0] lg:pl-6 lg:pr-2 lg:overflow-y-auto scrollbar-thin">
          <div className="flex flex-col lg:bg-white lg:rounded-3xl lg:border lg:border-[#EAE4E0] lg:shadow-sm lg:overflow-hidden">

              <div className="bg-white rounded-2xl border border-[#EAE4E0] p-5 sm:p-6 shadow-sm flex flex-col shrink-0 lg:rounded-none lg:border-0 lg:shadow-none">
                  <div className="flex items-center gap-2.5 mb-3.5 shrink-0">
                    <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0">
                      <ClipboardList size={14} />
                    </div>
                    <h3 className="text-lg font-serif text-[#3B1F0A] leading-none">Pick-up & Customer Details</h3>
                  </div>
                  <div className="w-full h-px bg-[#EAE4E0] mb-4 shrink-0"></div>

                  <div className="flex bg-[#F5EFEB] rounded-xl p-1 mb-4 w-full shrink-0">
                    <button
                      onClick={() => !hasPreOrder && setPickupType('now')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${pickupType === 'now' ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'} ${hasPreOrder ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Pick-up Today
                    </button>
                    <button
                      onClick={() => !hasPickUpToday && setPickupType('later')}
                      className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${pickupType === 'later' ? 'bg-[#4A3B36] text-white shadow-sm' : 'text-[#8A7264] hover:bg-[#EAE4E0]'} ${hasPickUpToday ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Pre-Order
                    </button>
                  </div>

                  <div className="flex flex-col gap-3.5 shrink-0">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          <div>
                              <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Full Name <span className="text-red-500">*</span></label>
                              <input type="text" placeholder="e.g. Juan Dela Cruz" className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors" onChange={e => setForm({...form, name: e.target.value})} />
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Contact Number <span className="text-red-500">*</span></label>
                              <input type="text" placeholder="09xxxxxxxxx" className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors" onChange={e => setForm({...form, phone: e.target.value})} />
                          </div>
                      </div>
                      <div>
                          <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Alternative Number</label>
                          <input type="text" placeholder="Optional" className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors" onChange={e => setForm({...form, altPhone: e.target.value})} />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-4">
                          <div>
                              <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Pickup Date <span className="text-red-500">*</span></label>
                              <input 
                                type="date" 
                                min={pickupType === 'now' ? getLiveNow().dateStr : minPreOrderDate}
                                disabled={pickupType === 'now'} 
                                value={pickupType === 'now' ? getLiveNow().dateStr : form.pickupDate}
                                className={`w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors text-[#3B1F0A] ${pickupType === 'now' ? 'bg-[#F5EFEB] opacity-70 cursor-not-allowed' : 'bg-white'}`} 
                                onChange={handleDateChange} 
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Pickup Time <span className="text-red-500">*</span></label>
                              <input 
                                type="time" 
                                min={pickupType === 'now' ? getLiveNow().timeStr : undefined}
                                className="w-full border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors text-[#3B1F0A]" 
                                onChange={handleTimeChange} 
                                value={form.pickupTime}
                              />
                          </div>
                      </div>

                      <div className="mb-4 pb-6">
                          <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">Suggestions / Special Instructions</label>
                          <input
                            type="text"
                            placeholder="Anything else we should know? (e.g. cake message, allergies, design notes)"
                            className="w-full h-[42px] border border-[#EAE4E0] px-3.5 py-2.5 text-xs rounded-xl focus:outline-none focus:border-[#5A453C] transition-colors text-ellipsis overflow-hidden whitespace-nowrap"
                            onChange={e => setForm({...form, instructions: e.target.value})}
                          />
                      </div>
                  </div>
              </div>

          </div>
        </div>

        {/* RIGHT COLUMN: Step 2 (Payment) */}
        <div className="flex lg:flex-col w-full lg:w-[360px] bg-white rounded-3xl border border-[#EAE4E0] shadow-sm shrink-0 lg:max-h-[calc(100vh-112px)] overflow-hidden flex-col">

          <div className="flex-1 min-h-0 px-5 py-4 flex flex-col gap-5 overflow-y-auto scrollbar-thin">
              <div className="flex flex-col shrink-0">
                  <div className="flex items-center gap-2.5 mb-3 shrink-0">
                      <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0">
                        <CreditCard size={14} />
                      </div>
                      <h3 className="text-lg font-serif text-[#3B1F0A] leading-none">Payment</h3>
                  </div>
                  <div className="w-full h-px bg-[#EAE4E0] mb-3 shrink-0"></div>
                  <p className="text-[11px] text-[#8A7264] mb-3.5 shrink-0">We require at least a 50% deposit to process your order.</p>

                  <div className="grid grid-cols-1 gap-3 shrink-0">
                      <div
                          onClick={() => setPaymentType('half')}
                          className={`border rounded-xl p-3 cursor-pointer transition-all ${paymentType === 'half' ? 'border-[#4A3B36] bg-[#F5EFEB]' : 'border-[#EAE4E0] bg-white hover:border-[#DED4CC]'}`}
                      >
                          <div className="flex items-center gap-2 mb-1">
                              <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${paymentType === 'half' ? 'border-[#4A3B36]' : 'border-[#B7A99F]'}`}>
                                  {paymentType === 'half' && <div className="w-1.5 h-1.5 rounded-full bg-[#4A3B36]"></div>}
                              </div>
                              <span className="text-xs font-bold text-[#3B1F0A]">50% Deposit</span>
                          </div>
                          <p className="text-[10px] text-[#8A7264] pl-[22px] leading-snug mb-1 opacity-90">Pay half now, balance upon pick-up.</p>
                          <div className="pl-[22px] font-bold text-[#3B1F0A] text-xs">₱{halfAmount.toLocaleString()}</div>
                      </div>

                      <div
                          onClick={() => setPaymentType('full')}
                          className={`border rounded-xl p-3 cursor-pointer transition-all ${paymentType === 'full' ? 'border-[#4A3B36] bg-[#F5EFEB]' : 'border-[#EAE4E0] bg-white hover:border-[#DED4CC]'}`}
                      >
                          <div className="flex items-center gap-2 mb-1">
                              <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${paymentType === 'full' ? 'border-[#4A3B36]' : 'border-[#B7A99F]'}`}>
                                  {paymentType === 'full' && <div className="w-1.5 h-1.5 rounded-full bg-[#4A3B36]"></div>}
                              </div>
                              <span className="text-xs font-bold text-[#3B1F0A]">Full Payment</span>
                          </div>
                          <p className="text-[10px] text-[#8A7264] pl-[22px] leading-snug mb-1 opacity-90">Pay in full for hassle-free pick-up.</p>
                          <div className="pl-[22px] font-bold text-[#3B1F0A] text-xs">₱{totalAmount.toLocaleString()}</div>
                      </div>
                  </div>
              </div>

          </div>

          <div className="px-5 pt-2.5 pb-3.5 shrink-0 border-t border-[#F1EBE6] bg-white">
            <div className="mb-2">
              {paymentType === 'half' ? (
                <>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-[#8A7264]">To Pay Now (50%)</span>
                    <span className="text-[11px] text-[#8A7264]">₱{halfAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#8A7264]">Balance at Pick-up</span>
                    <span className="text-[11px] text-[#8A7264]">₱{halfAmount.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-px bg-[#F1EBE6] mb-1"></div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-[#8A7264]">To Pay Now</span>
                    <span className="text-[11px] text-[#8A7264]">₱{totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-px bg-[#F1EBE6] mb-1"></div>
                </>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#5A453C]">Grand Total</span>
                <span className="font-serif text-base text-[#3B1F0A]">₱{totalAmount.toLocaleString()}</span>
              </div>
            </div>
            <button
              onClick={handleProceedToOrder}
              disabled={isProcessing}
              className="w-full bg-[#3B1F0A] text-white py-2.5 rounded-full text-xs font-semibold hover:bg-[#2A1608] disabled:opacity-75 disabled:cursor-not-allowed transition-colors"
            >
              {isProcessing ? 'Processing Payment...' : 'Proceed to Order'}
            </button>
            <button
              onClick={() => navigate('/onlineOrdering/menu')}
              disabled={isProcessing}
              className="w-full text-[11px] font-bold text-[#8A7264] hover:text-[#4A3B36] mt-2 text-center transition-colors disabled:opacity-50"
            >
              &larr; Back to Menu
            </button>
          </div>
        </div>
      </div>

      {/* --- Order Summary Modal --- */}
      {showSummaryModal && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 px-4 py-6 sm:px-5">
          <div className="bg-white rounded-3xl border border-[#EAE4E0] shadow-sm w-full max-w-[420px] max-h-[88vh] sm:max-h-[85vh] flex flex-col overflow-hidden">

            <div className="p-4 pb-3 sm:p-5 sm:pb-3.5 flex items-center gap-2.5 shrink-0 border-b border-[#F1EBE6]">
              <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0">
                <Receipt size={14} />
              </div>
              <h3 className="text-base sm:text-lg font-serif text-[#3B1F0A] leading-none">Order Summary</h3>
            </div>

            <div className="px-4 py-3 sm:px-5 sm:py-3.5 flex-1 overflow-y-auto flex flex-col gap-3 sm:gap-3.5 scrollbar-thin">

              <div className="pb-3.5 border-b border-[#F1EBE6] flex flex-col gap-1.5">
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <span className="text-[#8A7264]">Order Type</span>
                  <span className="text-[#3B1F0A] font-semibold text-right">{pickupType === 'now' ? 'Pick-up Today' : 'Pre-Order'}</span>

                  <span className="text-[#8A7264]">Name</span>
                  <span className="text-[#3B1F0A] font-semibold text-right truncate">{form.name || '—'}</span>

                  <span className="text-[#8A7264]">Contact</span>
                  <span className="text-[#3B1F0A] font-semibold text-right truncate">{form.phone || '—'}</span>

                  {form.altPhone && (
                    <>
                      <span className="text-[#8A7264]">Alt Contact</span>
                      <span className="text-[#3B1F0A] font-semibold text-right truncate">{form.altPhone}</span>
                    </>
                  )}

                  <span className="text-[#8A7264]">Date & Time</span>
                  <span className="text-[#3B1F0A] font-semibold text-right truncate">
                    {form.pickupDate || '—'} {form.pickupTime && `• ${formatTime(form.pickupTime)}`}
                  </span>

                  {form.instructions && (
                    <>
                      <span className="text-[#8A7264]">Special Instructions</span>
                      <span className="text-[#3B1F0A] font-semibold text-right truncate">{form.instructions}</span>
                    </>
                  )}
                </div>
              </div>

              {cart.map((item, i) => (
                <div key={i} className="flex justify-between items-start gap-3 pb-3.5 border-b border-[#F1EBE6] last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-xs text-[#3B1F0A] line-clamp-2 leading-snug">{item.qty}x {item.name}</p>
                    
                    {/* DISPLAY SELECTED VARIABLE PRICE OPTIONS */}
                    {item.selected_price_options && Object.keys(item.selected_price_options).length > 0 && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        {Object.entries(item.selected_price_options).map(([label, value]) => (
                          <p key={label} className="text-[10px] text-[#B7A99F] leading-snug">
                            <span className="font-semibold text-[#8A7264]">{label}:</span> {value}
                          </p>
                        ))}
                      </div>
                    )}
                    
                    {item.order_slip_details && Object.keys(item.order_slip_details).length > 0 && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        {Object.entries(item.order_slip_details).map(([label, value]) => (
                          <p key={label} className="text-[10px] text-[#B7A99F] leading-snug">
                            <span className="font-semibold text-[#8A7264]">{label}:</span> {value}
                          </p>
                        ))}
                      </div>
                    )}
                    {item.inspiration_image && (
                       <p className="text-[10px] text-[#B7A99F] mt-0.5 leading-snug">Image Attached</p>
                    )}
                  </div>
                  <span className="font-bold text-xs text-[#5A453C] shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="px-4 pt-3 pb-4 sm:px-5 sm:pt-3.5 sm:pb-5 shrink-0 border-t border-[#F1EBE6] bg-white">
              <div className="mb-4">
                {paymentType === 'half' ? (
                  <>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-[#8A7264]">To Pay Now (50%)</span>
                      <span className="text-xs text-[#8A7264]">₱{halfAmount.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-[#8A7264]">Balance at Pick-up</span>
                      <span className="text-xs text-[#8A7264]">₱{halfAmount.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-px bg-[#F1EBE6] mb-2"></div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-[#8A7264]">To Pay Now</span>
                      <span className="text-xs text-[#8A7264]">₱{totalAmount.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-px bg-[#F1EBE6] mb-2"></div>
                  </>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#5A453C]">Grand Total</span>
                  <span className="font-serif text-lg text-[#3B1F0A]">₱{totalAmount.toLocaleString()}</span>
                </div>
              </div>
              <button
                onClick={handlePlaceOrder}
                disabled={isProcessing}
                className="w-full bg-[#3B1F0A] text-white py-3.5 rounded-full text-sm font-semibold hover:bg-[#2A1608] disabled:opacity-75 disabled:cursor-not-allowed transition-colors"
              >
                {isProcessing ? 'Processing Payment...' : 'Place Order'}
              </button>
              <button
                onClick={() => setShowSummaryModal(false)}
                disabled={isProcessing}
                className="w-full text-[11px] font-bold text-[#8A7264] hover:text-[#4A3B36] mt-3 text-center transition-colors disabled:opacity-50"
              >
                &larr; Back
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}