import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Search, Package, Loader2 } from 'lucide-react';
import ProductModal from './Productmodal';

// ─────────────────────────────────────────────────────────────
// Backend base URL
// ─────────────────────────────────────────────────────────────
const API_BASE = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/online-ordering/products`;

const CATEGORIES = ['All', 'Cake', 'Pastry', 'Package', 'Celebration Material'];

const parseResponse = async (res) => {
  const result = await res.json().catch(() => ({}));
  if (!res.ok || result.success === false) {
    throw new Error(result.message || result.error || 'Something went wrong. Please try again.');
  }
  return result.data;
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

function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-3.5 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors ${
            value === opt ? 'bg-[#3B1F0A] text-white' : 'bg-[#F5EFEB] text-[#8A7264] hover:bg-[#EAE4E0]'
          }`}
        >
          {opt}
        </button>
      ))}
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

// ─────────────────────────────────────────────────────────────
// Product Card (UPDATED)
// ─────────────────────────────────────────────────────────────
function ProductCard({ product, onEdit, onDelete }) {
  const dailyLimit = product.dailyLimit ?? product.daily_limit ?? 0;
  const imageUrl = product.image || product.image_url;
  
  // Checking if the pricing mode is variable based on the database response
  const isVariablePricing = product.pricing_mode === 'variable';

  return (
    <div className="bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden shadow-sm flex flex-col h-full">
      <div className="relative h-36 bg-[#F5EFEB] overflow-hidden shrink-0 flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <Package size={28} className="text-[#DED4CC]" />
        )}
        <div className="absolute top-2 left-2">
          <span className="text-[10px] font-bold uppercase tracking-widest bg-white text-[#3B1F0A] px-2.5 py-1 rounded-full shadow-sm">
            {product.category}
          </span>
        </div>
        {dailyLimit > 0 && (
          <div className="absolute top-2 right-2">
            <span className="text-[10px] font-bold bg-[#3B1F0A] text-white px-2 py-1 rounded-full shadow-sm">
              Limit: {dailyLimit}/day
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-grow">
        <p className="font-bold text-[#3B1F0A] text-sm mb-1 truncate">{product.name}</p>

        <p className="text-[11px] text-[#8A7264] mb-3 truncate leading-relaxed">
          {product.inclusion ? product.inclusion.replace(/\n/g, ' · ') : '\u00A0'}
        </p>

        <div className="mt-auto">
          {/* UPDATED: Displays "Starting at" if pricing is variable */}
          {isVariablePricing && (
            <span className="text-[10px] font-bold text-[#8A7264] uppercase tracking-wider block mb-0.5">
              Starting at
            </span>
          )}
          <p className="text-[15px] font-extrabold text-[#3B1F0A]">
            ₱{Number(product.price).toLocaleString()}.00
          </p>
        </div>
      </div>

      <div className="flex border-t border-[#EAE4E0] shrink-0">
        <button
          onClick={() => onEdit(product)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-[#8A7264] hover:bg-[#F5EFEB] hover:text-[#3B1F0A] transition-colors"
        >
          <Edit2 size={13} />Edit
        </button>
        <div className="w-px bg-[#EAE4E0]" />
        <button
          onClick={() => onDelete(product)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={13} />Delete
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
export default function ProductManagementPage() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const { toast, show: showToast } = useToast();
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchProducts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(API_BASE);
      const data = await parseResponse(res);
      setProducts(data || []);
    } catch (err) {
      console.error('Fetch Products Error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filtered = products.filter(p => {
    const catOk = category === 'All' || p.category === category;
    const searchOk = !search || p.name.toLowerCase().includes(search.toLowerCase());
    return catOk && searchOk;
  });

  const handleEdit = (product) => { setEditProduct(product); setModalOpen(true); };
  const handleAdd = () => { setEditProduct(null); setModalOpen(true); };
  const handleCloseModal = () => { setModalOpen(false); setEditProduct(null); };

  const handleSaveSuccess = async () => {
    await fetchProducts();
    showToast(editProduct?.id ? 'Product updated.' : 'Product added.');
  };

  const handleDelete = (product) => setDeleteTarget(product);

  const confirmDelete = async () => {
    try {
      const res = await fetch(`${API_BASE}/${deleteTarget.id}`, { method: 'DELETE' });
      await parseResponse(res);
      setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
      showToast(`${deleteTarget.name} deleted.`, 'warning');
    } catch (err) {
      console.error('Delete Product Error:', err);
      showToast(err.message || 'Failed to delete product.', 'warning');
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleModalDelete = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' });
      await parseResponse(res);
      setProducts(prev => prev.filter(p => p.id !== id));
      showToast('Product deleted.', 'warning');
      handleCloseModal();
    } catch (err) {
      console.error('Delete Product Error:', err);
      showToast(err.message || 'Failed to delete product.', 'warning');
    }
  };

  return (
    <div>
      <style>{`html { overflow-y: scroll; }`}</style>

      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-[#3B1F0A] text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg">
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#3B1F0A]">Product Catalog</h1>
          <p className="text-xs text-[#8A7264] mt-1">Manage products, pricing, and daily order limits</p>
        </div>
        <Button variant="dark" onClick={handleAdd}>
          <Plus size={14} /> Add Product
        </Button>
      </div>

      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <SearchBar value={search} onChange={setSearch} placeholder="Search product..." className="w-64" />
        <FilterPills options={CATEGORIES} value={category} onChange={setCategory} />
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {filtered.map(p => (
            <ProductCard key={p.id} product={p} onEdit={handleEdit} onDelete={handleDelete} />
          ))}
          {!filtered.length && (
            <div className="col-span-4 text-center py-20 text-[#8A7264] text-xs bg-white rounded-2xl border border-[#EAE4E0]">
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
    </div>
  );
}