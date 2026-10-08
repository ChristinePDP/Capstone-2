import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import ProductManagementPage from '../components/productAndEvent/productManagement';
import EventManager from '../components/productAndEvent/EventManager';
import PromoBundles from '../components/productAndEvent/PromoBundles';

export default function ProductAndEventPage() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Top-level tab: 'products' (Product Management) o 'events' (Event Manager).
  // Ang dating 'bundles' na sarili niyang top-level tab ay hindi na top-level —
  // ngayon ay sub-tab na ito sa loob ng 'products' (tingnan sa baba).
  const activeTab = pathname.endsWith('/events') ? 'events' : 'products';

  // Sub-tab (sa loob lang ng Product Management): 'catalog' o 'bundles'.
  const activeSubTab = pathname.endsWith('/bundles') ? 'bundles' : 'catalog';

  const goToTab = (tab) => {
    if (tab === 'events') navigate('/productAndEvent/events');
    else navigate('/productAndEvent');
  };

  // "Add Product" / "Add Bundle" ay parehong buttons na nakapirmi dito sa
  // header (hindi na sa loob ng bawat sub-page), kaya hindi na ito
  // nagbabago/nawawala kada lipat ng "Product Catalog" <-> "Promo Bundles"
  // sub-tab. Kung naka-tapat ang user sa kabilang sub-tab pag pinindot niya
  // ang isang button, lilipat muna dito papunta sa tamang sub-tab bago
  // buksan ang "Add" modal ng target page (via autoOpenAdd prop).
  const [pendingAdd, setPendingAdd] = useState(null); // null | 'product' | 'bundle'

  const handleAddProduct = () => {
    setPendingAdd('product');
    if (activeSubTab !== 'catalog') navigate('/productAndEvent');
  };

  const handleAddBundle = () => {
    setPendingAdd('bundle');
    if (activeSubTab !== 'bundles') navigate('/productAndEvent/bundles');
  };

  const clearPendingAdd = () => setPendingAdd(null);

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">

      {/* Parehong tab design ng Inventory page: full width sa mobile, compact sa desktop */}
      <div className="grid grid-cols-2 sm:flex gap-1 bg-brand-100 rounded-xl p-1 w-full sm:w-fit border border-brand-200">
          <button
            onClick={() => goToTab('products')}
            className={`px-2 sm:px-6 py-2.5 rounded-lg text-[13px] sm:text-sm font-bold transition-all whitespace-nowrap text-center outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
              activeTab === 'products'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-brand-500 hover:text-brand-800'
            }`}
          >
            Product Management
          </button>
          <button
            onClick={() => goToTab('events')}
            className={`px-2 sm:px-6 py-2.5 rounded-lg text-[13px] sm:text-sm font-bold transition-all whitespace-nowrap text-center outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${
              activeTab === 'events'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-brand-500 hover:text-brand-800'
            }`}
          >
            Event Manager
          </button>
      </div>

      <div className="pt-1 sm:pt-2 min-w-0">
        {/* "Promo Bundle" ay isa na lang na entry sa loob ng tab strip ng
            Product Catalog / Promo Bundles (tingnan ang CategoryTabs sa
            productManagement.jsx at PromoBundles.jsx) — dito lang pinipili
            kung alin sa dalawang page ang ipapakita batay sa URL. */}
        {activeTab === 'products' && (
          <>
            {/* Nakapirming heading + buttons: hindi na ito bahagi ng
                ProductManagementPage/PromoBundles kaya hindi na ito
                nagbabago o nawawala kada lipat ng sub-tab. */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 sm:mb-6 gap-3 sm:gap-4">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-[#3B1F0A]">Product Catalog</h1>
                <p className="text-xs sm:text-sm text-[#8A7264] mt-1">
                  Manage products, pricing, promo bundles, and daily order limits
                </p>
              </div>
              <div className="grid grid-cols-2 sm:flex items-center gap-2 sm:gap-3">
                <button
                  onClick={handleAddProduct}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-xs sm:text-sm px-3 sm:px-5 py-2.5 bg-[#3B1F0A] text-white hover:bg-[#2A1608] shadow-md transition-colors whitespace-nowrap"
                >
                  <Plus size={16} /> Add Product
                </button>
                <button
                  onClick={handleAddBundle}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-xs sm:text-sm px-3 sm:px-5 py-2.5 bg-[#3B1F0A] text-white hover:bg-[#2A1608] shadow-md transition-colors whitespace-nowrap"
                >
                  <Plus size={16} /> <span className="sm:hidden">Package/Bundle</span><span className="hidden sm:inline">Add Package/Bundle</span>
                </button>
              </div>
            </div>

            {activeSubTab === 'bundles' ? (
              <PromoBundles autoOpenAdd={pendingAdd === 'bundle'} onAutoOpenHandled={clearPendingAdd} />
            ) : (
              <ProductManagementPage autoOpenAdd={pendingAdd === 'product'} onAutoOpenHandled={clearPendingAdd} />
            )}
          </>
        )}
        {activeTab === 'events' && <EventManager />}
      </div>

    </div>
  );
}