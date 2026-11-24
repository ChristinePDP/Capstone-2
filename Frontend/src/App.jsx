import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import * as authService from './services/authService.js';

import LoginPage from './pages/LoginPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import AnalyticsPage from './pages/analyticsPage.jsx';
import OnlineOrderingPage from './pages/onlineOrderingPage.jsx';
import AllOrdersPage from './pages/allorderspage.jsx';
import EventAdsModal from './components/onlineOrdering/eventAdsModal.jsx';

import ProductAndEventPage from './pages/productAndEventPage.jsx';
import PosPage from './pages/posPage.jsx';
import SettingsPage from './pages/settingsPage.jsx'; // <-- ADDED

import { ToastProvider, ErrorState } from './components/ui/index.jsx';
import { Layout } from './components/Sidebar.jsx';
import { AppProvider, useApp } from './context/AppContext.jsx'; // <-- useApp ADDED
import { Menu as MenuIcon, X, ShoppingCart, ClipboardCheck, LogOut } from 'lucide-react';
import brandLogo from './assets/427bffe9-d983-4566-9ec9-de6c2b1bdaa2-removebg-preview.png';

function normalizeRoles(role) {
  const roles = String(role || 'admin')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  const uniqueRoles = [...new Set(roles)];
  return ['admin', 'cashier'].filter(value => uniqueRoles.includes(value));
}

function getStoredAdminRoles() {
  try {
    const admin = JSON.parse(localStorage.getItem('admin') || 'null');
    return normalizeRoles(admin?.role);
  } catch {
    return ['admin'];
  }
}

function hasStoredRole(role) {
  return getStoredAdminRoles().includes(role);
}

function PosStandaloneLayout({ children, onLogout, activeTab, onTabChange }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const chooseTab = (tab) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-brand-50 flex flex-col">
      <header className="relative isolate h-14 shrink-0 overflow-hidden bg-[#3B1F0A] border-b border-[#6B4428] px-3 md:px-5 flex items-center justify-between gap-3 text-[#FFF8EE]">
        <span aria-hidden="true" className="pointer-events-none absolute -top-16 left-[28%] h-44 w-44 rounded-full bg-[#D7A86E]/[0.09]" />
        <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 right-[12%] h-48 w-48 rounded-full bg-[#F7E7D2]/[0.06]" />
        <span aria-hidden="true" className="pointer-events-none absolute -top-20 right-[-2rem] h-36 w-36 rounded-full bg-black/[0.12]" />
        <div className="relative z-10 flex items-center min-w-0 gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="md:hidden w-9 h-9 shrink-0 rounded-lg flex items-center justify-center text-[#FFF8EE] hover:bg-white/10"
            aria-label="Open navigation menu"
          >
            <MenuIcon size={20} strokeWidth={2.2} />
          </button>
          <img src={brandLogo} alt="Aileen Cake Max" className="hidden md:block h-9 w-9 object-contain shrink-0" />
          <h1 className="text-[16px] md:text-[20px] font-bold text-[#FFF8EE] tracking-wide truncate">
            {activeTab === 'pos' ? 'Point of Sale' : 'All Orders'}
          </h1>
        </div>
        <nav className="relative z-10 hidden md:flex min-w-0 items-center gap-5" aria-label="Point of Sale sections">
          <button
            type="button"
            onClick={() => onTabChange('pos')}
            className={`relative h-14 px-1 text-sm font-bold tracking-wide transition-colors ${activeTab === 'pos' ? 'text-[#FFF8EE]' : 'text-[#D8C2AA] hover:text-white'}`}
          >
            Point of Sale
            {activeTab === 'pos' && <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-[#E7B978]" />}
          </button>
          <button
            type="button"
            onClick={() => onTabChange('orders')}
            className={`relative h-14 px-1 text-sm font-bold tracking-wide transition-colors ${activeTab === 'orders' ? 'text-[#FFF8EE]' : 'text-[#D8C2AA] hover:text-white'}`}
          >
            All Orders
            {activeTab === 'orders' && <span className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-[#E7B978]" />}
          </button>
        </nav>
        <button
          type="button"
          onClick={onLogout}
          className="relative z-10 hidden md:flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-[#FFF8EE] hover:bg-white/10 transition-colors"
        >
          <LogOut size={18} />
          <span>Log out</span>
        </button>
      </header>

      {mobileMenuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[2500] bg-brand-900/40 backdrop-blur-[2px]"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          />
          <aside className="fixed inset-y-0 left-0 z-[2600] w-[220px] max-w-[82vw] bg-[#3B1F0A] border-r border-white/10 shadow-2xl flex flex-col overflow-hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10"
              aria-label="Close navigation menu"
            >
              <X size={18} />
            </button>
            <div className="flex flex-col items-center px-4 pt-7 pb-4 border-b border-white/10 shrink-0">
              <img src={brandLogo} alt="Aileen Cake Max" className="w-[72px] aspect-square object-contain" />
              <h2 className="font-serif text-[16px] font-bold text-white tracking-wide text-center leading-tight mt-1">
                Aileen Cake Max
              </h2>
              <p className="text-[9px] text-white/80 uppercase tracking-[0.2em] mt-0.5 font-medium text-center">Bake Shop</p>
            </div>
            <nav className="flex-1 p-3 overflow-y-auto" aria-label="Mobile Point of Sale sections">
              <p className="text-[10px] font-bold text-white/50 tracking-wider mb-1 px-2">OPERATIONS</p>
              <button
                type="button"
                onClick={() => chooseTab('pos')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold ${activeTab === 'pos' ? 'bg-white/20 text-white shadow-sm' : 'text-white/90 hover:bg-white/10 hover:text-white'}`}
              >
                <ShoppingCart size={18} /> <span>Point of Sale</span>
              </button>
              <button
                type="button"
                onClick={() => chooseTab('orders')}
                className={`mt-0.5 w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold ${activeTab === 'orders' ? 'bg-white/20 text-white shadow-sm' : 'text-white/90 hover:bg-white/10 hover:text-white'}`}
              >
                <ClipboardCheck size={18} /> <span>All Orders</span>
              </button>
            </nav>
            <div className="p-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center justify-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold text-red-300 hover:bg-red-500/15 hover:text-red-200"
              >
                <LogOut size={20} /> <span>Log out</span>
              </button>
            </div>
          </aside>
        </>
      )}
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  );
}

function ProtectedPosRoute() {
  const { isAuthed, authReady, authError, retryAuth, logout } = useApp();
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [activeTab, setActiveTab] = useState(() =>
    localStorage.getItem('pos_active_tab') === 'orders' ? 'orders' : 'pos'
  );

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    localStorage.setItem('pos_active_tab', tab);
  };

  if (!authReady) return null;

  if (!isAuthed) {
    return <Navigate to="/login" replace />;
  }

  if (!hasStoredRole('cashier')) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-brand-50 px-4 py-12 flex items-center justify-center">
        <ErrorState title="Unable to verify your session" description={authError} actionLabel="Retry connection" onRetry={retryAuth} className="w-full max-w-xl" />
      </div>
    );
  }

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await authService.logout();
    } finally {
      logout();
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('admin');
      localStorage.removeItem('pos_cart');
      localStorage.removeItem('pos_form');
      localStorage.removeItem('pos_orderType');
      localStorage.removeItem('pos_additionalCharge');
      localStorage.removeItem('pos_additionalChargeReason');
      localStorage.removeItem('pos_discountName');
      localStorage.removeItem('pos_discountPercentage');
      localStorage.removeItem('pos_paymentMode');
      localStorage.removeItem('pos_active_tab');
      sessionStorage.removeItem('aileen_cake_max_pos_checkout_reservation_id');
      window.location.replace('/login');
    }
  };

  return (
    <>
      <PosStandaloneLayout
        onLogout={() => setShowLogoutConfirm(true)}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      >
        {activeTab === 'pos' ? (
          <PosPage standalone />
        ) : (
          <div className="h-full overflow-y-auto bg-brand-50 px-3 py-4 sm:px-5 lg:px-6">
            <AllOrdersPage />
          </div>
        )}
      </PosStandaloneLayout>

      {showLogoutConfirm && (
        <div
          className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm"
          onClick={(event) => {
            if (!loggingOut && event.target === event.currentTarget) setShowLogoutConfirm(false);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-brand-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-brand-100">
              <h2 className="font-serif text-lg font-bold text-brand-800">Sign out</h2>
              <p className="mt-1 text-xs text-brand-400">Are you sure you want to leave Point of Sale?</p>
            </div>
            <div className="px-5 py-4 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={loggingOut}
                className="px-4 py-2 text-sm font-semibold rounded-lg border border-brand-300 text-brand-700 hover:bg-brand-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-700 text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {loggingOut ? 'Signing out...' : 'Yes, sign out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProtectedAdminRoute({ children }) {
  const { isAuthed, authReady, authError, retryAuth, logout } = useApp();
  const location = useLocation();

  if (!authReady) {
    return null;
  }

  if (!isAuthed) {
    // BAGO: kapag diretsong tinype ang isang protected route (hal. "/inventory")
    // nang hindi pa naka-login, "/unauthorized" na ang lalabas, hindi na
    // deretsong "/login" — para malinaw sa user na bawal siyang pumunta doon.
    return <Navigate to="/unauthorized" replace />;
  }

  if (!hasStoredRole('admin')) {
    return <Navigate to="/unauthorized" replace />;
  }

  if (authError) {
    return (
      <div className="min-h-screen bg-brand-50 px-4 py-12 flex items-center justify-center">
        <ErrorState title="Unable to verify your session" description={authError} actionLabel="Retry connection" onRetry={retryAuth} className="w-full max-w-xl" />
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await authService.logout(); // Hindi na kailangang ipasa ang getToken()
    } finally {
      logout(); // i-sync din ang in-memory auth state at cached admin data
      localStorage.removeItem('isLoggedIn'); // matiks palaging ma-clear kahit mag-fail ang API call
      localStorage.removeItem('admin');
      // Full navigation avoids a protected-route redirect racing this logout.
      window.location.replace('/login');
    }
  };

  return <Layout onLogout={handleLogout}>{children}</Layout>;
}

// ── GUEST ROUTE (BAGO) ──────────────────────────────────────────
// Kabaligtaran ng ProtectedAdminRoute: kung may session ka na (naka-login),
// hindi ka na dapat makarating sa /login page — kailangan agad kang
// ma-redirect papalayo, katulad ng Facebook (inaccessible ang login page
// kapag may active session ka na). Kung wala namang session, ipapasa lang
// natin ang children (yung LoginRoute) nang normal.
function GuestRoute({ children }) {
  const { isAuthed, authReady } = useApp();

  if (!authReady) {
    return null;
  }

  if (isAuthed) {
    const savedWorkspace = localStorage.getItem('login_workspace');
    if (savedWorkspace === 'pos' && hasStoredRole('cashier')) {
      return <Navigate to="/pos" replace />;
    }
    if (savedWorkspace !== 'pos' && hasStoredRole('admin')) {
      return <Navigate to="/analytics" replace />;
    }
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

// ── LOGIN ROUTE (BAGO) ──────────────────────────────────────────
// FIX: Dating `<LoginPage onLogin={() => navigate('/inventory')} />`
// lang ang route element — `navigate()` lang, walang nagsa-sync sa
// AppContext. Dahil sinusulat ang <AppProvider> mismo sa loob ng App()
// component, hindi pwedeng direktang gumamit ng useApp() doon (wala
// pang access ang App() sa sarili niyang context — descendants lang
// nito ang may access).
//
// Ang LoginRoute na ito ay isang bagong component na naka-render
// bilang isang Route ELEMENT — ibig sabihin, DESCENDANT na siya ng
// <AppProvider> sa tree, kaya wastong-wasto na dito gamitin ang
// useApp(). Pagka-success ng login, tinatawag muna natin ang context's
// login() (nagse-set ng isAuthed state -> agad na-trigger ang
// fetchAll() sa AppContext) BAGO mag-navigate — kaya may laman na agad
// ang orders/products/etc. pagdating sa Inventory o All Orders, kahit
// walang refresh.
//
// Destination pagkatapos mag-login: /analytics (hindi na /inventory).
function LoginRoute() {
  const navigate = useNavigate();
  const { login } = useApp();

  const handleLogin = (admin, workspace) => {
    login();               // i-sync ang AppContext (triggers fetchAll)
    const roles = normalizeRoles(admin?.role);
    if (workspace === 'pos' && !roles.includes('cashier')) {
      navigate('/unauthorized', { replace: true });
      return;
    }
    if (workspace === 'admin' && !roles.includes('admin')) {
      navigate('/unauthorized', { replace: true });
      return;
    }
    navigate(workspace === 'pos' ? '/pos' : '/analytics', { replace: true });
  };

  return <LoginPage onLogin={handleLogin} />;
}


// ── Shared cake-slice icon para sa 401/404 states ──
function CakeSliceIcon({ className }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <path
        d="M8 50 L32 14 L56 50 Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M8 50 L56 50" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M17 50 L32 26 L47 50" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.45" />
      <circle cx="32" cy="9" r="2.5" fill="currentColor" />
      <path d="M32 14 L32 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── 401 Page (BAGO) ──
// Lalabas ito kapag sinubukang i-type/i-access diretso ang isang
// protected route (hal. "/inventory") nang hindi pa naka-login.
function Unauthorized() {
  const navigate = useNavigate();
  const { isAuthed, logout } = useApp();
  const hasCashierAccess = hasStoredRole('cashier');
  const hasAdminAccess = hasStoredRole('admin');

  const handleSignIn = async () => {
    try {
      await authService.logout();
    } catch {
      // Continue to the login page even if the logout request fails.
    } finally {
      logout();
      localStorage.removeItem('isLoggedIn');
      localStorage.removeItem('admin');
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FBF6EF] px-6">
      <div className="w-full max-w-sm text-center">
        <CakeSliceIcon className="mx-auto mb-6 h-14 w-14 text-brand-600" />
        <p className="mb-1 text-sm tracking-wide text-stone-400">Error 401</p>
        <h1 className="mb-3 text-2xl font-semibold text-stone-800">
          This part of the kitchen is RESTRICTED
        </h1>
        <p className="mb-6 text-stone-500">
          {hasCashierAccess
            ? 'This account is restricted to Point of Sale. Sign in with an admin account to open the Admin UI.'
            : 'Sign in with your admin account to reach this page.'}
        </p>
        <div className="flex flex-col gap-3">
          {isAuthed && hasCashierAccess && (
            <button
              onClick={() => navigate('/pos', { replace: true })}
              className="w-full rounded-lg border border-brand-300 bg-white py-2.5 font-medium text-brand-700 transition-colors hover:bg-brand-50"
            >
              Back to Current Page
            </button>
          )}
          {(!isAuthed || (isAuthed && !hasAdminAccess)) && (
            <button
              onClick={handleSignIn}
              className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
            >
              Sign in to Admin
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 404 Page ──
function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FBF6EF] px-6">
      <div className="w-full max-w-sm text-center">
        <CakeSliceIcon className="mx-auto mb-6 h-14 w-14 rotate-12 text-brand-600" />
        <p className="mb-1 text-sm tracking-wide text-stone-400">Error 404</p>
        <h1 className="mb-3 text-2xl font-semibold text-stone-800">
          This page isn't on the menu
        </h1>
        <p className="mb-8 text-stone-500">
          The page you're looking for has been moved or doesn't exist.
        </p>
        <button
          onClick={() => navigate('/onlineOrdering/home', { replace: true })}
          className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
        >
          Back to shop
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <Routes>
          {/* ── ROOT: default papuntang online ordering home ── */}
          {/* Ito na ang isesend natin sa customers, hindi na /login. */}
          <Route path="/" element={<Navigate to={'/onlineOrdering/home'} replace />} />

          {/* ── AUTHENTICATION ── */}
          {/* GuestRoute: kung may session ka na, hindi ka makakarating dito */}
          <Route path="/login" element={<GuestRoute><LoginRoute /></GuestRoute>} />

          {/* ── INVENTORY (Private) ── */}
          <Route path="/inventory" element={<ProtectedAdminRoute><InventoryPage /></ProtectedAdminRoute>} />

          {/* ── ALL ORDERS (Private) — BAGO ── */}
          <Route path="/orders" element={<ProtectedAdminRoute><AllOrdersPage /></ProtectedAdminRoute>} />

          {/* ── POINT OF SALE (Standalone private route) ── */}
          <Route path="/pos" element={<ProtectedPosRoute />} />

          {/* ── ANALYTICS PAGES (Private) ── */}
          <Route path="/analytics" element={<ProtectedAdminRoute><AnalyticsPage /></ProtectedAdminRoute>} />

           {/* ── PRODUCT & EVENT MANAGEMENT (Private) ── */}
          {/* "/*" wildcard para pumasok din ang "/productAndEvent/events" tab route */}
          <Route path="/productAndEvent/*" element={<ProtectedAdminRoute><ProductAndEventPage /></ProtectedAdminRoute>} />

          {/* ── SETTINGS (Private) — BAGO ── */}
          <Route path="/settings" element={<ProtectedAdminRoute><SettingsPage /></ProtectedAdminRoute>} />

          {/* ── DAGDAG: Explicit redirect kapag eksaktong "/onlineOrdering" lang ang tinype ── */}
          <Route path="/onlineOrdering" element={<Navigate to="/onlineOrdering/home" replace />} />
          
          {/* ── YUNG ORIGINAL MO: Sasalo sa /onlineOrdering/home, /menu, /checkout, etc. ── */}
          <Route path="/onlineOrdering/*" element={<OnlineOrderingPage />} />

           <Route path="/eventads" element={<EventAdsModal />} />

          {/* ── 401 (BAGO) ── */}
          <Route path="/unauthorized" element={<Unauthorized />} />

          {/* ── 404 ── */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </AppProvider>
  );
}
