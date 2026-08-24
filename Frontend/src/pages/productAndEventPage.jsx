import { useLocation, useNavigate } from 'react-router-dom';

// I-import ang dalawang existing files mo.
// Ayusin mo na lang ang path (e.g., '../components/...') depende sa folder structure mo.
import ProductManagementPage from '../components/productAndEvent/productManagement';
import EventManager from '../components/productAndEvent/EventManager';
import PromoBundles from '../components/productAndEvent/PromoBundles';

export default function ProductAndEventPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Ang route na talagang naka-register sa App.jsx ay "/productAndEvent"
  // (may "/*" wildcard para pumasok din ang sub-path). Default sa "products"
  // ang base path mismo, "/productAndEvent/events" ang Events tab, at
  // "/productAndEvent/bundles" naman ang bagong Promo Bundles tab.
  const activeTab = pathname.endsWith('/events')
    ? 'events'
    : pathname.endsWith('/bundles')
      ? 'bundles'
      : 'products';

  const goToTab = (tab) => {
    if (tab === 'events') navigate('/productAndEvent/events');
    else if (tab === 'bundles') navigate('/productAndEvent/bundles');
    else navigate('/productAndEvent');
  };

  return (
    <div className="space-y-6">

      {/* Tabs Navigation — same pill style, font, at colors gaya ng Inventory page.
          Wala nang page-level na <h1> dito dahil nasa Header na yung title.
          Naka-wrap sa sarili niyang scroll strip (max-w-full overflow-x-auto)
          para kahit hindi kumasya ang dalawang label sa pinakamaliit na phone,
          doon lang mag-sscroll ang tabs mismo — hindi na ito nagtutulak ng
          buong page palabas ng screen. */}
      <div className="max-w-full overflow-x-auto">
        <div className="flex gap-1 bg-brand-100 rounded-xl p-1 w-max border border-brand-200">
          <button
            onClick={() => goToTab('products')}
            className={`px-4 sm:px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === 'products'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-brand-500 hover:text-brand-800'
            }`}
          >
            Product Management
          </button>
          <button
            onClick={() => goToTab('events')}
            className={`px-4 sm:px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === 'events'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-brand-500 hover:text-brand-800'
            }`}
          >
            Event Manager
          </button>
          <button
            onClick={() => goToTab('bundles')}
            className={`px-4 sm:px-6 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === 'bundles'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-brand-500 hover:text-brand-800'
            }`}
          >
            Promo Bundles
          </button>
        </div>
      </div>

      {/* Dynamic Tab Rendering (Tinatawag yung mga hiwalay mong components) */}
      <div className="pt-2">
        {activeTab === 'products' && <ProductManagementPage />}
        {activeTab === 'events' && <EventManager />}
        {activeTab === 'bundles' && <PromoBundles />}
      </div>

    </div>
  );
}