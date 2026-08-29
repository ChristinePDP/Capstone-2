import { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, X, Search, Package, Loader2, Tag, ImagePlus, ChevronDown } from 'lucide-react';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/online-ordering/products`;
const PRODUCTS_API = API_BASE;
const EVENTS_API = `${API_BASE}/events`;
export const BUNDLES_API = `${API_BASE}/bundles`;
const UPLOAD_IMAGE_API = `${API_BASE}/upload-image`;

// Parehong tab strip na makikita sa Product Catalog — "Promo Bundle" ang laging
// naka-highlight dito. Pag-click sa ibang item, bumabalik sa Product Catalog.
const TAB_ITEMS = ['All', 'Promo Bundle', 'Pastry', 'Cake', 'Package', 'Celebration Material'];

const parseResponse = async (res) => {
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result.success === false) {
    throw new Error(result.message || result.error || 'Something went wrong. Please try again.');
  }
  return result.data;
};

// FIX: dating fetchAll() lang ang laman ng useEffect ng component — kaya
// tuwing lilipat ka papunta sa "Product Management" o "Event Manager" tab
// (nag-uunmount ang PromoBundles) at babalik ka rito, tatlong bagong fetch
// ulit sa backend (bundles + products + events). Inilipat sa MODULE SCOPE
// ang cache (sa labas ng component) kaya minsan lang talaga itong tatlo
// magre-request habang bukas ang session.
let bundlesPageCache = null; // { bundles, allProducts, events }
let bundlesPageCachePromise = null;

async function fetchBundlesPageFromApi(force = false) {
  if (bundlesPageCache && !force) return bundlesPageCache;
  if (bundlesPageCachePromise && !force) return bundlesPageCachePromise;

  bundlesPageCachePromise = (async () => {
    try {
      const [bundlesRes, productsRes, eventsRes] = await Promise.all([
        fetch(BUNDLES_API),
        fetch(PRODUCTS_API),
        fetch(EVENTS_API),
      ]);
      const [bundlesData, productsData, eventsData] = await Promise.all([
        parseResponse(bundlesRes),
        parseResponse(productsRes),
        parseResponse(eventsRes),
      ]);
      bundlesPageCache = {
        bundles: bundlesData || [],
        allProducts: productsData || [],
        events: eventsData || [],
      };
      return bundlesPageCache;
    } finally {
      bundlesPageCachePromise = null;
    }
  })();

  return bundlesPageCachePromise;
}

// Pinapayagan ang ibang page (hal. Product Catalog "All" view) na i-clear
// itong shared cache pagkatapos nitong baguhin/burahin ang isang bundle sa
// labas ng PromoBundles page, para sariwa ang datos pagbalik dito.
export function clearBundlesPageCache() {
  bundlesPageCache = null;
}

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
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold text-xs px-5 py-2.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
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

function Modal({ isOpen, onClose, title, footer, children }) {
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

function CategoryTabs({ options, activeItem, onCategoryClick }) {
  return (
    <div className="flex items-center gap-5 sm:gap-7 flex-wrap border-b border-[#EAE4E0]">
      {options.map(opt => {
        const active = opt === activeItem;
        return (
          <button
            key={opt}
            onClick={() => { if (opt !== activeItem) onCategoryClick(opt); }}
            className={`relative pb-2.5 text-xs sm:text-sm font-bold tracking-wide whitespace-nowrap transition-colors ${
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

// ─────────────────────────────────────────────────────────────
// Bundle Image Grid
// ─────────────────────────────────────────────────────────────
function BundleImageGrid({ products = [], customImageUrl }) {
  if (customImageUrl) {
    return <img src={customImageUrl} alt="Bundle" className="w-full h-full object-cover" />;
  }

  if (products.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <Package size={28} className="text-[#DED4CC]" />
      </div>
    );
  }

  const MAX_IMAGE_SLOTS = 3;
  const showCountTile = products.length > MAX_IMAGE_SLOTS;
  const imageSlots = showCountTile ? products.slice(0, MAX_IMAGE_SLOTS - 1) : products;
  const extraCount = products.length - imageSlots.length;
  const segmentCount = imageSlots.length + (showCountTile ? 1 : 0);

  return (
    <div className="relative w-full h-full flex">
      {imageSlots.map((p, idx) => {
        const img = p.image_url || p.image;
        return (
          <div key={p.id ?? idx} className="flex-1 h-full relative overflow-hidden">
            {img ? (
              <img src={img} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#F5EFEB] flex items-center justify-center">
                <Package size={22} className="text-[#DED4CC]" />
              </div>
            )}
          </div>
        );
      })}

      {showCountTile && (
        <div className="flex-1 h-full bg-[#3B1F0A] flex flex-col items-center justify-center text-white">
          <span className="text-lg font-extrabold leading-none">+{extraCount}</span>
          <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">more</span>
        </div>
      )}

      {Array.from({ length: segmentCount - 1 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center"
          style={{ left: `${(100 / segmentCount) * (i + 1)}%` }}
        >
          <Plus size={13} className="text-[#3B1F0A]" strokeWidth={3} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bundle Card
// ─────────────────────────────────────────────────────────────
// Exported dahil ginagamit din ito ng Product Catalog "All" view
// (productManagement.jsx) para maisama ang mga bundle sa parehong grid.
export function BundleCard({ bundle, onEdit, onDelete }) {
  const products = bundle.products || [];
  const bundleOptions = bundle.bundle_options || {}; 
  const originalTotal = Number(bundle.original_total || 0);
  const bundlePrice = Number(bundle.discounted_price || bundle.bundle_price || 0);
  const discountPercent = Number(bundle.discount_percent || 0);

  const productDescription = products.length > 0 
    ? products.map(p => {
        const opts = bundleOptions[p.id];
        if (opts && Object.keys(opts).length > 0) {
          const optionStrings = Object.values(opts).join(', ');
          return `${p.name} (${optionStrings})`;
        }
        return p.name;
      }).join(' + ') 
    : '\u00A0';

  return (
    <div className="bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden shadow-sm flex flex-col h-full min-w-0">
      <div className="relative h-36 bg-[#F5EFEB] overflow-hidden shrink-0">
        <BundleImageGrid products={products} customImageUrl={bundle.custom_image_url} />

        {discountPercent > 0 && (
          <div className="absolute top-2 right-2">
            <span className="text-[10px] font-bold bg-[#3B1F0A] text-white px-2 py-1 rounded-full shadow-sm">
              -{discountPercent}%
            </span>
          </div>
        )}

        {bundle.event_tag && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest bg-white text-[#3B1F0A] px-2.5 py-1 rounded-full shadow-sm">
              <Tag size={10} /> {bundle.event_tag}
            </span>
          </div>
        )}

        {!bundle.event_tag && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest bg-white text-[#3B1F0A] px-2 sm:px-2.5 py-1 rounded-full shadow-sm">
              <Tag size={10} /> Bundle
            </span>
          </div>
        )}

        {bundle.is_within_date_range === false && (
          <div className="absolute bottom-2 left-2">
            <span className="text-[10px] font-bold uppercase tracking-wide bg-white/90 text-[#8A7264] px-2 py-1 rounded-full shadow-sm">
              Out of season
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-grow">
        <p className="font-bold text-[#3B1F0A] text-sm mb-1 truncate">{bundle.bundle_name}</p>

        <p 
          className="text-[11px] text-[#8A7264] mb-3 line-clamp-2 leading-relaxed" 
          title={productDescription}
        >
          {productDescription}
        </p>

        <div className="mt-auto">
          {discountPercent > 0 && originalTotal > 0 && (
            <span className="text-[11px] text-[#8A7264] line-through mr-1.5">
              ₱{originalTotal.toLocaleString()}
            </span>
          )}
          <span className="text-[15px] font-extrabold text-[#3B1F0A]">
            ₱{bundlePrice.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex border-t border-[#EAE4E0] shrink-0">
        <button
          onClick={() => onEdit(bundle)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[#8A7264] hover:bg-[#F5EFEB] hover:text-[#3B1F0A] transition-colors"
        >
          <Edit2 size={13} />Edit
        </button>
        <div className="w-px bg-[#EAE4E0]" />
        <button
          onClick={() => onDelete(bundle)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={13} />Delete
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Add / Edit Bundle Modal 
// ─────────────────────────────────────────────────────────────
const MONTH_OPTIONS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
];

const emptyForm = {
  bundle_name: '',
  product_items: [], // Holds { productId, options }
  discount_percent: 0,
  custom_image_url: '',
  event_tag: '',
  is_active: true,
  availabilityMode: 'always',
  start_month: 1,
  start_day: 1,
  end_month: 12,
  end_day: 31,
};

function BundleFormModal({ isOpen, onClose, bundle, allProducts, events, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [productSearch, setProductSearch] = useState('');
  const [productListOpen, setProductListOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      const hasDateRange = Boolean(
        bundle && bundle.start_month && bundle.start_day && bundle.end_month && bundle.end_day
      );
      const availabilityMode = bundle?.event_tag ? 'event' : (hasDateRange ? 'dates' : 'always');
      
      const initialItems = (bundle?.product_ids || []).map(pid => {
         return {
           productId: pid,
           options: bundle?.bundle_options?.[pid] || {}
         };
      });

      setForm(
        bundle
          ? {
              bundle_name: bundle.bundle_name || '',
              product_items: initialItems,
              discount_percent: bundle.discount_percent ?? 0,
              custom_image_url: bundle.custom_image_url || '',
              event_tag: bundle.event_tag || '',
              is_active: bundle.is_active ?? true,
              availabilityMode,
              start_month: bundle.start_month || 1,
              start_day: bundle.start_day || 1,
              end_month: bundle.end_month || 12,
              end_day: bundle.end_day || 31,
            }
          : emptyForm
      );
      setProductSearch('');
      setProductListOpen(false);
      setFormError(null);
    }
  }, [isOpen, bundle]);

  const filteredProducts = useMemo(() => {
    if (!productSearch) return allProducts;
    return allProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [allProducts, productSearch]);

  const selectedProducts = useMemo(
    () => allProducts.filter(p => form.product_items.some(item => item.productId === p.id)),
    [allProducts, form.product_items]
  );

  const getVariantPrice = (product, options) => {
    if (product.pricing_mode === 'variable' && product.price_matrix) {
      const match = product.price_matrix.find(entry => 
        Object.entries(entry.combo).every(([k, v]) => options[k] === v)
      );
      return match ? Number(match.price) : Number(product.price || 0);
    }
    return Number(product.price || 0);
  };

  const originalTotal = selectedProducts.reduce((sum, p) => {
    const item = form.product_items.find(i => i.productId === p.id);
    return sum + getVariantPrice(p, item?.options || {});
  }, 0);

  const discountPercent = Number(form.discount_percent || 0);
  const computedPrice = Math.round(originalTotal * (1 - discountPercent / 100));

  const toggleProduct = (product) => {
    setForm(prev => {
      const exists = prev.product_items.find(item => item.productId === product.id);
      if (exists) {
        return { ...prev, product_items: prev.product_items.filter(item => item.productId !== product.id) };
      } else {
        let defaultOptions = {};
        if (product.pricing_mode === 'variable' && product.price_groups) {
           product.price_groups.forEach(g => {
             defaultOptions[g.name] = g.options[0];
           });
        }
        return { ...prev, product_items: [...prev.product_items, { productId: product.id, options: defaultOptions }] };
      }
    });
  };

  const updateItemOption = (productId, groupName, value) => {
    setForm(prev => ({
      ...prev,
      product_items: prev.product_items.map(item => {
        if (item.productId === productId) {
          return { ...item, options: { ...item.options, [groupName]: value } };
        }
        return item;
      })
    }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(UPLOAD_IMAGE_API, { method: 'POST', body: fd });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.success === false || !result.url) {
        throw new Error(result.message || result.error || 'Upload failed.');
      }
      setForm(prev => ({ ...prev, custom_image_url: result.url }));
    } catch (err) {
      setFormError(err.message || 'Failed to upload image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmit = async () => {
    setFormError(null);

    if (!form.bundle_name.trim()) {
      setFormError('Bundle name is required.');
      return;
    }
    if (form.product_items.length < 2) {
      setFormError('Select at least 2 products.');
      return;
    }
    if (form.discount_percent === '' || Number(form.discount_percent) < 0 || Number(form.discount_percent) > 100) {
      setFormError('A valid discount % (0–100) is required.');
      return;
    }
    if (form.availabilityMode === 'event' && !form.event_tag) {
      setFormError('Select an event.');
      return;
    }

    setSaving(true);
    try {
      const cleanProductIds = form.product_items.map(item => item.productId);
      const bundleOptions = form.product_items.reduce((acc, item) => {
         acc[item.productId] = item.options;
         return acc;
      }, {});

      const payload = {
        bundle_name: form.bundle_name.trim(),
        product_ids: cleanProductIds, 
        bundle_options: bundleOptions, 
        discounted_price: computedPrice,
        custom_image_url: form.custom_image_url || null,
        is_active: form.is_active,
        event_tag: form.availabilityMode === 'event' ? (form.event_tag || null) : null,
        start_month: form.availabilityMode === 'dates' ? Number(form.start_month) : null,
        start_day: form.availabilityMode === 'dates' ? Number(form.start_day) : null,
        end_month: form.availabilityMode === 'dates' ? Number(form.end_month) : null,
        end_day: form.availabilityMode === 'dates' ? Number(form.end_day) : null,
      };

      const isUpdate = Boolean(bundle?.id);
      const res = await fetch(`${BUNDLES_API}${isUpdate ? `/${bundle.id}` : ''}`, {
        method: isUpdate ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await parseResponse(res);

      onSaved();
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to save bundle.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={bundle?.id ? 'Edit Promo Bundle' : 'Add Promo Bundle'}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="dark" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {bundle?.id ? 'Save Changes' : 'Create Bundle'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {formError && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
            {formError}
          </div>
        )}

        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-[#8A7264] mb-1.5">
            Bundle Name
          </label>
          <input
            value={form.bundle_name}
            onChange={e => setForm(prev => ({ ...prev, bundle_name: e.target.value }))}
            placeholder="e.g. Christmas Sweet Deal"
            className="w-full px-3.5 py-2.5 text-xs border border-[#DED4CC] rounded-xl outline-none focus:border-[#5A453C] bg-white"
          />
        </div>

        {/* Product multi-select */}
        <div>
          <button
            type="button"
            onClick={() => setProductListOpen(prev => !prev)}
            className="w-full flex items-center justify-between px-3.5 py-2.5 border border-[#DED4CC] rounded-xl bg-white text-left"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#8A7264]">
              Products in this Bundle ({form.product_items.length} selected — min. 2)
            </span>
            <ChevronDown
              size={16}
              className={`text-[#8A7264] transition-transform shrink-0 ml-2 ${productListOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {!productListOpen && selectedProducts.length > 0 && (
            <div className="flex flex-col gap-2 mt-3">
              {selectedProducts.map(p => {
                const item = form.product_items.find(i => i.productId === p.id);
                const currentPrice = getVariantPrice(p, item.options);
                
                return (
                  <div key={p.id} className="flex flex-col gap-2 p-3 bg-[#F5EFEB] rounded-xl border border-[#DED4CC]">
                    <div className="flex justify-between items-start">
                       <span className="text-xs font-bold text-[#3B1F0A]">{p.name}</span>
                       <button type="button" onClick={() => toggleProduct(p)} className="text-red-600 hover:bg-red-50 p-1.5 rounded-md"><X size={13}/></button>
                    </div>
                    
                    {p.pricing_mode === 'variable' && p.price_groups && (
                      <div className="flex flex-wrap gap-3">
                        {p.price_groups.map(g => (
                           <div key={g.name} className="flex-1 min-w-[100px]">
                             <label className="block text-[9px] font-bold uppercase tracking-wider text-[#8A7264] mb-1.5">{g.name}</label>
                             <select 
                               value={item.options[g.name] || ''}
                               onChange={(e) => updateItemOption(p.id, g.name, e.target.value)}
                               className="w-full text-xs px-2 py-1.5 rounded-lg border border-[#DED4CC] bg-white outline-none focus:border-[#5A453C]"
                             >
                               {g.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                             </select>
                           </div>
                        ))}
                      </div>
                    )}
                    
                    <div className="text-[10px] font-semibold text-[#8A7264] text-right mt-1">
                      Value: ₱{currentPrice.toLocaleString()}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {productListOpen && (
            <div className="mt-2">
              <SearchBar value={productSearch} onChange={setProductSearch} placeholder="Search product..." className="mb-2" />
              <div className="border border-[#DED4CC] rounded-xl max-h-52 overflow-y-auto divide-y divide-[#EAE4E0]">
                {filteredProducts.map(p => {
                  const checked = form.product_items.some(item => item.productId === p.id);
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-3 px-3.5 py-2.5 text-xs cursor-pointer transition-colors ${checked ? 'bg-[#F5EFEB]' : 'hover:bg-[#FAF7F5]'}`}
                    >
                      <input type="checkbox" checked={checked} onChange={() => toggleProduct(p)} className="accent-[#3B1F0A]" />
                      <span className="flex-1 font-medium text-[#3B1F0A] truncate">{p.name}</span>
                      <span className="text-[#8A7264]">
                        {p.pricing_mode === 'variable' ? 'Variable Pricing' : `₱${Number(p.price).toLocaleString()}`}
                      </span>
                    </label>
                  );
                })}
                {filteredProducts.length === 0 && (
                  <p className="px-3.5 py-4 text-xs text-center text-[#8A7264]">No products found.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Discount % + live computed price */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-[#8A7264] mb-1.5">
              Discount %
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={form.discount_percent}
              onChange={e => setForm(prev => ({ ...prev, discount_percent: e.target.value }))}
              className="w-full px-3.5 py-2.5 text-xs border border-[#DED4CC] rounded-xl outline-none focus:border-[#5A453C] bg-white"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wide text-[#8A7264] mb-1.5">
              Computed Bundle Price
            </label>
            <div className="px-3.5 py-2.5 text-xs rounded-xl bg-[#F5EFEB] text-[#3B1F0A] font-bold">
              {originalTotal > 0 ? (
                <>
                  <span className="line-through text-[#8A7264] font-normal mr-1.5">₱{originalTotal.toLocaleString()}</span>
                  ₱{computedPrice.toLocaleString()}
                </>
              ) : (
                'Select products first'
              )}
            </div>
          </div>
        </div>

        {/* Availability UI */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-[#8A7264] mb-1.5">
            When can this be purchased? (Choose one)
          </label>
          <div className="flex gap-2 bg-[#F5EFEB] p-1.5 rounded-xl mb-4 border border-[#DED4CC]">
            {[
              { id: 'always', label: 'Always Available' },
              { id: 'event', label: 'Linked to Event' },
              { id: 'dates', label: 'Specific Dates' },
            ].map(mode => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, availabilityMode: mode.id }))}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  form.availabilityMode === mode.id
                    ? 'bg-white text-[#3B1F0A] shadow-sm border border-[#DED4CC]'
                    : 'text-[#8A7264] hover:text-[#5A453C]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="bg-[#FAF7F5] p-4 rounded-xl border border-[#DED4CC]">
            {form.availabilityMode === 'always' && (
              <p className="text-xs text-[#5A453C] font-medium text-center">
                This will be visible and available for purchase on the menu at any time.
              </p>
            )}

            {form.availabilityMode === 'event' && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#8A7264] mb-2">Select Event Tag</p>
                <select
                  value={form.event_tag}
                  onChange={e => setForm(prev => ({ ...prev, event_tag: e.target.value }))}
                  className="w-full px-3.5 py-2.5 text-xs border border-[#DED4CC] rounded-xl outline-none focus:border-[#5A453C] bg-white text-[#3B1F0A]"
                >
                  <option value="">Select an event...</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.event_tag}>{ev.event_name}</option>
                  ))}
                </select>
              </div>
            )}

            {form.availabilityMode === 'dates' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8A7264] mb-1">Start Date</p>
                  <div className="flex gap-2">
                    <select
                      value={form.start_month}
                      onChange={e => setForm(prev => ({ ...prev, start_month: e.target.value }))}
                      className="flex-1 px-2.5 py-2 text-xs border border-[#DED4CC] rounded-xl outline-none focus:border-[#5A453C] bg-white"
                    >
                      {MONTH_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={form.start_day}
                      onChange={e => setForm(prev => ({ ...prev, start_day: e.target.value }))}
                      className="w-16 px-2.5 py-2 text-xs border border-[#DED4CC] rounded-xl outline-none focus:border-[#5A453C] bg-white"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#8A7264] mb-1">End Date</p>
                  <div className="flex gap-2">
                    <select
                      value={form.end_month}
                      onChange={e => setForm(prev => ({ ...prev, end_month: e.target.value }))}
                      className="flex-1 px-2.5 py-2 text-xs border border-[#DED4CC] rounded-xl outline-none focus:border-[#5A453C] bg-white"
                    >
                      {MONTH_OPTIONS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={form.end_day}
                      onChange={e => setForm(prev => ({ ...prev, end_day: e.target.value }))}
                      className="w-16 px-2.5 py-2 text-xs border border-[#DED4CC] rounded-xl outline-none focus:border-[#5A453C] bg-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Optional custom image */}
        <div>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-[#8A7264] mb-1.5">
            Bundle Image (optional)
          </label>
          <div className="flex items-center gap-3">
            {form.custom_image_url ? (
              <img src={form.custom_image_url} alt="Bundle" className="w-16 h-16 rounded-xl object-cover border border-[#DED4CC]" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-[#F5EFEB] flex items-center justify-center border border-[#DED4CC]">
                <ImagePlus size={18} className="text-[#8A7264]" />
              </div>
            )}
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-1.5 rounded-xl font-semibold text-xs px-4 py-2 bg-white text-[#5A453C] border border-[#DED4CC] hover:bg-[#F5EFEB] transition-colors">
                {uploadingImage ? <Loader2 size={13} className="animate-spin" /> : null}
                {form.custom_image_url ? 'Change Image' : 'Upload Image'}
              </span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
            </label>
            {form.custom_image_url && (
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, custom_image_url: '' }))}
                className="text-[11px] font-bold text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        {/* Active toggle */}
        <label className="flex items-center gap-2 cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
            className="accent-[#3B1F0A]"
          />
          <span className="text-xs font-semibold text-[#3B1F0A]">Active (visible in online ordering)</span>
        </label>
      </div>
    </Modal>
  );
}

export default function PromoBundles({ autoOpenAdd = false, onAutoOpenHandled } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [bundles, setBundles] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const { toast, show: showToast } = useToast();
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editBundle, setEditBundle] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchAll = async (force = false) => {
    if (force || bundles.length === 0) setIsLoading(true);
    setError(null);
    try {
      const { bundles: b, allProducts: p, events: e } = await fetchBundlesPageFromApi(force);
      setBundles(b);
      setAllProducts(p);
      setEvents(e);
    } catch (err) {
      console.error('Fetch Bundles Error:', err);
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  // Kung galing tayo sa Product Catalog "All" view (na-click ang Edit sa
  // isang bundle card doon), buksan agad dito ang Edit modal ng target
  // bundle pagkatapos itong ma-fetch, tapos i-clear ang navigation state
  // para hindi na ito ulit mag-trigger sa refresh/back.
  useEffect(() => {
    const editBundleId = location.state?.editBundleId;
    if (!editBundleId || bundles.length === 0) return;
    const target = bundles.find(b => b.id === editBundleId);
    if (target) {
      setEditBundle(target);
      setModalOpen(true);
    }
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, bundles]);

  const filtered = bundles.filter(b => {
    if (!search) return true;
    return b.bundle_name.toLowerCase().includes(search.toLowerCase());
  });

  const handleAdd = () => { setEditBundle(null); setModalOpen(true); };
  const handleEdit = (bundle) => { setEditBundle(bundle); setModalOpen(true); };
  const handleCloseModal = () => { setModalOpen(false); setEditBundle(null); };

  // Pinapayagan ang parent (ProductAndEventPage) na buksan ang "Add Bundle"
  // modal mula sa nakapirming header nito, kahit saang sub-tab pa ito
  // itinuturo pabalik.
  useEffect(() => {
    if (autoOpenAdd) {
      handleAdd();
      onAutoOpenHandled?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAdd]);

  const handleSaved = async () => {
    await fetchAll(true); // force: kailangan bagong datos, hindi stale cache
    showToast(editBundle?.id ? 'Bundle updated.' : 'Bundle added.');
  };

  const handleDelete = (bundle) => setDeleteTarget(bundle);

  const confirmDelete = async () => {
    try {
      const res = await fetch(`${BUNDLES_API}/${deleteTarget.id}`, { method: 'DELETE' });
      await parseResponse(res);
      setBundles(prev => prev.filter(b => b.id !== deleteTarget.id));
      if (bundlesPageCache) {
        bundlesPageCache = {
          ...bundlesPageCache,
          bundles: bundlesPageCache.bundles.filter(b => b.id !== deleteTarget.id),
        };
      }
      showToast(`${deleteTarget.bundle_name} deleted.`, 'warning');
    } catch (err) {
      console.error('Delete Bundle Error:', err);
      showToast(err.message || 'Failed to delete bundle.', 'warning');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="overflow-x-hidden w-full max-w-full">
      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-[#3B1F0A] text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-4 mb-6">
        <SearchBar value={search} onChange={setSearch} placeholder="Search bundle..." className="w-full sm:w-64" />
        <CategoryTabs
          options={TAB_ITEMS}
          activeItem="Promo Bundle"
          onCategoryClick={() => navigate('/productAndEvent')}
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
          Loading bundles...
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {filtered.map(b => (
            <BundleCard key={b.id} bundle={b} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
          {!filtered.length && (
            <div className="col-span-2 md:col-span-4 text-center py-20 text-[#8A7264] text-xs bg-white rounded-2xl border border-[#EAE4E0]">
              No promo bundles yet. Click "Add Bundle" to create one.
            </div>
          )}
        </div>
      )}

      <BundleFormModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        bundle={editBundle}
        allProducts={allProducts}
        events={events}
        onSaved={handleSaved}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Bundle"
        message={`Are you sure you want to delete "${deleteTarget?.bundle_name}"? This cannot be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}