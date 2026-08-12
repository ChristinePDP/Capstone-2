import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import * as authService from './services/authService';

import LoginPage from './pages/LoginPage';
import InventoryPage from './pages/InventoryPage';
import AnalyticsPage from './pages/analyticsPage';
import OnlineOrderingPage from './pages/onlineOrderingPage';
import AllOrdersPage from './pages/AllOrdersPage'; // <-- ADDED
import ProductModal from './components/onlineOrdering/Productmodal';
import QrScanner from './components/onlineOrdering/MobileScanner';
import OccasionManager from './components/onlineOrdering/OccasionManager';
import EventAdsModal from './components/onlineOrdering/eventAdsModal';

import { ToastProvider } from './components/ui/index';
import { Layout } from './components/Sidebar';
import { AppProvider } from './context/AppContext';

function ProtectedAdminRoute({ children }) {
  // Tinitingnan lang natin ang UI flag, ang tunay na auth validation ay sa backend na mangyayari
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
  const navigate = useNavigate();

  return (
    <AppProvider>
      <ToastProvider>
        <Routes>
          {/* ── ROOT: papuntang login o inventory depende sa session ── */}
          <Route path="/" element={<Navigate to={'/login'} replace />} />

          {/* ── AUTHENTICATION ── */}
          <Route path="/login" element={<LoginPage onLogin={() => navigate('/inventory')} />} />

          {/* ── INVENTORY (Private) ── */}
          <Route path="/inventory" element={<ProtectedAdminRoute><InventoryPage /></ProtectedAdminRoute>} />

          {/* ── ALL ORDERS (Private) — BAGO ── */}
          <Route path="/orders" element={<ProtectedAdminRoute><AllOrdersPage /></ProtectedAdminRoute>} />

          {/* ── ANALYTICS PAGES (Private) ── */}
          <Route path="/analytics" element={<ProtectedAdminRoute><AnalyticsPage /></ProtectedAdminRoute>} />
          
          {/* ── DAGDAG: Explicit redirect kapag eksaktong "/onlineOrdering" lang ang tinype ── */}
          <Route path="/onlineOrdering" element={<Navigate to="/onlineOrdering/home" replace />} />
          
          {/* ── YUNG ORIGINAL MO: Sasalo sa /onlineOrdering/home, /menu, /checkout, etc. ── */}
          <Route path="/onlineOrdering/*" element={<OnlineOrderingPage />} />
          <Route path="/productmodal" element={<ProductModal />} />
          <Route path="/qr" element={<QrScanner />} />

          <Route path="/occasions" element={<OccasionManager />} />
           <Route path="/eventads" element={<EventAdsModal />} />

          {/* ── 404 ── */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </AppProvider>
  );
}