import { useState, useEffect, useRef } from 'react';
import { LogOut, ChevronDown } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import HamburgerMenu from './HamburgerMenu';
import Notification from './Notification';

const PAGE_TITLES = {
  '/analytics':         'Analytics',
  '/pos':      'Point of Sale',
  '/orders':   'All Orders',
  '/products': 'Product Management',
  '/inventory':'Inventory',
};

// Ang "/productAndEvent" ay may "/*" wildcard sa route nito (para pumasok
// din ang "/productAndEvent/events" sub-path), kaya hindi ito basta-basta
// mahahanap sa exact-match na PAGE_TITLES object sa itaas. I-check natin
// muna kung nagsisimula sa "/productAndEvent" ang pathname bago mag-fallback.
const resolveTitle = (pathname) => {
  if (pathname.startsWith('/productAndEvent')) return 'Product and Event Management';
  return PAGE_TITLES[pathname] || 'Dashboard';
};

export default function Header({ onMenuClick, onLogoutClick }) {
  const { pathname } = useLocation();
  const title = resolveTitle(pathname);

  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }));
      setDateStr(now.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

        <Notification />

        <div className="hidden sm:block w-[1px] h-6 bg-brand-200" />

        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(v => !v)}
            className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 hover:bg-brand-50 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-brand-800 flex items-center justify-center text-white text-sm font-bold shrink-0">E</div>
            <span className="hidden sm:inline text-[15px] font-semibold text-brand-700">Evangeline V.</span>
            <ChevronDown size={14} className="hidden sm:inline text-brand-400" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-11 w-48 bg-white border border-brand-200 rounded-2xl shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-brand-100">
                <p className="text-sm font-bold text-brand-800 truncate">Evangeline V.</p>
                <p className="text-[11px] text-brand-400 mt-0.5">Admin</p>
              </div>
              <button
                onClick={() => { setProfileOpen(false); onLogoutClick?.(); }}
                className="w-full flex items-center gap-2 px-4 py-3 text-[13px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut size={15} strokeWidth={2.3} />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}