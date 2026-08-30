import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LineChart, Monitor, ClipboardCheck,
  Package, Warehouse, X, Settings, LogOut,
  PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import brandLogo from '../assets/427bffe9-d983-4566-9ec9-de6c2b1bdaa2-removebg-preview.png';
import Header from './Header';

// ─── NAV CONFIGURATION ────────────────────────────────────────
const NAV = [
  {
    section: 'OPERATIONS',
    items: [
      { label: 'Point Of Sale', icon: Monitor, to: '/pos' },
      { label: 'Orders', icon: ClipboardCheck, to: '/orders' },
      { label: 'Product & Event', icon: Package, to: '/productAndEvent' },
    ],
  },
  {
    section: 'CATALOG',
    items: [
      { label: 'Inventory', icon: Warehouse, to: '/inventory' },
    ],
  },
  {
    section: 'OVERVIEW',
    items: [{ label: 'Analytics', icon: LineChart, to: '/analytics' }],
  }
];

// Sidebar widths — desktop switches between these two; mobile always uses the expanded width.
const SIDEBAR_WIDTH_EXPANDED = 220;
const SIDEBAR_WIDTH_COLLAPSED = 76;

// ─── Sidebar (internal nav panel) ─────────────────────────────
function Sidebar({ open, onClose, collapsed, onToggleCollapse }) {
  // Small helper so we don't repeat this fade+shrink treatment on every label.
  // Below `md`, these classes have no `md:` prefix so they never apply — mobile
  // drawer always shows full labels regardless of the desktop collapsed state.
  const labelClass = `overflow-hidden whitespace-nowrap transition-all ease-[cubic-bezier(0.4,0,0.2,1)] ${
    collapsed
      ? 'md:w-0 md:opacity-0 md:ml-0 duration-150'
      : 'md:opacity-100 duration-300 md:delay-100'
  }`;

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
          `transition-[width,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width,transform] ` +
          `md:translate-x-0 ` +
          (open ? 'translate-x-0' : '-translate-x-full') +
          ` w-[220px] ` +
          (collapsed ? 'md:w-[76px]' : 'md:w-[220px]')
        }
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
        <div className={`flex flex-col items-center pt-6 pb-4 border-b border-white/10 shrink-0 ${collapsed ? 'md:px-1' : ''}`}>
          <img
            src={brandLogo}
            alt="Logo"
            className={`aspect-square object-contain shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              collapsed ? 'w-[88px] md:w-11' : 'w-[88px]'
            }`}
          />
          <div className={labelClass}>
            <h2 className="font-serif text-[18px] font-bold text-white tracking-wide text-center leading-tight mt-1.5 px-2">
              Aileen Cake Max
            </h2>
            <p className="text-[10px] text-white/80 uppercase tracking-[0.2em] mt-0.5 font-medium text-center">Bake Shop</p>
          </div>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 py-4 px-3 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Collapse/Expand toggle — desktop only, sits above OPERATIONS */}
          <button
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={
              `hidden md:flex items-center gap-3 px-3 py-2.5 mb-4 rounded-lg text-[13px] font-semibold ` +
              `text-white/70 hover:bg-white/10 hover:text-white active:scale-95 ` +
              `transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] border border-white/10 w-full ` +
              (collapsed ? 'md:justify-center md:px-0' : '')
            }
          >
            {collapsed ? <PanelLeftOpen size={16} strokeWidth={2.2} /> : <PanelLeftClose size={16} strokeWidth={2.2} />}
            <span className={labelClass}>Collapse</span>
          </button>

          {NAV.map((group, idx) => (
            <div key={group.section} className={idx !== 0 ? "mt-6" : ""}>
              <p className={`text-[10px] font-bold text-white/50 tracking-wider mb-2 px-2 ${labelClass}`}>
                {group.section}
              </p>
              <div className="flex flex-col gap-1">
                {group.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold ` +
                      `transition-[background-color,color] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ` +
                      (collapsed ? 'md:justify-center md:px-0 ' : '') +
                      (isActive
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'text-white/70 hover:bg-white/10 hover:text-white')
                    }
                  >
                    <item.icon size={16} strokeWidth={2.2} className="shrink-0" />
                    <span className={labelClass}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer - Settings */}
        <div className="px-3 pb-5 pt-2 shrink-0">
          <div className="border-t border-white/10 pt-3">
            <NavLink
              to="/settings"
              onClick={onClose}
              title={collapsed ? 'Settings' : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold ` +
                `transition-[background-color,color] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ` +
                (collapsed ? 'md:justify-center md:px-0 ' : '') +
                (isActive
                  ? 'bg-white/20 text-white shadow-sm'
                  : 'text-white/70 hover:bg-white/10 hover:text-white')
              }
            >
              <Settings size={16} strokeWidth={2.2} className="shrink-0" />
              <span className={labelClass}>Settings</span>
            </NavLink>
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

  // Desktop collapse state — persisted so it survives refresh/navigation.
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === '1';
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  };

  // Close the mobile drawer automatically whenever the route changes
  const [prevPathname, setPrevPathname] = useState(pathname);

  // Close the mobile drawer automatically whenever the route changes
  // Updating state directly during render avoids the useEffect cascading render
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setSidebarOpen(false);
  }

  return (
    <div className="flex min-h-screen w-full max-w-full overflow-x-hidden bg-brand-50">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapsed}
      />
      <div
        className={
          `flex-1 flex flex-col min-h-screen min-w-0 transition-[margin-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ` +
          (collapsed ? 'md:ml-[76px]' : 'md:ml-[220px]')
        }
      >
        <Header onMenuClick={() => setSidebarOpen(true)} onLogoutClick={() => setLogoutOpen(true)} />
        <main className="flex-1 min-w-0 p-3 md:p-5 overflow-x-hidden overflow-y-auto">{children}</main>
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