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

function PosStandaloneLayout({ children, onLogout }) {
  return (
    <div className="h-[100dvh] w-full overflow-hidden bg-brand-50 flex flex-col">
      <header className="h-14 shrink-0 bg-white border-b border-brand-200 px-3 md:px-5 flex items-center justify-between gap-3">
        <div className="flex items-center min-w-0 gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-800 text-white flex items-center justify-center font-serif font-bold text-sm shrink-0">
            A
          </div>
          <div className="min-w-0">
            <p className="text-sm md:text-base font-bold text-brand-800 leading-tight truncate">Aileen Cake Max</p>
            <p className="text-[9px] md:text-[10px] uppercase tracking-[0.18em] text-brand-400 font-semibold">Point of Sale</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="px-3 py-2 rounded-lg bg-brand-800 text-white text-xs md:text-sm font-semibold hover:bg-brand-900 transition-colors"
        >
          Logout
        </button>
      </header>
      <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
    </div>
  );
}

function ProtectedPosRoute() {
  const { isAuthed, authReady, authError, retryAuth, logout } = useApp();
  const location = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  if (!authReady) return null;

  if (!isAuthed) {
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
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
      sessionStorage.removeItem('aileen_cake_max_pos_checkout_reservation_id');
      window.location.replace('/login');
    }
  };

  return (
    <>
      <PosStandaloneLayout onLogout={() => setShowLogoutConfirm(true)}>
        <PosPage standalone />
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

  if (!authReady) {
    return null;
  }

  if (!isAuthed) {
    // BAGO: kapag diretsong tinype ang isang protected route (hal. "/inventory")
    // nang hindi pa naka-login, "/unauthorized" na ang lalabas, hindi na
    // deretsong "/login" — para malinaw sa user na bawal siyang pumunta doon.
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
    return <Navigate to={savedWorkspace === 'pos' ? '/pos' : '/analytics'} replace />;
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

  const handleLogin = (_admin, workspace) => {
    login();               // i-sync ang AppContext (triggers fetchAll)
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FBF6EF] px-6">
      <div className="w-full max-w-sm text-center">
        <CakeSliceIcon className="mx-auto mb-6 h-14 w-14 text-brand-600" />
        <p className="mb-1 text-sm tracking-wide text-stone-400">Error 401</p>
        <h1 className="mb-3 text-2xl font-semibold text-stone-800">
          This part of the kitchen is RESTRICTED
        </h1>
        <p className="mb-8 text-stone-500">
          Sign in with your admin account to reach this page.
        </p>
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="w-full rounded-lg bg-brand-600 py-2.5 font-medium text-white transition-colors hover:bg-brand-700"
        >
          Sign in
        </button>
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
