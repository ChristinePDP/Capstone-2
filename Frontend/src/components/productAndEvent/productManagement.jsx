import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Edit2, Trash2, X, Search, Package, Loader2 } from 'lucide-react';
import ProductModal from './Productmodal';
import { apiClient } from '../../services/apiClient';
import { BundleCard, BundleFormModal, BUNDLES_API, clearBundlesPageCache, fetchBundlesPageFromApi } from './PromoBundles';
import { getBundleDeleteImpact } from './bundleDeleteContent';

const PRODUCTS_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/online-ordering/products`;
// Admin list lang ang /catalog (GET). Ang delete/edit ay nasa /products/:id — hindi /catalog/:id.
const API_BASE = `${PRODUCTS_BASE}/catalog`;

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
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-[#EAE4E0] p-6">
        <h2 className="text-xl font-bold text-[#3B1F0A] mb-3 leading-snug">{title}</h2>
        <p className="text-sm text-[#8A7264] mb-5 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

function BundleDeleteTitle({ bundle }) {
  if (!bundle) return <>Are you sure you want to delete this Bundle?</>;
  const entity = bundle.category === 'Package' ? 'Package' : 'Bundle';
  return <>Are you sure you want to delete the {entity} <span className="font-extrabold text-red-700">"{bundle.bundle_name}"</span>?</>;
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
  const missingFormula = product.category !== 'Celebration Material'
    && product.has_production_formula === false;
  const isInactive = product.is_active === false;

  return (
    <div className={`bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden shadow-sm flex flex-col h-full min-w-0`}>
      {/* Pinaliit nang konti ang height sa mobile para hindi mukhang humahaba */}
      <div className={`@container relative h-28 sm:h-36 bg-[#F5EFEB] overflow-hidden shrink-0 flex items-center justify-center ${isInactive ? 'opacity-60 grayscale' : ''}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <Package size={28} className="text-[#DED4CC]" />
        )}
        {/* Hindi magpapatungan ang category at ang limit: kapag may sapat na lapad ang card (190px+), magkatabi sila
            at ang category ay pwedeng mag-wrap sa dalawang linya ("Celebration / Material"); kapag masikip (hal. 2-column sa maliit na phone), patong-patong na. */}
        <div className="absolute top-2 left-2 right-2 flex flex-col items-start gap-1 @min-[190px]:flex-row @min-[190px]:justify-between @min-[190px]:gap-1.5">
          <span className="min-w-0 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider leading-tight bg-white text-[#3B1F0A] px-2 py-1 rounded-xl shadow-sm wrap-break-word">
            {product.category}
          </span>
          {dailyLimit > 0 && (
            <span className="shrink-0 whitespace-nowrap text-[9px] sm:text-[10px] font-bold leading-tight bg-[#3B1F0A] text-white px-2 py-1 rounded-full shadow-sm">
              Limit: {dailyLimit}/day
            </span>
          )}
        </div>
        {isInactive && (
          <span className="absolute left-2 bottom-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider bg-[#5A453C] text-white px-2 py-1 rounded-full shadow-sm">
            Inactive
          </span>
        )}
        {missingFormula && !isInactive && (
          <div className="absolute left-2 right-2 bottom-2">
            <span className="block rounded-lg bg-red-700 px-2 py-1.5 text-[9px] font-bold leading-tight text-white shadow-sm">
              No production formula yet - Cannot appear in POS/Online Ordering
            </span>
          </div>
        )}
      </div>

      {/* Adjust padding for 2-column mobile */}
      <div className={`p-3 sm:p-4 flex flex-col flex-grow ${isInactive ? 'opacity-60 grayscale' : ''}`}>
        <p className="font-bold text-[#3B1F0A] text-xs sm:text-sm mb-1 truncate">{product.name}</p>

        <p className="text-[10px] sm:text-[11px] text-[#8A7264] mb-3 truncate leading-relaxed">
          {product.category === 'Package' && product.package_items?.length > 0
            ? `Includes: ${product.package_items.map(i => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ''}`).join(', ')}`
            : (product.inclusion ? product.inclusion.replace(/\n/g, ' · ') : '\u00A0')}
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
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const [bundles, setBundles] = useState([]);
  const [posAvailabilityById, setPosAvailabilityById] = useState({});
  const [bundlesLoading, setBundlesLoading] = useState(true);
  const [deleteBundleTarget, setDeleteBundleTarget] = useState(null);

  // Edit ng Bundle/Package: bubuksan ang form modal DITO MISMO (hindi na lilipat
  // sa Promo Bundles tab), kaya mananatili ka sa kasalukuyang category/tab.
  const [bundleModal, setBundleModal] = useState({ open: false, bundle: null, allProducts: [], events: [] });
  const [openingBundleId, setOpeningBundleId] = useState(null);

  const { toast, show: showToast } = useToast();
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchProducts = async (force = false, silent = false) => {
    if (!silent && (force || products.length === 0)) setIsLoading(true);
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
  const fetchBundles = async (force = false, silent = false) => {
    if (!silent && (force || bundles.length === 0)) setBundlesLoading(true);
    try {
      const data = await fetchBundlesListFromApi(force);
      setBundles(data);
    } catch (err) {
      console.error('Fetch Bundles Error:', err);
    } finally {
      setBundlesLoading(false);
    }
    try {
      const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000/api`;
      const response = await apiClient.get(`${API_BASE}/pos/products`);
      const availabilityProducts = response.data?.data || [];
      setPosAvailabilityById(Object.fromEntries(availabilityProducts.map(product => [String(product.id), product])));
    } catch (err) {
      console.error('Fetch Package Availability Error:', err);
      setPosAvailabilityById({});
    }
  };

  useEffect(() => {
    fetchProducts(true);
    fetchBundles(true);
  }, []);

  useEffect(() => {
    const handleDataChanged = async (event) => {
      const change = event.detail || {};
      const { table, event: operation, record, recordId } = change;
      const refreshProduct = async (id) => {
        if (!id) return;
        const response = await apiClient.get(API_BASE, { params: { productId: id } });
        const refreshed = unwrapData(response.data, 'Failed to refresh product.') || [];
        const product = refreshed[0];
        setProducts(previous => {
          const next = previous.filter(item => String(item.id) !== String(id));
          if (product) next.push(product);
          return next.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        });
        if (productsCache) {
          productsCache = productsCache.filter(item => String(item.id) !== String(id));
          if (product) productsCache.push(product);
        }
      };
      const refreshBundle = async (id) => {
        if (!id) return;
        if (operation === 'DELETE' && table === 'promo_bundles') {
          setBundles(previous => previous.filter(item => String(item.id) !== String(id)));
          if (bundlesListCache) bundlesListCache = bundlesListCache.filter(item => String(item.id) !== String(id));
          return;
        }
        const response = await fetch(`${BUNDLES_API}/${encodeURIComponent(id)}`, { credentials: 'include' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.success === false || !result.data) throw new Error(result.message || 'Failed to refresh bundle.');
        const bundle = result.data;
        setBundles(previous => previous.some(item => String(item.id) === String(id))
          ? previous.map(item => String(item.id) === String(id) ? bundle : item)
          : [...previous, bundle]);
        if (bundlesListCache) {
          bundlesListCache = bundlesListCache.some(item => String(item.id) === String(id))
            ? bundlesListCache.map(item => String(item.id) === String(id) ? bundle : item)
            : [...bundlesListCache, bundle];
        }
      };

      try {
        if (table === 'products') {
          const id = record?.id || recordId;
          if (!id) return fetchProducts(true, true);
          if (operation === 'DELETE') {
            setProducts(previous => previous.filter(item => String(item.id) !== String(id)));
            if (productsCache) productsCache = productsCache.filter(item => String(item.id) !== String(id));
          } else {
            await refreshProduct(id);
          }
          const dependentBundleIds = bundles
            .filter(bundle => (bundle.product_ids || []).some(productId => String(productId) === String(id))
              || (bundle.package_items || []).some(item => String(item.product_id) === String(id)))
            .map(bundle => bundle.id);
          await Promise.all(dependentBundleIds.map(refreshBundle));
          clearBundlesPageCache();
          return;
        }
        if (table === 'recipes' || table === 'recipe_ingredients') {
          let productId = record?.product_id;
          const recipeId = table === 'recipes' ? (record?.id || recordId) : (record?.recipe_id || change.relatedId);
          if (!productId && recipeId && operation !== 'DELETE') {
            const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || `http://${window.location.hostname}:3000/api`;
            const response = await apiClient.get(`${API_BASE}/inventory/recipes/${encodeURIComponent(recipeId)}`);
            productId = response.data?.data?.product_id;
          }
          if (productId) await refreshProduct(productId);
          return;
        }
        if (table === 'promo_bundles') {
          await refreshBundle(record?.id || recordId);
          clearBundlesPageCache();
          return;
        }
        if (table === 'bundle_products') {
          await refreshBundle(record?.bundle_id || change.relatedId);
          clearBundlesPageCache();
          return;
        }
        if (table === 'occasions') {
          const eventTag = record?.event_tag;
          if (!eventTag) return fetchBundles(true, true);
          const dependentBundleIds = bundles.filter(bundle => bundle.event_tag === eventTag).map(bundle => bundle.id);
          await Promise.all(dependentBundleIds.map(refreshBundle));
          clearBundlesPageCache();
        }
      } catch (err) {
        console.error('Refresh Product Management Record Error:', err);
      }
    };
    window.addEventListener('cake:data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('cake:data-changed', handleDataChanged);
    };
  }, [bundles]);

  const filtered = products.filter(p => {
    const catOk = category === 'All' || p.category === category;
    const searchOk = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk;
  });

  // Sa lahat ng tab (All, Cake, Pastry, atbp.): ang inactive products ay nasa
  // pinakahuli ng listahan (pagkatapos pati ng mga bundle).
  const isInactiveProduct = (p) => p.is_active === false;
  const activeProducts = filtered.filter(p => !isInactiveProduct(p));
  const inactiveProducts = filtered.filter(isInactiveProduct);

  const bundleSearchOk = (b) => !search || (b.bundle_name || '').toLowerCase().includes(search.toLowerCase());

  // "bundles" (mula sa promo_bundles table) ay may dalawang category ngayon:
  // 'Bundle' at 'Package' (dating hiwalay na product record ang Package,
  // ngayon ay bundle row na rin ito). Sa "All" tab, pareho silang lumalabas
  // kasama ng regular products. Sa "Package" tab, category: 'Package' na
  // bundle rows lang — hindi na ito hinahanap sa `products` kasi wala nang
  // product ang may category na 'Package'. Sa ibang category tab (Cake,
  // Pastry, atbp.), products lang gaya ng dati.
  const filteredBundles = category === 'All'
    ? bundles.filter(bundleSearchOk)
    : category === 'Package'
      ? bundles.filter(b => b.category === 'Package' && bundleSearchOk(b))
      : [];
  const bundlesWithAvailability = filteredBundles.map(bundle => ({
    ...bundle,
    package_items: (bundle.package_items || []).map(item => ({
      ...item,
      availability: posAvailabilityById[String(item.product_id)],
    })),
  }));

  // Package at Bundle ay parehong na-e-edit na sa Promo Bundles form (doon
  // na ang Package Contents UI); ginagamit lang dito ang BundleCard grid
  // kaya diretso na sa handleEditBundle ang Edit ng anumang bundle row.
  const handleEdit = (product) => {
    setEditProduct(product);
    setModalOpen(true);
  };
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

  // Galing sa Promo Bundles page (pagkatapos mag-add/edit ng Package, o nag-click
  // ng category tab): buksan agad ang tamang category tab dito.
  useEffect(() => {
    const target = location.state?.category;
    if (!target) return;
    if (CATEGORIES.includes(target)) setCategory(target);
    if (location.state?.toast) showToast(location.state.toast);
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const handleSaveSuccess = async (savedProduct) => {
    const refreshedProducts = await fetchProductsFromApi(true);
    const saved = savedProduct
      ? {
          ...savedProduct,
          is_active: savedProduct.is_active
            ?? (refreshedProducts || []).find(product => product.id === savedProduct.id)?.is_active
            ?? true,
          linked_inventory_material: savedProduct.linked_inventory_material
            ?? (refreshedProducts || []).find(product => product.id === savedProduct.id)?.linked_inventory_material
            ?? null,
          has_production_formula: savedProduct.category === 'Celebration Material'
            ? true
            : savedProduct.has_production_formula === true,
          formula_status: savedProduct.category === 'Celebration Material'
            ? 'not_required'
            : savedProduct.has_production_formula === true ? 'ready' : 'missing',
        }
      : null;

    const mergedProducts = saved
      ? [
          ...(refreshedProducts || []).filter(product => product.id !== saved.id),
          saved,
        ].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      : refreshedProducts;

    productsCache = mergedProducts || [];
    setProducts(productsCache);
    showToast(editProduct?.id ? 'Product updated.' : 'Product added.');
  };

  const handleDelete = (product) => setDeleteTarget(product);

  const confirmDelete = async () => {
    try {
      const res = await apiClient.delete(`${PRODUCTS_BASE}/${deleteTarget.id}?devtools_label=delete_product`);
      unwrapData(res.data, 'Failed to delete product.');
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
      if (productsCache) productsCache = productsCache.filter(p => p.id !== deleteTarget.id);
      showToast(`${deleteTarget.name} deleted.`, 'success');
    } catch (err) {
      console.error('Delete Product Error:', err);
      showToast(getErrMsg(err, 'Failed to delete product.'), 'warning');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleModalDelete = (id) => {
    const productToDelete = products.find(product => String(product.id) === String(id)) || editProduct;
    if (!productToDelete) return;
    handleCloseModal();
    setDeleteTarget(productToDelete);
  };

  // Ang edit form ay nangangailangan ng allProducts at events (shared cache sa
  // PromoBundles.jsx). Naka-prefetch ito pagbukas ng page, kaya halos agad
  // bumubukas ang modal; kung wala pa sa cache, saglit lang hihintayin.
  useEffect(() => {
    fetchBundlesPageFromApi().catch(() => {});
  }, []);

  const handleEditBundle = async (bundle) => {
    if (openingBundleId) return;
    setOpeningBundleId(bundle.id);
    try {
      const { allProducts, events } = await fetchBundlesPageFromApi();
      setBundleModal({ open: true, bundle, allProducts, events });
    } catch (err) {
      console.error('Open Bundle Editor Error:', err);
      showToast(err.message || 'Failed to open editor.', 'warning');
    } finally {
      setOpeningBundleId(null);
    }
  };

  const handleCloseBundleModal = () => setBundleModal(prev => ({ ...prev, open: false }));

  const handleBundleSaved = async ({ category, isUpdate } = {}) => {
    clearBundlesPageCache(); // sariwa ang datos pag-balik sa Promo Bundles tab
    bundlesListCache = null;
    await fetchBundles(true, true);
    const noun = category === 'Package' ? 'Package' : 'Bundle';
    showToast(isUpdate ? `${noun} updated.` : `${noun} added.`);
  };

  const handleDeleteBundle = (bundle) => setDeleteBundleTarget(bundle);

  const confirmDeleteBundle = async () => {
    try {
      const entityLabel = deleteBundleTarget.category === 'Package' ? 'package' : 'bundle';
      const res = await fetch(`${BUNDLES_API}/${deleteBundleTarget.id}?devtools_label=delete_${entityLabel}`, { method: 'DELETE', credentials: 'include' });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.success === false) {
        throw new Error(result.message || result.error || 'Failed to delete bundle.');
      }
      setBundles(prev => prev.filter(b => b.id !== deleteBundleTarget.id));
      if (bundlesListCache) bundlesListCache = bundlesListCache.filter(b => b.id !== deleteBundleTarget.id);
      clearBundlesPageCache(); // sariwa ang datos pag-balik sa Promo Bundles tab
      showToast(`${deleteBundleTarget.bundle_name} deleted.`, 'success');
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
        <div
          className={`fixed bottom-6 right-6 z-[9999] px-5 py-3.5 sm:px-6 sm:py-4 rounded-2xl shadow-2xl text-sm sm:text-base font-semibold tracking-wide animate-slideUp min-w-[260px] max-w-md pointer-events-auto leading-snug text-white ${
            toast.variant === 'warning' ? 'bg-amber-700' : (toast.variant === 'error' || toast.variant === 'danger') ? 'bg-red-700' : 'bg-green-700'
          }`}
        >
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
          {activeProducts.map(p => (
            <ProductCard key={p.id} product={p} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
          {/* Isinasama ang mga Promo Bundle sa "All" view — sa hulihan ng
              listahan, pagkatapos ng lahat ng regular na product. */}
          {bundlesWithAvailability.map(b => (
            <BundleCard key={`bundle-${b.id}`} bundle={b} onEdit={handleEditBundle} onDelete={handleDeleteBundle} />
          ))}
          {inactiveProducts.map(p => (
            <ProductCard key={p.id} product={p} onEdit={handleEdit} onDelete={handleDelete} />
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
        showToast={showToast}
        allProducts={products}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={<>Are you sure you want to delete <span className="font-extrabold text-red-700">"{deleteTarget?.name}"</span>?</>}
        message={(() => {
          const hasFormula = Boolean(deleteTarget?.recipe_id);
          const ingredientCount = Number(deleteTarget?.recipe_ingredient_count || 0);
          const isCelebrationMaterial = deleteTarget?.category === 'Celebration Material';
          const formulaEffect = isCelebrationMaterial
            ? ''
            : hasFormula
              ? `This product is linked to a production formula. Deleting it will also delete that formula and its ${ingredientCount} ingredient link(s). `
              : 'No production formula is currently linked to this product. ';
          const linkedMaterial = deleteTarget?.linked_inventory_material;
          const isPartnerOrPreOrder = deleteTarget?.category === 'Celebration Material'
            && (deleteTarget?.sourcing_type === 'partner'
              || String(deleteTarget?.order_type || '').toLowerCase().replace(/[^a-z]/g, '') === 'preorder');
          const inventoryEffect = isPartnerOrPreOrder
            ? ' This item is also listed under Inventory > Stocks > Celebration/ Product Materials as a Partner or Pre-order item. Deleting the product will remove that inventory row and its order limit; it has no separate stock record.'
            : linkedMaterial
            ? ` It is also linked to inventory material "${linkedMaterial.name}" with ${Number(linkedMaterial.stock_quantity || 0)} ${linkedMaterial.unit || 'unit(s)'} in stock. Deleting this product will keep the inventory material and its stock; it will only clear the product link.`
            : isCelebrationMaterial
              ? ' This product is also listed under Inventory > Stocks > Celebration/ Product Materials as an own-stock item. Deleting it will remove that product row; any separately linked inventory material and stock will remain.'
              : '';
          const historyEffect = isCelebrationMaterial
            ? ' Past order records will remain for reporting, but their product links will be cleared. This cannot be undone.'
            : ' Past order items and production records will remain for reporting, but their links to this product or formula will be cleared. This cannot be undone.';
          return (
            `${formulaEffect}${inventoryEffect}${historyEffect}`
          );
        })()}
        confirmLabel="Delete"
      />

      <BundleFormModal
        isOpen={bundleModal.open}
        onClose={handleCloseBundleModal}
        bundle={bundleModal.bundle}
        editPackageProduct={null}
        allProducts={bundleModal.allProducts}
        events={bundleModal.events}
        onSaved={handleBundleSaved}
      />

      <ConfirmModal
        isOpen={!!deleteBundleTarget}
        onClose={() => setDeleteBundleTarget(null)}
        onConfirm={confirmDeleteBundle}
        title={<BundleDeleteTitle bundle={deleteBundleTarget} />}
        message={getBundleDeleteImpact(deleteBundleTarget)}
        confirmLabel="Delete"
      />
    </div>
  );
}
