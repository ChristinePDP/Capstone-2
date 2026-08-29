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
    <div className="space-y-6">

      <div className="w-full overflow-x-auto scrollbar-hide">
        {/* Sa mobile: w-full para sakop ang buong screen. Sa desktop: md:w-max para sumiksik sa kaliwa. */}
        <div className="flex gap-1 bg-brand-100 rounded-xl p-1 w-full md:w-max border border-brand-200">
          <button
            onClick={() => goToTab('products')}
            className={`flex-1 md:flex-none px-3 sm:px-6 py-2.5 rounded-lg text-[12px] sm:text-sm font-bold transition-all whitespace-nowrap text-center ${
              activeTab === 'products'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-brand-500 hover:text-brand-800'
            }`}
          >
            Product Management
          </button>
          <button
            onClick={() => goToTab('events')}
            className={`flex-1 md:flex-none px-3 sm:px-6 py-2.5 rounded-lg text-[12px] sm:text-sm font-bold transition-all whitespace-nowrap text-center ${
              activeTab === 'events'
                ? 'bg-white text-brand-900 shadow-sm'
                : 'text-brand-500 hover:text-brand-800'
            }`}
          >
            Event Manager
          </button>
        </div>
      </div>

      <div className="pt-2">
        {/* "Promo Bundle" ay isa na lang na entry sa loob ng tab strip ng
            Product Catalog / Promo Bundles (tingnan ang CategoryTabs sa
            productManagement.jsx at PromoBundles.jsx) — dito lang pinipili
            kung alin sa dalawang page ang ipapakita batay sa URL. */}
        {activeTab === 'products' && (
          <>
            {/* Nakapirming heading + buttons: hindi na ito bahagi ng
                ProductManagementPage/PromoBundles kaya hindi na ito
                nagbabago o nawawala kada lipat ng sub-tab. */}
            <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold text-[#3B1F0A]">Product Catalog</h1>
                <p className="text-xs sm:text-sm text-[#8A7264] mt-1">
                  Manage products, pricing, promo bundles, and daily order limits
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAddProduct}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-xs sm:text-sm px-5 py-2.5 bg-[#3B1F0A] text-white hover:bg-[#2A1608] shadow-md transition-colors"
                >
                  <Plus size={16} /> Add Product
                </button>
                <button
                  onClick={handleAddBundle}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-xs sm:text-sm px-5 py-2.5 bg-[#3B1F0A] text-white hover:bg-[#2A1608] shadow-md transition-colors"
                >
                  <Plus size={16} /> Add Bundle
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