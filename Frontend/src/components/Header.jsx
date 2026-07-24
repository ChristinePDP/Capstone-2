import { useState, useEffect, useRef } from 'react';
import { Bell, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import HamburgerMenu from './HamburgerMenu';

const PAGE_TITLES = {
  '/analytics':         'Analytics',
  '/pos':      'Point of Sale',
  '/orders':   'All Orders',
  '/products': 'Product Management',
  '/inventory':'Inventory',
};

export default function Header({ onMenuClick }) {
  const { pathname } = useLocation();
  const title = PAGE_TITLES[pathname] || 'Dashboard';

  const { orders } = useApp();
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  const preOrders = orders.filter(o => o.type === 'Pre-Order' && ['Pending', 'Confirmed'].includes(o.status));

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
      const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
      setTimeStr(timeStr);
      setDateStr(dateStr);  
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Close notif panel on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const statusColor = { Pending: 'bg-amber-100 text-amber-700', Confirmed: 'bg-blue-100 text-blue-700', Ready: 'bg-green-100 text-green-700' };

  return (
    <header className="bg-white border-b border-brand-200 px-4 md:px-6 h-14 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3 min-w-0">
        <HamburgerMenu onMenuClick={onMenuClick} />
        <h1 className="text-[17px] md:text-[20px] font-bold text-brand-800 tracking-wide truncate">{title}</h1>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="hidden sm:flex items-center gap-4 text-[13px] md:text-[14px] font-bold text-brand-700 tabular-nums">
        {dateStr} • {timeStr}
      </div>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(v => !v)}
            className="relative w-9 h-9 md:w-10 md:h-10 rounded-xl border border-brand-200 flex items-center justify-center text-brand-500 hover:bg-brand-50 hover:text-brand-700 transition-colors"
          >
            <Bell size={16} strokeWidth={2} />
            {preOrders.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
                {preOrders.length > 9 ? '9+' : preOrders.length}
              </span>
            )}
          </button>

          {/* Dropdown panel */}
          {notifOpen && (
            <div className="absolute right-0 top-11 w-[calc(100vw-2rem)] max-w-80 bg-white border border-brand-200 rounded-2xl shadow-xl overflow-hidden z-50">
              <div className="flex items-center justify-between px-4 py-3 border-b border-brand-100">
                <div>
                  <p className="text-sm font-bold text-brand-800">New Orders</p>
                  <p className="text-[11px] text-brand-400 mt-0.5">{preOrders.length} pending order{preOrders.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => setNotifOpen(false)} className="text-brand-400 hover:text-brand-700 transition-colors">
                  <X size={14} />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {preOrders.length === 0 ? (
                  <div className="py-8 text-center text-brand-300 text-sm">
                    <Bell size={22} className="mx-auto mb-2 opacity-40" />
                    Walang bagong online orders.
                  </div>
                ) : (
                  preOrders.map(order => (
                    <div key={order.id} className="px-4 py-3 border-b border-brand-100 last:border-0 hover:bg-brand-50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-bold text-brand-800 truncate">{order.customer.name}</p>
                          <p className="text-[13px] text-brand-500 mt-1.5">{order.id}</p>
                          <p className="text-[12px] text-brand-500 mt-0.5 truncate">
                            {order.items.map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ')}
                          </p>
                          {order.pickupDate && (
                            <p className="text-[13px] text-brand-800 mt-1 flex items-center gap-1">
                              <span>📅</span> Pick-up: {order.pickupDate}{order.pickupTime ? ' · ' + order.pickupTime : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor[order.status] || 'bg-gray-100 text-gray-600'}`}>
                            {order.status}
                          </span>
                          <span className="text-[15px] font-bold text-brand-700">
                            ₱{order.grandTotal?.toLocaleString('en-PH') || order.subtotal?.toLocaleString('en-PH')}
                          </span>
                        </div>
                      </div>
                      
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        
        <div className="hidden sm:block w-[1px] h-6 bg-brand-200" />
        
        <div className="hidden sm:flex items-center gap-2.5">
          <span className="text-[15px] font-semibold text-brand-700">Evangeline V.</span>
          <div className="w-8 h-8 rounded-full bg-brand-800 flex items-center justify-center text-white text-sm font-bold">E</div>
        </div>
        <div className="sm:hidden w-8 h-8 rounded-full bg-brand-800 flex items-center justify-center text-white text-sm font-bold shrink-0">E</div>
      </div>
    </header>
  );
}