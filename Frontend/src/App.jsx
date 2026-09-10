import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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

import { ToastProvider } from './components/ui/index.jsx';
import { Layout } from './components/Sidebar.jsx';
import { AppProvider, useApp } from './context/AppContext.jsx'; // <-- useApp ADDED

function ProtectedAdminRoute({ children }) {
  const isAuthenticated = !!localStorage.getItem('isLoggedIn'); 
  const navigate = useNavigate();

  if (!isAuthenticated) {
    // BAGO: kapag diretsong tinype ang isang protected route (hal. "/inventory")
    // nang hindi pa naka-login, "/unauthorized" na ang lalabas, hindi na
    // deretsong "/login" — para malinaw sa user na bawal siyang pumunta doon.
    return <Navigate to="/unauthorized" replace />;
  }

  const handleLogout = async () => {
    try {
      await authService.logout(); // Hindi na kailangang ipasa ang getToken()
    } finally {
      localStorage.removeItem('isLoggedIn'); // matiks palaging ma-clear kahit mag-fail ang API call
      localStorage.removeItem('admin');
      navigate('/login', { replace: true });
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
  const isAuthenticated = !!localStorage.getItem('isLoggedIn');

  if (isAuthenticated) {
    return <Navigate to="/analytics" replace />;
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

  const handleLogin = () => {
    login();               // i-sync ang AppContext (triggers fetchAll)
    navigate('/analytics');
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

          {/* ── POINT OF SALE (Private) */}
          <Route path="/pos" element={<ProtectedAdminRoute><PosPage /></ProtectedAdminRoute>} /> {/* <-- IDAGDAG ITO */}

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