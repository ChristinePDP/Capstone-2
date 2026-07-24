import { useState,  } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LineChart, Monitor, ClipboardCheck,
  ShoppingCart, List, LogOut, X
} from 'lucide-react';
import brandLogo from '../assets/427bffe9-d983-4566-9ec9-de6c2b1bdaa2-removebg-preview.png';
import Header from './Header';

// ─── NAV CONFIGURATION ────────────────────────────────────────
const NAV = [
  {
    section: 'OPERATIONS',
    items: [
      { label: 'Point Of Sale', icon: Monitor, to: '/pos' },
      { label: 'All Orders', icon: ClipboardCheck, to: '/orders' },
      { label: 'Product Management', icon: ShoppingCart, to: '/products' },
    ],
  },
  {
    section: 'CATALOG',
    items: [
      { label: 'Inventory', icon: List, to: '/inventory' },
    ],
  },
  {
    section: 'OVERVIEW',
    items: [{ label: 'Analytics', icon: LineChart, to: '/analytics' }],
  }
];

// ─── Sidebar (internal nav panel) ─────────────────────────────
function Sidebar({ onLogoutClick, open, onClose }) {
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={
          `bg-[#3B1F0A] flex flex-col fixed top-0 left-0 bottom-0 z-50 shadow-xl overflow-hidden ` +
          `transition-transform duration-300 ease-in-out ` +
          `md:translate-x-0 ` +
          (open ? 'translate-x-0' : '-translate-x-full')
        }
        style={{ width: 'var(--sidebar-width, 220px)' }}
      >

        <div className="absolute top-[-70px] right-[-70px] w-[240px] h-[240px] rounded-full bg-white/[0.04] pointer-events-none" />
        <div className="absolute bottom-[80px] left-[-80px] w-[300px] h-[300px] rounded-full bg-white/[0.02] pointer-events-none" />
        <div className="absolute top-[40%] right-[-100px] w-[200px] h-[200px] rounded-full bg-black/[0.15] pointer-events-none" />

        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors z-10"
        >
          <X size={18} />
        </button>

        {/* Logo Section */}
        <div className="flex flex-col items-center pt-8 pb-5 border-b border-white/10">
          <img
            src={brandLogo}
            alt="Logo"
            className="w-[110px] h-[100px] "
          />
          <h2 className="font-serif text-[20px] font-bold text-white tracking-wide text-center leading-tight">
            Aileen Cake Max
          </h2>
          <p className="text-[10px] text-white/80 uppercase tracking-[0.2em] mt-1 font-medium">Bake Shop</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-3 overflow-hidden">
          {NAV.map((group, idx) => (
            <div key={group.section} className={idx !== 0 ? "mt-6" : ""}>
              <p className="text-[10px] font-bold text-white/50 tracking-wider mb-2 px-2">
                {group.section}
              </p>
              <div className="flex flex-col gap-1">
                {group.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onClose}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all duration-200 ` +
                      (isActive
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'text-white/70 hover:bg-white/10 hover:text-white')
                    }
                  >
                    <item.icon size={16} strokeWidth={2.2} />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer - Logout */}
        <div className="mt-auto px-4 pb-6 pt-2">
          <div className="border-t border-white/10 pt-4">
            <button onClick={onLogoutClick} className="flex items-center justify-center gap-2 w-full text-white/90 hover:text-white transition-colors font-bold text-[15px]">
              Logout
              <LogOut size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Layout (moved from Theme.jsx) ────────────────────────────
export function Layout({ children, onLogout }) {
  const { pathname } = useLocation();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close the mobile drawer automatically whenever the route changes
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close the mobile drawer automatically whenever the route changes
  // Updating state directly during render avoids the useEffect cascading render
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setSidebarOpen(false);
  }

  return (
    <div className="flex min-h-screen bg-brand-50" style={{ '--sidebar-width': '220px' }}>
      <Sidebar
        onLogoutClick={() => setLogoutOpen(true)}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />
      <div className="flex-1 flex flex-col min-h-screen md:ml-[var(--sidebar-width,220px)]">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 p-3 md:p-5 overflow-auto">{children}</main>
      </div>

      {/* ── Logout Confirmation Modal ── */}
      {logoutOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm"
          onClick={e => e.target === e.currentTarget && setLogoutOpen(false)}
        >
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl animate-modalIn">
            <div className="flex items-start justify-between p-5 border-b border-brand-100">
              <div>
                <h2 className="font-serif text-lg font-bold text-brand-800">Sign out</h2>
                <p className="text-xs text-brand-400 mt-0.5">Are you sure you want to log out?</p>
              </div>
              <button
                onClick={() => setLogoutOpen(false)}
                className="w-8 h-8 rounded-lg border border-brand-200 flex items-center justify-center text-brand-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all ml-4"
              >
                <X size={15} />
              </button>
            </div>
            <div className="p-5 flex gap-3 justify-end">
              <button
                onClick={() => setLogoutOpen(false)}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setLogoutOpen(false); onLogout(); }}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 transition-colors flex items-center gap-2"
              >
                <LogOut size={14} /> Yes, sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Sidebar;