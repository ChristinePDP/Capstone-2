import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Edit2, Trash2, X, Search, Package, Loader2 } from 'lucide-react';
import ProductModal from './Productmodal';
import { apiClient } from '../../services/apiClient';
import { BundleCard, BUNDLES_API, clearBundlesPageCache } from './PromoBundles';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/online-ordering/products`;

let productsCache = null;
let productsCachePromise = null;

async function fetchProductsFromApi(force = false) {
  if (productsCache && !force) return productsCache;
  if (productsCachePromise && !force) return productsCachePromise;

  productsCachePromise = (async () => {
    try {
      const res = await apiClient.get(API_BASE);
      const data = unwrapData(res.data, 'Something went wrong. Please try again.');
      productsCache = data || [];
      return productsCache;
    } finally {
      productsCachePromise = null;
    }
  })();

  return productsCachePromise;
}

// Hiwalay, magaan na cache — mga bundle lang (kasama na ang naka-embed nilang
// products mula sa API) na ginagamit lang dito para maipakita sa "All" view.
// Hindi ito kapareho ng buong-page cache sa PromoBundles.jsx (na may kasamang
// allProducts + events pa, kailangan ng edit form doon).
let bundlesListCache = null;
let bundlesListCachePromise = null;

async function fetchBundlesListFromApi(force = false) {
  if (bundlesListCache && !force) return bundlesListCache;
  if (bundlesListCachePromise && !force) return bundlesListCachePromise;

  bundlesListCachePromise = (async () => {
    try {
      const res = await fetch(BUNDLES_API);
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.success === false) {
        throw new Error(result.message || result.error || 'Something went wrong. Please try again.');
      }
      bundlesListCache = result.data || [];
      return bundlesListCache;
    } finally {
      bundlesListCachePromise = null;
    }
  })();

  return bundlesListCachePromise;
}

const CATEGORIES = ['All', 'Cake', 'Pastry', 'Package', 'Celebration Material'];

// Parehong list ng CATEGORIES pero may dagdag na "Promo Bundle" shortcut sa
// pagitan ng "All" at ng ibang category — ito lang ang pagkakaiba sa display,
// hindi nito ginagalaw ang CATEGORIES na ginagamit sa filtering logic.
const TAB_ITEMS = ['All', 'Promo Bundle', 'Pastry', 'Cake', 'Package', 'Celebration Material'];

const getErrMsg = (err, fallback) =>
  err.response?.data?.message || err.response?.data?.error || err.message || fallback;

const unwrapData = (result, fallback) => {
  if (result?.success === false) {
    throw new Error(result.message || result.error || fallback);
  }
  return result?.data;
};

// ─────────────────────────────────────────────────────────────
// Minimal inline UI primitives
// ─────────────────────────────────────────────────────────────
function Button({ variant = 'primary', className = '', children, ...props }) {
  const variants = {
    dark: 'bg-[#3B1F0A] text-white hover:bg-[#2A1608] shadow-md',
    secondary: 'bg-white text-[#5A453C] border border-[#DED4CC] hover:bg-[#F5EFEB]',
    danger: 'text-red-600 bg-red-50 hover:bg-red-100',
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-xs px-5 py-2.5 transition-colors ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function SearchBar({ value, onChange, placeholder, className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A7264]" />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3.5 py-2.5 text-xs border border-[#DED4CC] rounded-xl outline-none focus:border-[#5A453C] bg-white transition-colors placeholder:text-gray-400"
      />
    </div>
  );
}

function CategoryTabs({ options, value, onChange, onPromoBundleClick }) {
  return (
    <div className="flex items-center gap-5 sm:gap-7 flex-wrap border-b border-[#EAE4E0]">
      {options.map(opt => {
        const isPromo = opt === 'Promo Bundle';
        const active = !isPromo && value === opt;
        return (
          <button
            key={opt}
            onClick={() => (isPromo ? onPromoBundleClick() : onChange(opt))}
            className={`relative pb-2.5 text-xs sm:text-sm font-semibold tracking-wide whitespace-nowrap transition-colors ${
              active ? 'text-[#3B1F0A]' : 'text-[#8A7264] hover:text-[#3B1F0A]'
            }`}
          >
            {opt}
            {active && (
              <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[#3B1F0A] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// Locks background page scroll while a modal is open. Without this, scrolling
// inside the modal (or over the backdrop) also scrolls the page behind it —
// the overlay alone doesn't stop that. Restores the exact scroll position on
// close so the page doesn't jump.
function useLockBodyScroll(isOpen) {
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    const { overflow, position, top, width } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = overflow;
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.width = width;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);
}

function Modal({ isOpen, onClose, title, footer, children }) {
  useLockBodyScroll(isOpen);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1108]/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-[#EAE4E0]">
        <div className="flex items-center justify-between px-7 py-5 border-b border-[#EAE4E0] bg-white shrink-0">
          <h2 className="text-xl font-bold text-[#3B1F0A]">{title}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-7 py-6 overflow-y-auto">{children}</div>
        {footer && <div className="px-7 py-4 border-t border-[#EAE4E0] bg-white shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm' }) {
  useLockBodyScroll(isOpen);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1108]/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm border border-[#EAE4E0] p-6">
        <h2 className="text-lg font-bold text-[#3B1F0A] mb-2">{title}</h2>
        <p className="text-xs text-[#8A7264] mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function useToast() {
  const [toast, setToast] = useState(null);
  const show = (message, variant = 'success') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 2500);
  };
  return { toast, show };
}

// ─────────────────────────────────────────────────────────────
// Product Card
// ─────────────────────────────────────────────────────────────
function ProductCard({ product, onEdit, onDelete }) {
  const dailyLimit = product.dailyLimit ?? product.daily_limit ?? 0;
  const imageUrl = product.image || product.image_url;
  const isVariablePricing = product.pricing_mode === 'variable';

  return (
    <div className="bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden shadow-sm flex flex-col h-full min-w-0">
      {/* Pinaliit nang konti ang height sa mobile para hindi mukhang humahaba */}
      <div className="relative h-28 sm:h-36 bg-[#F5EFEB] overflow-hidden shrink-0 flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <Package size={28} className="text-[#DED4CC]" />
        )}
        <div className="absolute top-2 left-2">
          <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest bg-white text-[#3B1F0A] px-2 py-1 rounded-full shadow-sm">
            {product.category}
          </span>
        </div>
        {dailyLimit > 0 && (
          <div className="absolute top-2 right-2">
            <span className="text-[9px] sm:text-[10px] font-bold bg-[#3B1F0A] text-white px-2 py-1 rounded-full shadow-sm">
              Limit: {dailyLimit}/day
            </span>
          </div>
        )}
      </div>

      {/* Adjust padding for 2-column mobile */}
      <div className="p-3 sm:p-4 flex flex-col flex-grow">
        <p className="font-bold text-[#3B1F0A] text-xs sm:text-sm mb-1 truncate">{product.name}</p>

        <p className="text-[10px] sm:text-[11px] text-[#8A7264] mb-3 truncate leading-relaxed">
          {product.inclusion ? product.inclusion.replace(/\n/g, ' · ') : '\u00A0'}
        </p>

        <div className="mt-auto">
          {isVariablePricing && (
            <span className="text-[9px] sm:text-[10px] font-bold text-[#8A7264] uppercase tracking-wider block mb-0.5">
              Starting at
            </span>
          )}
          <p className="text-sm sm:text-[15px] font-extrabold text-[#3B1F0A]">
            ₱{Number(product.price).toLocaleString()}.00
          </p>
        </div>
      </div>

      <div className="flex border-t border-[#EAE4E0] shrink-0">
        <button
          onClick={() => onEdit(product)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-[#8A7264] hover:bg-[#F5EFEB] hover:text-[#3B1F0A] transition-colors"
        >
          <Edit2 size={12} className="sm:w-[13px] sm:h-[13px]" />Edit
        </button>
        <div className="w-px bg-[#EAE4E0]" />
        <button
          onClick={() => onDelete(product)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 sm:py-2.5 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={12} className="sm:w-[13px] sm:h-[13px]" />Delete
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
export default function ProductManagementPage({ autoOpenAdd = false, onAutoOpenHandled } = {}) {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [bundles, setBundles] = useState([]);
  const [bundlesLoading, setBundlesLoading] = useState(true);
  const [deleteBundleTarget, setDeleteBundleTarget] = useState(null);

  const { toast, show: showToast } = useToast();
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchProducts = async (force = false) => {
    if (force || products.length === 0) setIsLoading(true);
    setError(null);
    try {
      const data = await fetchProductsFromApi(force);
      setProducts(data);
    } catch (err) {
      console.error('Fetch Products Error:', err);
      setError(getErrMsg(err, 'Something went wrong. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch ng bundles para maisama sa "All" view. Hiwalay ito sa error state
  // ng products — kung mabigo lang ang bundles, huwag hadlangan ang buong
  // page (mananatiling makikita pa rin ang products).
  const fetchBundles = async (force = false) => {
    if (force || bundles.length === 0) setBundlesLoading(true);
    try {
      const data = await fetchBundlesListFromApi(force);
      setBundles(data);
    } catch (err) {
      console.error('Fetch Bundles Error:', err);
    } finally {
      setBundlesLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchBundles();
  }, []);

  const filtered = products.filter(p => {
    const catOk = category === 'All' || p.category === category;
    const searchOk = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk;
  });

  // Bundles ay wala talagang iisang product category, kaya doon lang sila
  // isinasama sa grid kapag "All" ang napili — sa ibang category tab
  // (Cake, Pastry, atbp.) ay products lang gaya ng dati.
  const filteredBundles = category === 'All'
    ? bundles.filter(b => !search || (b.bundle_name || '').toLowerCase().includes(search.toLowerCase()))
    : [];

  const handleEdit = (product) => { setEditProduct(product); setModalOpen(true); };
  const handleAdd = () => { setEditProduct(null); setModalOpen(true); };
  const handleCloseModal = () => { setModalOpen(false); setEditProduct(null); };

  // Pinapayagan ang parent (ProductAndEventPage) na buksan ang "Add Product"
  // modal mula sa nakapirming header nito, kahit saang sub-tab pa ito
  // itinuturo pabalik.
  useEffect(() => {
    if (autoOpenAdd) {
      handleAdd();
      onAutoOpenHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAdd]);

  const handleSaveSuccess = async () => {
    await fetchProducts(true);
    showToast(editProduct?.id ? 'Product updated.' : 'Product added.');
  };

  const handleDelete = (product) => setDeleteTarget(product);

  const confirmDelete = async () => {
    try {
      const res = await apiClient.delete(`${API_BASE}/${deleteTarget.id}`);
      unwrapData(res.data, 'Failed to delete product.');
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
      if (productsCache) productsCache = productsCache.filter(p => p.id !== deleteTarget.id);
      showToast(`${deleteTarget.name} deleted.`, 'warning');
    } catch (err) {
      console.error('Delete Product Error:', err);
      showToast(getErrMsg(err, 'Failed to delete product.'), 'warning');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleModalDelete = async (id) => {
    try {
      const res = await apiClient.delete(`${API_BASE}/${id}`);
      unwrapData(res.data, 'Failed to delete product.');
      setProducts(prev => prev.filter(p => p.id !== id));
      if (productsCache) productsCache = productsCache.filter(p => p.id !== id);
      showToast('Product deleted.', 'warning');
      handleCloseModal();
    } catch (err) {
      console.error('Delete Product Error:', err);
      showToast(getErrMsg(err, 'Failed to delete product.'), 'warning');
    }
  };

  // Pag-edit ng isang bundle mula dito, punta muna tayo sa Promo Bundles
  // tab kung saan handa na ang allProducts/events na kailangan ng edit
  // form; ipinapasa lang ang target bundle id para awtomatikong bumukas
  // doon ang tamang Edit modal.
  const handleEditBundle = (bundle) => {
    navigate('/productAndEvent/bundles', { state: { editBundleId: bundle.id } });
  };

  const handleDeleteBundle = (bundle) => setDeleteBundleTarget(bundle);

  const confirmDeleteBundle = async () => {
    try {
      const res = await fetch(`${BUNDLES_API}/${deleteBundleTarget.id}`, { method: 'DELETE' });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.success === false) {
        throw new Error(result.message || result.error || 'Failed to delete bundle.');
      }
      setBundles(prev => prev.filter(b => b.id !== deleteBundleTarget.id));
      if (bundlesListCache) bundlesListCache = bundlesListCache.filter(b => b.id !== deleteBundleTarget.id);
      clearBundlesPageCache(); // sariwa ang datos pag-balik sa Promo Bundles tab
      showToast(`${deleteBundleTarget.bundle_name} deleted.`, 'warning');
    } catch (err) {
      console.error('Delete Bundle Error:', err);
      showToast(err.message || 'Failed to delete bundle.', 'warning');
    } finally {
      setDeleteBundleTarget(null);
    }
  };

  return (
    <div className="overflow-x-hidden w-full max-w-full">
      <style>{`html { overflow-y: scroll; }`}</style>

      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-[#3B1F0A] text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-4 mb-6">
        <SearchBar value={search} onChange={setSearch} placeholder="Search product..." className="w-full sm:w-64" />
        <CategoryTabs
          options={TAB_ITEMS}
          value={category}
          onChange={setCategory}
          onPromoBundleClick={() => navigate('/productAndEvent/bundles')}
        />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-2 text-xs text-[#8A7264] bg-white rounded-2xl border border-[#EAE4E0]">
          <Loader2 size={18} className="animate-spin" />
          Loading products...
        </div>
      ) : (
        /* Naayos na Grid Classes: default 2 columns sa mobile, gap ay 3 sa mobile at 5 sa tablet/desktop */
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-5">
          {filtered.map(p => (
            <ProductCard key={p.id} product={p} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
          {/* Isinasama ang mga Promo Bundle sa "All" view — sa hulihan ng
              listahan, pagkatapos ng lahat ng regular na product. */}
          {filteredBundles.map(b => (
            <BundleCard key={`bundle-${b.id}`} bundle={b} onEdit={handleEditBundle} onDelete={handleDeleteBundle} />
          ))}
          {!filtered.length && !filteredBundles.length && (
            <div className="col-span-full text-center py-20 text-[#8A7264] text-xs bg-white rounded-2xl border border-[#EAE4E0]">
              No products found.
            </div>
          )}
        </div>
      )}

      <ProductModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        product={editProduct}
        onSaveSuccess={handleSaveSuccess}
        onDelete={handleModalDelete}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Product"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
      />

      <ConfirmModal
        isOpen={!!deleteBundleTarget}
        onClose={() => setDeleteBundleTarget(null)}
        onConfirm={confirmDeleteBundle}
        title="Delete Bundle"
        message={`Are you sure you want to delete "${deleteBundleTarget?.bundle_name}"? This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}