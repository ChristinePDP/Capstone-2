import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, X, Search, Package, Loader2, Tag, ImagePlus, ChevronDown, Upload, AlertTriangle } from 'lucide-react';

const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/online-ordering/products`;
const PRODUCTS_API = `${API_BASE}/catalog`;
const EVENTS_API = `${API_BASE}/events`;
export const BUNDLES_API = `${API_BASE}/bundles`;
const UPLOAD_IMAGE_API = `${API_BASE}/upload-image`;

// Binubura sa bucket ang image na na-upload pero hindi na gagamitin (best-effort).
// Ligtas ito dahil tinatanggihan ng backend kung may product/bundle pang gumagamit ng URL.
const discardUploadedImage = (url) => {
  if (!url) return;
  fetch(UPLOAD_IMAGE_API, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  }).catch(() => {});
};

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

export async function fetchBundlesPageFromApi(force = false) {
  if (bundlesPageCache && !force) return bundlesPageCache;
  if (bundlesPageCachePromise && !force) return bundlesPageCachePromise;

  bundlesPageCachePromise = (async () => {
    try {
      const [bundlesRes, productsRes, eventsRes] = await Promise.all([
        fetch(BUNDLES_API),
        fetch(PRODUCTS_API, { credentials: 'include' }),
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

// Same look as the Select/Input primitives in Productmodal.jsx — kept
// identical here so the ported "Package Contents" UI below looks and behaves
// exactly the way it did when it lived in the Product modal.
function Select({ label, children, className = '', ...props }) {
  return (
    <div className="w-full min-w-0">
      {label && <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">{label}</label>}
      <select className={`w-full border border-[#DED4CC] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#5A453C] bg-white transition-colors ${className}`} {...props}>
        {children}
      </select>
    </div>
  );
}

// Searchable dropdown para sa "Add a product" — may search box para hindi
// mahirapan kapag marami na ang products. options: [{ value, label }]
function ProductPicker({ label, value, onChange, options, placeholder = 'Select a product...', disabled = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find(o => String(o.value) === String(value));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const close = () => { setOpen(false); setQuery(''); setActive(0); };
  const choose = (o) => { onChange(String(o.value)); close(); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive(i => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      if (open) { e.preventDefault(); if (filtered[active]) choose(filtered[active]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); e.stopPropagation(); close(); }
    } else if (e.key === 'Tab') {
      close();
    }
  };

  return (
    <div ref={wrapRef} className="w-full min-w-0 relative">
      {label && <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">{label}</label>}
      <div className="relative">
        <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A7264] pointer-events-none" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          disabled={disabled}
          value={open ? query : (selected?.label || '')}
          placeholder={open ? 'Search products...' : placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setActive(0); setOpen(true); }}
          onKeyDown={handleKeyDown}
          className="w-full border border-[#DED4CC] rounded-xl pl-9 pr-9 py-2.5 text-xs outline-none focus:border-[#5A453C] bg-white transition-colors disabled:bg-[#F5EFEB] disabled:cursor-not-allowed truncate"
        />
        <ChevronDown size={14} className={`absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8A7264] pointer-events-none transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {open && !disabled && (
        <ul ref={listRef} role="listbox" className="absolute left-0 right-0 top-full mt-1 z-30 max-h-60 overflow-y-auto overscroll-contain bg-white border border-[#DED4CC] rounded-xl shadow-lg py-1">
          {filtered.length === 0 ? (
            <li className="px-3.5 py-2.5 text-xs italic text-[#8A7264]">No products found.</li>
          ) : filtered.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={String(o.value) === String(value)}
              data-active={i === active ? 'true' : undefined}
              onMouseDown={e => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseEnter={() => setActive(i)}
              className={`px-3.5 py-2 text-xs cursor-pointer ${i === active ? 'bg-[#F5EFEB] text-[#3B1F0A]' : 'text-[#5A453C]'} ${String(o.value) === String(value) ? 'font-bold' : ''}`}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Input({ label, required, error, className = '', ...props }) {
  return (
    <div className="w-full min-w-0 relative">
      {label && <label className={`text-[10px] font-bold mb-1.5 block uppercase tracking-wider ${error ? 'text-red-500' : 'text-[#8A7264]'}`}>{label} {required && <span className="text-red-500">*</span>}</label>}
      <input aria-invalid={!!error} data-invalid={error ? 'true' : undefined} className={`w-full border rounded-xl px-3.5 py-2.5 text-xs outline-none bg-white transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${error ? 'border-red-500 focus:border-red-500' : 'border-[#DED4CC] focus:border-[#5A453C]'} ${className}`} {...props} />
      {/* Overlay: nakapuwesto sa ilalim ng field (sa loob ng gap), kaya hindi nagbabago ang taas ng form */}
      {error && <span role="alert" className="absolute left-1 top-full mt-0.5 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none">{error}</span>}
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1108]/60 backdrop-blur-sm p-3 sm:p-4">
      <div className="bg-[#FCFAF9] rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] flex flex-col overflow-hidden border border-[#EAE4E0]">
        <div className="flex items-center justify-between px-4 sm:px-7 py-3 sm:py-5 border-b border-[#EAE4E0] bg-white shrink-0">
          <h2 className="text-lg sm:text-xl font-bold font-serif text-[#3B1F0A]">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 min-h-0 px-3 sm:px-8 py-3 sm:py-6 overflow-y-auto overscroll-contain scrollbar-thin">{children}</div>
        {footer && <div className="px-3 sm:px-7 py-3 sm:py-4 border-t border-[#EAE4E0] bg-white shrink-0">{footer}</div>}
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

function CategoryTabs({ options, activeItem, onCategoryClick }) {
  return (
    <div className="flex items-center gap-5 sm:gap-7 flex-wrap border-b border-[#EAE4E0]">
      {options.map(opt => {
        const active = opt === activeItem;
        return (
          <button
            key={opt}
            onClick={() => { if (opt !== activeItem) onCategoryClick(opt); }}
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
  const missingComponentFormula = bundle.has_production_formula === false;
  const invalidComponentNames = Array.isArray(bundle.invalid_component_names)
    ? bundle.invalid_component_names.filter(Boolean)
    : [];
  const formulaWarning = invalidComponentNames.length > 0
    ? `Contains item with no production formula (${invalidComponentNames.join(', ')}) - Cannot appear in POS/Online Ordering`
    : 'Contains item with no production formula - Cannot appear in POS/Online Ordering';

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
    <div className={`bg-white rounded-2xl border overflow-hidden shadow-sm flex flex-col h-full min-w-0 ${missingComponentFormula ? 'border-red-200' : 'border-[#EAE4E0]'}`}>
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
              <Tag size={10} /> {bundle.category === 'Package' ? 'Package' : 'Bundle'}
            </span>
          </div>
        )}

        {bundle.is_within_date_range === false && (
          <div className={`absolute left-2 ${missingComponentFormula ? 'bottom-12' : 'bottom-2'}`}>
            <span className="text-[10px] font-bold uppercase tracking-wide bg-white/90 text-[#8A7264] px-2 py-1 rounded-full shadow-sm">
              Out of season
            </span>
          </div>
        )}

        {missingComponentFormula && (
          <div className="absolute left-2 right-2 bottom-2">
            <span
              title={formulaWarning}
              className="flex items-start gap-1 rounded-lg bg-red-700 px-2 py-1.5 text-[9px] font-bold leading-tight text-white shadow-sm"
            >
              <AlertTriangle size={11} className="mt-px shrink-0" />
              <span>Contains item with no production formula - Cannot appear in POS/Online Ordering</span>
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

// Bundles are capped at 3 products — pag naabot na ang max, awtomatikong
// magsasara ang product picker pero puwede pa ring buksan ulit ("Edit
// Products") kung kailangang baguhin ang napili.
const MAX_BUNDLE_PRODUCTS = 3;
// Packages are capped at 8 different component products.
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MIN_PACKAGE_PRODUCTS = 2;
const MAX_PACKAGE_PRODUCTS = 8;

// BAGO: "category" dropdown — pumipili kung "Bundle" (dating gawi, discount-
// based na 2 products) o "Package" (component products + quantity, hiwalay
// na presyo). Ang buong "Package Contents" function/UI (product+qty picker,
// computed components total, "Use this price") ay dito na inilipat mula sa
// Product modal (Productmodal.jsx) — pareho pa rin ang UI/elements, dito na
// lang ito ginagamit kapag "Package" ang napiling category.
const BUNDLE_CATEGORIES = ['Bundle', 'Package'];

const emptyForm = {
  category: 'Bundle',
  bundle_name: '',
  product_items: [], // Holds { productId, options } — Bundle mode lang
  discount_percent: 0,
  custom_image_url: '',
  event_tag: '',
  is_active: true,
  availabilityMode: 'always',
  start_month: 1,
  start_day: 1,
  end_month: 12,
  end_day: 31,
  // Package mode lang (tingnan ang Productmodal.jsx dati):
  price: '',
  packageItems: [], // Holds { productId, name, quantity }
  // Order Type — same choices as Productmodal.jsx; applies to both Bundle and Package.
  orderType: 'Both',
};

const ORDER_TYPES = ['Pick-up Today', 'Pre-order', 'Both'];

export function BundleFormModal({ isOpen, onClose, bundle, editPackageProduct, allProducts, events, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [productSearch, setProductSearch] = useState('');
  const [productListOpen, setProductListOpen] = useState(false);
  const [pendingBundleProductId, setPendingBundleProductId] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState(null);

  // Mga URL na na-upload sa modal session na ito pero hindi pa nase-save.
  // Pag-upload agad ang nangyayari sa pagpili ng file, kaya kapag pinalitan,
  // inalis, o na-cancel ang modal, binubura natin ang mga ito sa bucket.
  const sessionUploadsRef = useRef(new Set());

  const discardSessionUploads = (keepUrl = null) => {
    sessionUploadsRef.current.forEach((u) => {
      if (u !== keepUrl) discardUploadedImage(u);
    });
    sessionUploadsRef.current.clear();
  };

  const handleCancel = () => {
    discardSessionUploads(null);
    onClose();
  };

  // Inline (per-field) validation — ang mga kulang/maling required field ay
  // may pulang border + error message mismo sa field, hindi na banner sa taas.
  // `formError` (banner) ay para na lang sa save/upload/limit errors.
  const [fieldErrors, setFieldErrors] = useState({});

  // Error ng image upload (laki/uri/server) — ipinapakita mismo sa image field,
  // hindi sa banner sa taas ng modal.
  const [imageError, setImageError] = useState(null);

  const computeFieldErrors = () => {
    const errors = {};
    if (!form.bundle_name.trim()) {
      errors.bundle_name = form.category === 'Package' ? 'Package name is required.' : 'Bundle name is required.';
    }
    if (form.category === 'Package') {
      if (form.price === '' || form.price === null || form.price === undefined) errors.price = 'Price is required.';
      else if (isNaN(Number(form.price)) || Number(form.price) < 0) errors.price = 'Please set a valid positive price.';
      if (form.packageItems.length < MIN_PACKAGE_PRODUCTS) errors.products = `Add at least ${MIN_PACKAGE_PRODUCTS} products to this package`;
    } else {
      if (form.product_items.length < 2) errors.products = 'Select at least 2 products';
      if (form.discount_percent === '' || form.discount_percent === null || form.discount_percent === undefined) {
        errors.discount_percent = 'Discount % is required.';
      } else if (isNaN(Number(form.discount_percent)) || Number(form.discount_percent) < 0 || Number(form.discount_percent) > 100) {
        errors.discount_percent = 'Enter a value from 0 to 100.';
      }
      if (form.availabilityMode === 'event' && !form.event_tag) errors.event_tag = 'Please select an event.';
    }
    return errors;
  };

  // Habang nag-aayos ang admin, mawawala agad ang error ng field na tama na.
  useEffect(() => {
    setFieldErrors(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const latest = computeFieldErrors();
      const next = {};
      keys.forEach(k => { if (latest[k]) next[k] = latest[k]; });
      const same = Object.keys(next).length === keys.length && keys.every(k => next[k] === prev[k]);
      return same ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  // Ipakita ang mga error sa mismong field at i-scroll ang modal sa una.
  const showFieldErrors = (errors) => {
    setFormError(null);
    setFieldErrors(errors);
    setTimeout(() => {
      document.querySelector('[data-invalid="true"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  // ── Package Contents (category === 'Package') ──────────────────────
  // Parehong dropdown-based picker na dati nasa Product modal: pumili ng
  // isang existing product + quantity, "Add" para isama sa listahan. Hindi
  // kasama ang ibang Package products (para maiwasan ang package-within-
  // package) at ang sarili nitong record kapag Edit.
  const [pendingPackageProductId, setPendingPackageProductId] = useState('');
  const [pendingPackageQty, setPendingPackageQty] = useState(1);
  const isEditingPackage = Boolean(editPackageProduct?.id) || (bundle?.category === 'Package' && Boolean(bundle?.id));
  // Anumang existing row (Bundle man o Package) — para sa title/button labels.
  const isEditing = Boolean(bundle?.id || editPackageProduct?.id);

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

      // Package rows now live in the same promo_bundles table as Bundles, so
      // the normal path here is `bundle` with category === 'Package' (e.g.
      // opened from the Product Catalog "Package" tab). `editPackageProduct`
      // is kept only as a legacy fallback and should no longer be hit in
      // practice, since products can't have category 'Package' anymore.
      const isBundleAsPackage = bundle?.category === 'Package';
      const packageSource = isBundleAsPackage ? bundle : editPackageProduct;

      const initialPackageItems = (packageSource?.package_items || []).map(pi => ({
        productId: pi.product_id,
        name: pi.name || '',
        quantity: Number(pi.quantity) || 1,
      }));

      if (isBundleAsPackage) {
        setForm({
          ...emptyForm,
          category: 'Package',
          bundle_name: bundle.bundle_name || '',
          custom_image_url: bundle.custom_image_url || '',
          is_active: bundle.is_active ?? true,
          orderType: bundle.order_type || 'Both',
          price: bundle.discounted_price ?? bundle.bundle_price ?? '',
          packageItems: initialPackageItems,
        });
      } else if (editPackageProduct) {
        setForm({
          ...emptyForm,
          category: 'Package',
          bundle_name: editPackageProduct.name || '',
          custom_image_url: editPackageProduct.image_url || '',
          is_active: editPackageProduct.is_active ?? true,
          orderType: editPackageProduct.order_type || 'Both',
          price: editPackageProduct.price ?? '',
          packageItems: initialPackageItems,
        });
      } else if (bundle) {
        setForm({
          ...emptyForm,
          category: 'Bundle',
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
          orderType: bundle.order_type || 'Both',
        });
      } else {
        setForm(emptyForm);
      }
      setProductSearch('');
      setProductListOpen(false);
      setPendingPackageProductId('');
      setPendingPackageQty(1);
      setPendingBundleProductId('');
      setFormError(null);
      setFieldErrors({});
      setImageError(null);
    }
  }, [isOpen, bundle, editPackageProduct]);

  // Component products na puwedeng idagdag sa Package Contents — hindi
  // kasama ang ibang Package products (iwas package-within-package) at ang
  // sarili nitong record kapag Edit, at hindi na rin puwedeng idagdag ulit
  // ang produktong nasa listahan na.
  const availablePackageProducts = (allProducts || []).filter(p =>
    p.category !== 'Package' &&
    (!isEditingPackage || p.id !== editPackageProduct?.id) &&
    !form.packageItems.some(i => i.productId === p.id)
  );

  // Auto-computed suggested price — sum ng (price ng bawat component product
  // x quantity nito sa package). Info/shortcut lang ito; hindi ito basta
  // pinapalitan ang `form.price` — kailangan pa ring i-click ng admin ang
  // "Use this price" kung gusto niyang gamitin ito.
  const packageComputedTotal = form.packageItems.reduce((sum, item) => {
    const componentProduct = (allProducts || []).find(p => String(p.id) === String(item.productId));
    const unitPrice = Number(componentProduct?.price) || 0;
    return sum + unitPrice * Number(item.quantity || 0);
  }, 0);

  const atMaxPackageProducts = form.packageItems.length >= MAX_PACKAGE_PRODUCTS;

  const addPackageItem = () => {
    if (!pendingPackageProductId) return;
    if (form.packageItems.length >= MAX_PACKAGE_PRODUCTS) {
      setFormError(`You can only add up to ${MAX_PACKAGE_PRODUCTS} products per package.`);
      return;
    }
    const selected = (allProducts || []).find(p => String(p.id) === String(pendingPackageProductId));
    if (!selected) return;
    setForm(prev => ({
      ...prev,
      packageItems: [...prev.packageItems, { productId: selected.id, name: selected.name, quantity: Math.max(1, Number(pendingPackageQty) || 1) }]
    }));
    setFormError(null);
    setPendingPackageProductId('');
    setPendingPackageQty(1);
  };

  const removePackageItem = (productId) => {
    setForm(prev => ({ ...prev, packageItems: prev.packageItems.filter(i => i.productId !== productId) }));
  };

  const updatePackageItemQty = (productId, qty) => {
    setForm(prev => ({
      ...prev,
      packageItems: prev.packageItems.map(i => i.productId === productId ? { ...i, quantity: Math.max(1, Number(qty) || 1) } : i)
    }));
  };


  const filteredProducts = useMemo(() => {
    if (!productSearch) return allProducts;
    return allProducts.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()));
  }, [allProducts, productSearch]);

  const selectedProducts = useMemo(
    () => allProducts.filter(p => form.product_items.some(item => item.productId === p.id)),
    [allProducts, form.product_items]
  );

  const atMaxProducts = form.product_items.length >= MAX_BUNDLE_PRODUCTS;

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

  const availableBundleProducts = (allProducts || []).filter(p =>
    !form.product_items.some(i => i.productId === p.id)
  );

  const addBundleProduct = () => {
    const selected = (allProducts || []).find(p => String(p.id) === String(pendingBundleProductId));
    if (!selected) return;
    toggleProduct(selected);
    setPendingBundleProductId('');
  };

  const toggleProduct = (product) => {
    const exists = form.product_items.some(item => item.productId === product.id);

    // Max 3 products lang per bundle — huwag payagang magdagdag kapag
    // naabot na ang cap.
    if (!exists && form.product_items.length >= MAX_BUNDLE_PRODUCTS) {
      setFormError(`You can only select up to ${MAX_BUNDLE_PRODUCTS} products per bundle.`);
      return;
    }
    setFormError(null);

    setForm(prev => {
      if (exists) {
        return { ...prev, product_items: prev.product_items.filter(item => item.productId !== product.id) };
      }
      let defaultOptions = {};
      if (product.pricing_mode === 'variable' && product.price_groups) {
         product.price_groups.forEach(g => {
           defaultOptions[g.name] = g.options[0];
         });
      }
      return { ...prev, product_items: [...prev.product_items, { productId: product.id, options: defaultOptions }] };
    });

    // Pagkatapos makapili at naabot na ang max (3), isasara na ang picker
    // kasabay ng pag-display ng computed price sa itaas. Puwede pa ring
    // buksan ulit gamit ang "Edit Products" button kung magkakamali.
    if (!exists && form.product_items.length + 1 >= MAX_BUNDLE_PRODUCTS) {
      setProductListOpen(false);
    }
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
    // I-reset ang input para mapili ulit kahit ang parehong file pagkatapos ng error.
    e.target.value = '';
    if (!file) return;

    setImageError(null);
    if (!file.type.startsWith('image/')) {
      setImageError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setImageError('Image is too large. Maximum size is 5MB.');
      return;
    }

    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch(UPLOAD_IMAGE_API, { method: 'POST', credentials: 'include', body: fd });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || result.success === false || !result.url) {
        throw new Error(result.message || result.error || 'Upload failed.');
      }
      // Kung ang kasalukuyang image ay na-upload din sa session na ito (hindi pa saved), burahin na.
      const previousUrl = form.custom_image_url;
      if (previousUrl && sessionUploadsRef.current.has(previousUrl)) {
        sessionUploadsRef.current.delete(previousUrl);
        discardUploadedImage(previousUrl);
      }
      sessionUploadsRef.current.add(result.url);
      setForm(prev => ({ ...prev, custom_image_url: result.url }));
    } catch (err) {
      setImageError(err.message || 'Failed to upload image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSubmitBundle = async () => {
    const errs = computeFieldErrors();
    if (Object.keys(errs).length > 0) {
      showFieldErrors(errs);
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
        category: 'Bundle',
        bundle_name: form.bundle_name.trim(),
        product_ids: cleanProductIds, 
        bundle_options: bundleOptions, 
        discounted_price: computedPrice,
        custom_image_url: form.custom_image_url || null,
        is_active: form.is_active,
        order_type: form.orderType,
        event_tag: form.availabilityMode === 'event' ? (form.event_tag || null) : null,
        start_month: form.availabilityMode === 'dates' ? Number(form.start_month) : null,
        start_day: form.availabilityMode === 'dates' ? Number(form.start_day) : null,
        end_month: form.availabilityMode === 'dates' ? Number(form.end_month) : null,
        end_day: form.availabilityMode === 'dates' ? Number(form.end_day) : null,
      };

      const isUpdate = Boolean(bundle?.id);
      const res = await fetch(`${BUNDLES_API}${isUpdate ? `/${bundle.id}` : ''}`, {
        method: isUpdate ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await parseResponse(res);

      discardSessionUploads(payload.custom_image_url);
      onSaved({ category: 'Bundle', isUpdate });
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to save bundle.');
    } finally {
      setSaving(false);
    }
  };

  // Package rows now live in the promo_bundles table (category: 'Package'),
  // side by side with Bundle rows — kaya dito na rin ito papunta sa
  // BUNDLES_API, hindi na sa PRODUCTS_API. Ito na rin ang dahilan kung bakit
  // hindi na dapat lumalabas ang isang na-add na Package sa Promo Bundle tab:
  // pareho lang sila ngayon ng table, pinaghihiwalay ng `category` field.
  const handleSubmitPackage = async () => {
    const errs = computeFieldErrors();
    if (Object.keys(errs).length > 0) {
      showFieldErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const cleanPackageItems = form.packageItems
        .filter(i => i.productId && Number(i.quantity) > 0)
        .map(i => ({ product_id: i.productId, name: i.name, quantity: Number(i.quantity) }));

      const payload = {
        category: 'Package',
        bundle_name: form.bundle_name.trim(),
        price: Number(form.price),
        custom_image_url: form.custom_image_url || null,
        is_active: form.is_active,
        order_type: form.orderType,
        package_items: cleanPackageItems,
      };

      // `bundle` carries the row being edited (category 'Package' or
      // 'Bundle' — both come through the same prop now). `editPackageProduct`
      // is a legacy fallback that should no longer trigger in practice.
      // Kahit Bundle ang orihinal na category, i-UPDATE pa rin ang parehong row
      // (hindi gagawa ng bago) — para gumana ang Bundle → Package na pagpapalit.
      const editId = bundle?.id || editPackageProduct?.id || null;
      const isUpdate = Boolean(editId);
      const res = await fetch(`${BUNDLES_API}${isUpdate ? `/${editId}` : ''}`, {
        method: isUpdate ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await parseResponse(res);

      discardSessionUploads(payload.custom_image_url);
      onSaved({ category: 'Package', isUpdate });
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to save package.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = () => {
    setFormError(null);
    return form.category === 'Package' ? handleSubmitPackage() : handleSubmitBundle();
  };

  // Category — chooses whether this is a discount Bundle or a stock-deducting
  // Package. Puwede na itong palitan kahit Edit, dahil pareho na silang nasa
  // promo_bundles table (category column lang ang pagitan). Ang name, image
  // at active status ay dinadala; ang mga field na para sa kabilang category
  // lang ang nire-reset.
  const categorySelect = (
    <Select
      label="Category"
      value={form.category}
      onChange={e => {
        const nextCategory = e.target.value;
        setFormError(null);
        setFieldErrors({});
        setForm(prev => ({
          ...emptyForm,
          category: nextCategory,
          bundle_name: prev.bundle_name,
          custom_image_url: prev.custom_image_url,
          is_active: prev.is_active,
          orderType: prev.orderType,
        }));
      }}
    >
      {BUNDLE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
    </Select>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleCancel}
      title={
        form.category === 'Package'
          ? (isEditing ? 'Edit Package' : 'Add Package')
          : (isEditing ? 'Edit Promo Bundle' : 'Add Promo Bundle')
      }
      footer={
        <div className="flex justify-end gap-2 sm:gap-3">
          <Button variant="secondary" className="flex-1 sm:flex-none" onClick={handleCancel} disabled={saving}>Cancel</Button>
          <Button variant="dark" className="flex-1 sm:flex-none" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {form.category === 'Package'
              ? (isEditing ? 'Save Changes' : 'Create Package')
              : (isEditing ? 'Save Changes' : 'Create Bundle')}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 sm:space-y-6">
        {formError && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
            {formError}
          </div>
        )}

        {/* 1. Overview & Image Section */}
        <div className="border border-[#EAE4E0] bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-sm w-full flex flex-col gap-3 sm:gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mb-1.5">
              {form.category === 'Package' ? 'Package Overview' : 'Bundle Overview'}
            </p>
            <div className="grid grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[9rem_repeat(3,minmax(0,1fr))] gap-x-3 sm:gap-x-4 gap-y-3 sm:gap-y-4 items-start">

              {/* Image: nasa kaliwa, katabi ng Name + Choose File */}
              <div data-invalid={imageError ? 'true' : undefined} className="relative shrink-0 row-span-2">
                <div className={`rounded-2xl overflow-hidden border bg-[#F5EFEB] flex items-center justify-center w-28 h-28 sm:w-36 sm:h-36 shadow-sm transition-colors ${imageError ? 'border-red-500' : 'border-[#DED4CC]'}`}>
                  {form.custom_image_url ? (
                    <img
                        src={form.custom_image_url}
                        alt="preview"
                        className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package size={32} className="text-[#DED4CC]" />
                  )}
                </div>
                {form.custom_image_url && (
                  <button
                    type="button"
                    onClick={() => {
                      // Kung bagong upload pa lang (hindi pa saved), burahin agad sa bucket.
                      // Ang naka-save nang image ay buburahin ng backend kapag na-save ang pagbabago.
                      if (sessionUploadsRef.current.has(form.custom_image_url)) {
                        sessionUploadsRef.current.delete(form.custom_image_url);
                        discardUploadedImage(form.custom_image_url);
                      }
                      setForm(prev => ({ ...prev, custom_image_url: '' }));
                      setImageError(null);
                    }}
                    title="Remove image"
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#3B1F0A] text-white flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Name */}
              <div className="relative min-w-0 sm:col-span-3">
                <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${fieldErrors.bundle_name ? 'text-red-500' : 'text-[#8A7264]'}`}>
                  {form.category === 'Package' ? 'Package Name' : 'Bundle Name'} <span className="text-red-500">*</span>
                </label>
                <input value={form.bundle_name} onChange={e => setForm(prev => ({ ...prev, bundle_name: e.target.value }))} placeholder={form.category === 'Package' ? 'e.g. Debut Package A' : 'e.g. Christmas Sweet Deal'} aria-invalid={!!fieldErrors.bundle_name} data-invalid={fieldErrors.bundle_name ? 'true' : undefined} className={`w-full px-3.5 py-2.5 text-xs border rounded-xl outline-none bg-white transition-colors ${fieldErrors.bundle_name ? 'border-red-500 focus:border-red-500' : 'border-[#DED4CC] focus:border-[#5A453C]'}`} />
                {fieldErrors.bundle_name && <span role="alert" className="absolute left-1 top-full mt-0.5 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none">{fieldErrors.bundle_name}</span>}
              </div>

              {/* Choose File: sa ilalim ng Name, pantay sa baba ng image */}
              <div className="min-w-0 self-end sm:self-start flex flex-col gap-1 sm:gap-0">
                <span className="hidden sm:block text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mb-1.5">Image File</span>
                <label className="cursor-pointer w-full">
                  <span className={`flex items-center justify-center gap-1.5 rounded-xl font-semibold text-xs px-4 py-2.5 bg-white border hover:bg-[#F5EFEB] transition-colors w-full text-center ${imageError ? 'border-red-500 text-red-500' : 'border-[#DED4CC] text-[#5A453C]'}`}>
                    {uploadingImage ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Choose File
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                </label>
                {imageError && (
                  <p role="alert" className="text-[10px] leading-3 text-red-500 font-medium px-1">{imageError}</p>
                )}
              </div>

              {/* Natitirang fields: full width sa ilalim ng image */}
              <div className="col-span-2 flex flex-col gap-3 sm:gap-4 min-w-0 sm:contents">
                <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:contents">
                  {categorySelect}
                  <Select label="Order Type" value={form.orderType} onChange={e => setForm(prev => ({ ...prev, orderType: e.target.value }))}>
                    {ORDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </div>

                {form.category === 'Package' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 sm:col-span-4">
                    <Input label="Price" required error={fieldErrors.price} type="number" min="0" value={form.price} onChange={e => setForm(prev => ({ ...prev, price: e.target.value }))} placeholder="0" />
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mb-1.5">Computed Package Price</label>
                      <div className="px-3.5 py-2.5 text-xs rounded-xl bg-[#F5EFEB] text-[#3B1F0A] font-bold h-[38px] flex items-center justify-between gap-2">
                        {packageComputedTotal > 0 ? (
                          <>
                            <span>₱{packageComputedTotal.toLocaleString()}</span>
                            <button
                              type="button"
                              onClick={() => setForm(prev => ({ ...prev, price: packageComputedTotal }))}
                              className="text-[10px] font-bold uppercase tracking-wide text-[#3B1F0A] hover:underline shrink-0"
                            >
                              Use this price
                            </button>
                          </>
                        ) : (
                          <span className="font-normal text-[#8A7264]">Add products first</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:col-span-4">
                      <div className="relative min-w-0">
                        <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 ${fieldErrors.discount_percent ? 'text-red-500' : 'text-[#8A7264]'}`}>Discount % <span className="text-red-500">*</span></label>
                        <input type="number" min="0" max="100" value={form.discount_percent} onChange={e => setForm(prev => ({ ...prev, discount_percent: e.target.value }))} aria-invalid={!!fieldErrors.discount_percent} data-invalid={fieldErrors.discount_percent ? 'true' : undefined} className={`w-full px-3.5 py-2.5 text-xs border rounded-xl outline-none bg-white transition-colors ${fieldErrors.discount_percent ? 'border-red-500 focus:border-red-500' : 'border-[#DED4CC] focus:border-[#5A453C]'}`} />
                        {fieldErrors.discount_percent && <span role="alert" className="absolute left-1 top-full mt-0.5 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none">{fieldErrors.discount_percent}</span>}
                      </div>
                      <div className="min-w-0">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mb-1.5">Computed Price</label>
                        <div className="px-3 sm:px-3.5 py-2.5 text-xs rounded-xl bg-[#F5EFEB] text-[#3B1F0A] font-bold min-h-[38px] flex flex-wrap items-center gap-x-1.5">
                          {originalTotal > 0 ? (
                            <>
                              <span className="line-through text-[#8A7264] font-normal">₱{originalTotal.toLocaleString()}</span>
                              <span>₱{computedPrice.toLocaleString()}</span>
                            </>
                          ) : (
                            <span className="font-normal text-[#8A7264]">Add products first</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer w-fit sm:col-span-4">
                      <input type="checkbox" checked={form.is_active} onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))} className="accent-[#3B1F0A] w-4 h-4 rounded" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#3B1F0A] select-none">Active (visible in online ordering)</span>
                    </label>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Product Selection Section */}
        {form.category === 'Package' ? (
          <>
          <div data-invalid={fieldErrors.products ? 'true' : undefined} className={`border bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-sm w-full transition-colors ${fieldErrors.products ? 'border-red-500' : 'border-[#EAE4E0]'}`}>
            <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${fieldErrors.products ? 'text-red-500' : 'text-[#3B1F0A]'}`}>Package Contents <span className="text-red-500">*</span></p>
            <p className={`text-xs mb-4 ${fieldErrors.products ? 'text-red-500 font-medium' : 'text-[#8A7264]'}`} role={fieldErrors.products ? 'alert' : undefined}>
              {fieldErrors.products
                ? `${fieldErrors.products} (${form.packageItems.length}/${MAX_PACKAGE_PRODUCTS} added).`
                : `Pick ${MIN_PACKAGE_PRODUCTS} to ${MAX_PACKAGE_PRODUCTS} products to include in this package (${form.packageItems.length}/${MAX_PACKAGE_PRODUCTS} added).`}
            </p>

            <div className="flex flex-wrap sm:flex-nowrap gap-2.5 mb-1 items-end">
              <ProductPicker
                label="Add a product"
                value={pendingPackageProductId}
                onChange={setPendingPackageProductId}
                disabled={atMaxPackageProducts}
                placeholder={atMaxPackageProducts ? `Max of ${MAX_PACKAGE_PRODUCTS} products reached` : 'Select a product...'}
                options={availablePackageProducts.map(p => ({ value: p.id, label: p.name }))}
              />
              <div className="w-24 shrink-0">
                <Input label="Qty" type="number" min="1" value={pendingPackageQty} onChange={e => setPendingPackageQty(e.target.value)} />
              </div>
              <Button variant="secondary" type="button" onClick={addPackageItem} disabled={!pendingPackageProductId || atMaxPackageProducts} className="flex-1 sm:flex-none">
                <Plus size={14} /> Add
              </Button>
            </div>

            <div className="mt-3">
              {form.packageItems.length === 0 ? (
                <div className={`text-xs italic p-3 rounded-xl border ${fieldErrors.products ? 'text-red-500 bg-red-50/40 border-red-500' : 'text-gray-400 bg-gray-50 border-gray-100'}`}>
                  No products added yet. Add {MIN_PACKAGE_PRODUCTS} to {MAX_PACKAGE_PRODUCTS} products to create this package.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {form.packageItems.map(item => (
                    <div key={item.productId} className="flex items-center gap-2 sm:gap-2.5 p-2.5 sm:p-3 bg-[#FCFAF9] rounded-2xl border border-[#DED4CC]">
                      <span className="flex-1 min-w-0 text-xs font-bold text-[#3B1F0A] truncate">{item.name}</span>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updatePackageItemQty(item.productId, e.target.value)}
                        className="w-16 text-xs border border-[#DED4CC] rounded-lg px-2 py-1.5 outline-none focus:border-[#5A453C] bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button type="button" onClick={() => removePackageItem(item.productId)} className="text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          </>
        ) : (
        <div data-invalid={fieldErrors.products ? 'true' : undefined} className={`border bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-sm w-full transition-colors ${fieldErrors.products ? 'border-red-500' : 'border-[#EAE4E0]'}`}>
          <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${fieldErrors.products ? 'text-red-500' : 'text-[#3B1F0A]'}`}>Bundle Products <span className="text-red-500">*</span></p>
          <p className={`text-xs mb-4 ${fieldErrors.products ? 'text-red-500 font-medium' : 'text-[#8A7264]'}`} role={fieldErrors.products ? 'alert' : undefined}>
            {fieldErrors.products
              ? `${fieldErrors.products} (${form.product_items.length}/${MAX_BUNDLE_PRODUCTS} added).`
              : `Pick 2 to ${MAX_BUNDLE_PRODUCTS} products to include in this bundle (${form.product_items.length}/${MAX_BUNDLE_PRODUCTS} added).`}
          </p>

          <div className="flex flex-col sm:flex-row gap-2.5 mb-1 items-end">
            <ProductPicker
              label="Add a product"
              value={pendingBundleProductId}
              onChange={setPendingBundleProductId}
              disabled={atMaxProducts}
              placeholder={atMaxProducts ? `Max of ${MAX_BUNDLE_PRODUCTS} products reached` : 'Select a product...'}
              options={availableBundleProducts.map(p => ({
                value: p.id,
                label: `${p.name} — ${p.pricing_mode === 'variable' ? 'Variable Pricing' : `₱${Number(p.price).toLocaleString()}`}`,
              }))}
            />
            <Button variant="secondary" type="button" onClick={addBundleProduct} disabled={!pendingBundleProductId || atMaxProducts} className="w-full sm:w-auto">
              <Plus size={14} /> Add
            </Button>
          </div>

          <div className="mt-3">
            {selectedProducts.length === 0 ? (
              <div className={`text-xs italic p-3 rounded-xl border ${fieldErrors.products ? 'text-red-500 bg-red-50/40 border-red-500' : 'text-gray-400 bg-gray-50 border-gray-100'}`}>
                No products added yet. Add 2 to {MAX_BUNDLE_PRODUCTS} products to create this bundle.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selectedProducts.map(p => {
                  const item = form.product_items.find(i => i.productId === p.id);
                  const currentPrice = getVariantPrice(p, item?.options || {});
                  return (
                    <div key={p.id} className="flex flex-col gap-2 p-2.5 sm:p-3 bg-[#FCFAF9] rounded-2xl border border-[#DED4CC]">
                      <div className="flex items-center gap-2.5">
                        <span className="flex-1 min-w-0 text-xs font-bold text-[#3B1F0A] truncate">{p.name}</span>
                        <span className="text-[10px] font-semibold text-[#8A7264] shrink-0">₱{currentPrice.toLocaleString()}</span>
                        <button type="button" onClick={() => toggleProduct(p)} className="text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {p.pricing_mode === 'variable' && p.price_groups && (
                        <div className="flex flex-wrap gap-3">
                          {p.price_groups.map(g => (
                            <div key={g.name} className="flex-1 min-w-[100px]">
                              <label className="block text-[9px] font-bold uppercase tracking-wider text-[#8A7264] mb-1.5">{g.name}</label>
                              <select
                                value={item?.options?.[g.name] || ''}
                                onChange={(e) => updateItemOption(p.id, g.name, e.target.value)}
                                className="w-full text-xs px-2 py-1.5 rounded-lg border border-[#DED4CC] bg-white outline-none focus:border-[#5A453C]"
                              >
                                {g.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        )}

        {/* 3. Availability UI Section — Bundle only; Packages don't have this. */}
        {form.category !== 'Package' && (
        <div className="border border-[#EAE4E0] bg-white rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-sm w-full">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mb-2">
            When can this be purchased? (Choose one)
          </p>
          <div className="flex gap-1 sm:gap-2 bg-[#F5EFEB] p-1 sm:p-1.5 rounded-xl mb-3 sm:mb-4 border border-[#DED4CC]">
            {[
              { id: 'always', label: 'Always Available' },
              { id: 'event', label: 'Linked to Event' },
              { id: 'dates', label: 'Specific Dates' },
            ].map(mode => (
              <button
                key={mode.id}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, availabilityMode: mode.id }))}
                className={`flex-1 px-1 py-2 text-[11px] sm:text-xs font-bold rounded-lg transition-all ${
                  form.availabilityMode === mode.id
                    ? 'bg-white text-[#3B1F0A] shadow-sm border border-[#DED4CC]'
                    : 'text-[#8A7264] hover:text-[#5A453C]'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>

          <div className="bg-[#FCFAF9] p-3 sm:p-4 rounded-xl border border-[#DED4CC]">
            {form.availabilityMode === 'always' && (
              <p className="text-xs text-[#5A453C] font-medium text-center">
                This will be visible and available for purchase on the menu at any time.
              </p>
            )}

            {form.availabilityMode === 'event' && (
              <div className="relative">
                <p className={`text-[10px] font-bold uppercase tracking-wide mb-2 ${fieldErrors.event_tag ? 'text-red-500' : 'text-[#8A7264]'}`}>Select Event Tag <span className="text-red-500">*</span></p>
                <select
                  value={form.event_tag}
                  onChange={e => setForm(prev => ({ ...prev, event_tag: e.target.value }))}
                  aria-invalid={!!fieldErrors.event_tag}
                  data-invalid={fieldErrors.event_tag ? 'true' : undefined}
                  className={`w-full px-3.5 py-2.5 text-xs border rounded-xl outline-none bg-white text-[#3B1F0A] transition-colors ${fieldErrors.event_tag ? 'border-red-500 focus:border-red-500' : 'border-[#DED4CC] focus:border-[#5A453C]'}`}
                >
                  <option value="">Select an event...</option>
                  {events.map(ev => (
                    <option key={ev.id} value={ev.event_tag}>{ev.event_name}</option>
                  ))}
                </select>
                {fieldErrors.event_tag && <span role="alert" className="absolute left-1 top-full mt-0.5 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none">{fieldErrors.event_tag}</span>}
              </div>
            )}

            {form.availabilityMode === 'dates' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
        )}
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
  // BAGO: para sa pag-edit ng isang "Package" (isang product na may
  // category: 'Package') — dito na rin ito ina-edit ngayon, tulad ng
  // Bundles. Ito ang product object mismo (mula sa allProducts), hindi
  // bundle.
  const [editPackageProduct, setEditPackageProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchAll = async (force = false, silent = false) => {
    if (!silent && (force || bundles.length === 0)) setIsLoading(true);
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
    fetchAll(true);
  }, []);

  useEffect(() => {
    const handleDataChanged = () => fetchAll(true, true);
    window.addEventListener('cake:data-changed', handleDataChanged);
    return () => {
      window.removeEventListener('cake:data-changed', handleDataChanged);
    };
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

  // Kapareho ng editBundleId sa itaas, pero para sa isang "Package" product
  // (na-click ang Edit sa "Package" tab ng Product Catalog).
  useEffect(() => {
    const editProductId = location.state?.editProductId;
    if (!editProductId || allProducts.length === 0) return;
    const target = allProducts.find(p => p.id === editProductId && p.category === 'Package');
    if (target) {
      setEditPackageProduct(target);
      setModalOpen(true);
    }
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, allProducts]);

  // "bundles" state has both categories (Bundle + Package) — old rows that
  // predate the category column are treated as 'Bundle'. This page is the
  // Promo Bundle tab specifically, so Package rows are excluded here; they
  // display under the Product Catalog "Package" tab instead.
  const filtered = bundles.filter(b => {
    if ((b.category || 'Bundle') !== 'Bundle') return false;
    if (!search) return true;
    return b.bundle_name.toLowerCase().includes(search.toLowerCase());
  });

  const handleAdd = () => { setEditBundle(null); setEditPackageProduct(null); setModalOpen(true); };
  const handleEdit = (bundle) => { setEditBundle(bundle); setEditPackageProduct(null); setModalOpen(true); };
  const handleCloseModal = () => { setModalOpen(false); setEditBundle(null); setEditPackageProduct(null); };

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

  // `saveInfo` galing sa BundleFormModal mismo ({ category, isUpdate }) —
  // hindi na ito basehan sa editBundle/editPackageProduct state (laging
  // null pa rin ang mga iyon sa Add flow, kaya dati "Saved." na lang lagi
  // ang toast pag nag-add, hindi "Bundle added." / "Package added.").
  const handleSaved = async (saveInfo = {}) => {
    await fetchAll(true); // force: kailangan bagong datos, hindi stale cache
    const { category, isUpdate } = saveInfo;
    const noun = category === 'Package' ? 'Package' : 'Bundle';
    // Ang Package ay hindi nakalista sa Promo Bundle tab — dalhin sa Package
    // tab ng Product Catalog kung saan talaga ito nakatira.
    if (category === 'Package') {
      navigate('/productAndEvent', {
        state: { category: 'Package', toast: isUpdate ? 'Package updated.' : 'Package added.' },
      });
      return;
    }
    showToast(isUpdate ? `${noun} updated.` : `${noun} added.`);
  };

  const handleDelete = (bundle) => setDeleteTarget(bundle);

  const confirmDelete = async () => {
    try {
      const res = await fetch(`${BUNDLES_API}/${deleteTarget.id}`, { method: 'DELETE', credentials: 'include' });
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
        <div
          className={`fixed bottom-4 right-4 z-[60] text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg ${
            toast.variant === 'warning' || toast.variant === 'error' ? 'bg-red-600' : 'bg-emerald-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-col gap-4 mb-6">
        <SearchBar value={search} onChange={setSearch} placeholder="Search bundle..." className="w-full sm:w-64" />
        <CategoryTabs
          options={TAB_ITEMS}
          activeItem="Promo Bundle"
          onCategoryClick={(opt) => navigate('/productAndEvent', { state: { category: opt } })}
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
              No promo bundles yet. Click "Add Package/Bundle" to create one.
            </div>
          )}
        </div>
      )}

      <BundleFormModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        bundle={editBundle}
        editPackageProduct={editPackageProduct}
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