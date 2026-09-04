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
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try {
      await authService.logout(); // Hindi na kailangang ipasa ang getToken()
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return <Layout onLogout={handleLogout}>{children}</Layout>;
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
function LoginRoute() {
  const navigate = useNavigate();
  const { login } = useApp();

  const handleLogin = () => {
    login();               // i-sync ang AppContext (triggers fetchAll)
    navigate('/inventory');
  };

  return <LoginPage onLogin={handleLogin} />;
}

// ── 404 Page ──
function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center bg-stone-50">
      <h1 className="text-4xl font-bold text-red-500 mb-2">404</h1>
      <h2 className="text-2xl font-semibold text-stone-800 mb-4">Page Not Found</h2>
      <p className="text-stone-500 mb-6">Sorry, the page you are looking for does not exist.</p>
      <button
        onClick={() => window.location.href = '/'}
        className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-bold"
      >
        Go Back Home
      </button>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <Routes>
          {/* ── ROOT: papuntang login o inventory depende sa session ── */}
          <Route path="/" element={<Navigate to={'/login'} replace />} />

          {/* ── AUTHENTICATION ── */}
          <Route path="/login" element={<LoginRoute />} />

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

          {/* ── 404 ── */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </AppProvider>
  );
}
