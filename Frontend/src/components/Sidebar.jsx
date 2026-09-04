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
    items: [
      { label: 'Analytics', icon: LineChart, to: '/analytics' },
    ],
  },
  {
    section: '', // no header label — rendered as a divided, separate group at the bottom
    items: [
      { label: 'Settings', icon: Settings, to: '/settings' },
    ],
  }
];

// Note: sidebar width is now responsive (184px on md-only tablets, 220px at lg+,
// 76px collapsed) so it's set directly in the className strings below rather
// than as single constants.

// ─── Sidebar (internal nav panel) ─────────────────────────────
// Pulls the logged-in admin's name/email straight from localStorage — same
// source and shape Header.jsx reads, so both stay in sync automatically.
const getStoredUser = () => {
  try {
    const stored = localStorage.getItem('admin') || localStorage.getItem('user');
    if (stored) {
      const parsed = JSON.parse(stored);
      return { name: parsed.name || 'Admin', email: parsed.email || '' };
    }
  } catch (e) {
    console.error('Failed to parse user data from storage', e);
  }
  return { name: 'Admin', email: '' };
};

function Sidebar({ open, onClose, collapsed, onToggleCollapse, onLogoutClick }) {
  // Only the name is still used (logout button tooltip when collapsed) —
  // avatar/email were dropped from the sidebar since Header.jsx already shows them.
  const [{ name: adminName }] = useState(getStoredUser);

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
          (collapsed ? 'md:w-[76px]' : 'md:w-[184px] xl:w-[220px]')
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

        {/* Collapse/Expand toggle — desktop only. Centered at the top when the
            sidebar is narrow (collapsed), upper-right corner when it's wide
            (expanded). Plain icon button, no circle background. */}
        <button
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={
            `hidden md:flex items-center justify-center absolute top-2.5 rounded-lg ` +
            `w-8 h-8 xl:w-9 xl:h-9 text-white/80 hover:text-white hover:bg-white/10 active:scale-90 ` +
            `transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] z-20 ` +
            (collapsed ? 'left-1/2 -translate-x-1/2' : 'right-2.5')
          }
        >
          {collapsed ? <PanelLeftOpen size={18} strokeWidth={2.2} /> : <PanelLeftClose size={18} strokeWidth={2.2} />}
        </button>

        {/* Logo Section — hidden when collapsed (icon-only rail); the padding-top
            still reserves clearance for the toggle button above. Sized down a
            notch on tablet-range (md-only) screens, full size at lg+. */}
        <div className={`flex flex-col items-center pt-6 pb-4 border-b border-white/10 shrink-0 ${collapsed ? 'md:pt-14 md:pb-2 md:px-1' : ''}`}>
          <img
            src={brandLogo}
            alt="Logo"
            className={`aspect-square object-contain shrink-0 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] w-[88px] ${
              collapsed ? 'md:hidden' : 'md:w-[68px] xl:w-[88px]'
            }`}
          />
          <div className={`${labelClass} ${collapsed ? 'md:hidden' : ''}`}>
            <h2 className="font-serif text-[18px] md:text-[15px] xl:text-[18px] font-bold text-white tracking-wide text-center leading-tight mt-1.5 px-2">
              Aileen Cake Max
            </h2>
            <p className="text-[10px] text-white/80 uppercase tracking-[0.2em] mt-0.5 font-medium text-center">Bake Shop</p>
          </div>
        </div>

        {/* Navigation */}
        <nav
          className="flex-1 py-4 px-3 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {NAV.map((group, idx) => (
            <div
              key={group.section || 'settings-group'}
              className={
                idx === 0
                  ? ''
                  : group.section
                    ? `mt-6 ${collapsed ? 'md:mt-2' : ''}`
                    : `mt-4 pt-4 border-t border-white/10 ${collapsed ? 'md:mt-2 md:pt-2' : ''}`
              }
            >
              {group.section && (
                <p className={`text-[10px] font-bold text-white/50 tracking-wider mb-2 px-2 ${labelClass} ${collapsed ? 'md:hidden' : ''}`}>
                  {group.section}
                </p>
              )}
              <div className="flex flex-col gap-1">
                {group.items.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 xl:gap-3 px-2.5 xl:px-3 py-2 xl:py-2.5 rounded-lg text-[12.5px] xl:text-[13px] font-semibold ` +
                      `transition-[background-color,color] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ` +
                      (collapsed ? 'md:justify-center md:px-0 ' : '') +
                      (isActive
                        ? 'bg-white/20 text-white shadow-sm'
                        : 'text-white/90 hover:bg-white/10 hover:text-white')
                    }
                  >
                    <item.icon size={18} strokeWidth={2} className="shrink-0" />
                    <span className={labelClass}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer - Logout only. Name/avatar removed — already shown in Header,
            so this stays a single, uncluttered row (icon-only when collapsed). */}
        <div className="px-3 pb-5 pt-3 shrink-0 border-t border-white/10">
          <button
            onClick={onLogoutClick}
            title={collapsed ? `Log out (${adminName})` : undefined}
            className={
              `flex items-center justify-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold w-full ` +
              `text-red-300 hover:bg-red-500/15 hover:text-red-200 transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] ` +
              (collapsed ? 'md:w-9 md:h-9 md:p-0 md:mx-auto md:rounded-full' : '')
            }
          >
            <LogOut size={20} strokeWidth={2} className="shrink-0" />
            <span className={labelClass}>Log out</span>
          </button>
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
        onLogoutClick={() => setLogoutOpen(true)}
      />
      <div
        className={
          `flex-1 flex flex-col min-h-screen min-w-0 transition-[margin-left] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ` +
          (collapsed ? 'md:ml-[76px]' : 'md:ml-[184px] xl:ml-[220px]')
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