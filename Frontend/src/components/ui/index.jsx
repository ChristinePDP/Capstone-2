// ============================================================
// REUSABLE UI COMPONENTS — Aileen & Niculus POS
// ============================================================
/* eslint-disable react-refresh/only-export-components */
import { useState, createContext, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; // Dinagdag para sa Portal fix[cite: 13]
import { X, Search, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

// ─── Badge ────────────────────────────────────────────────────
export function Badge({ children, variant = 'default', className = '' }) {
  const variants = {
    default:   'bg-gray-100 text-gray-700',
    confirmed: 'bg-blue-100 text-blue-700',
    ready:     'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
    preorder:  'bg-purple-100 text-purple-700',
    buynow:    'bg-green-100 text-green-700',
    success:   'bg-green-100 text-green-700',
    warning:   'bg-amber-100 text-amber-700',
    danger:    'bg-red-100 text-red-700',
    deposit:   'bg-amber-100 text-amber-700',
    paid:      'bg-green-100 text-green-700',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${variants[variant] || variants.default} ${className}`}>
      {children}
    </span>
  );
}

// ─── Button ───────────────────────────────────────────────────
export function Button({ children, variant = 'primary', size = 'md', className = '', disabled = false, onClick, type = 'button', ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-sans';
  const variants = {
    primary:   'bg-brand-600 text-white hover:bg-brand-700 active:scale-[0.98]',
    secondary: 'bg-white text-brand-700 border border-brand-300 hover:bg-brand-50',
    ghost:     'bg-transparent text-brand-600 hover:bg-brand-50',
    danger:    'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100',
    dark:      'bg-brand-700 text-white hover:bg-brand-800',
  };
  const sizes = { sm: 'text-xs px-3 py-1.5', md: 'text-sm px-4 py-2', lg: 'text-sm px-5 py-2.5' };
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={`${base} ${variants[variant] || variants.primary} ${sizes[size] || sizes.md} ${className}`} {...props}>
      {children}
    </button>
  );
}

// ─── Input Fields ─────────────────────────────────────────────
export function Input({ label, hint, required, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[11px] font-bold uppercase tracking-wider text-brand-500">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      <input className={`px-3 py-2 border border-brand-200 rounded-lg text-sm text-brand-900 font-sans outline-none focus:border-brand-400 bg-white placeholder:text-brand-300 transition-colors ${error ? 'border-red-400' : ''} ${className}`} {...props} />
      {hint && <span className="text-[11px] text-brand-400">{hint}</span>}
      {error && <span className="text-[11px] text-red-500">{error}</span>}
    </div>
  );
}

export function Select({ label, required, children, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[11px] font-bold uppercase tracking-wider text-brand-500">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      <select className={`px-3 py-2 border border-brand-200 rounded-lg text-sm text-brand-900 font-sans outline-none focus:border-brand-400 bg-white transition-colors cursor-pointer ${className}`} {...props}>{children}</select>
    </div>
  );
}

export function Textarea({ label, hint, required, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[11px] font-bold uppercase tracking-wider text-brand-500">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      <textarea className={`px-3 py-2 border border-brand-200 rounded-lg text-sm text-brand-900 font-sans outline-none focus:border-brand-400 bg-white resize-none transition-colors ${className}`} {...props} />
      {hint && <span className="text-[11px] text-brand-400">{hint}</span>}
    </div>
  );
}

// ─── Modal (UPDATED WITH PORTAL FIX) ──────────────────────────
export function Modal({ isOpen, onClose, title, subtitle, size = 'md', children, footer }) {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  // createPortal ensures the modal is rendered at the body level[cite: 13]
  return createPortal(
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-brand-900/50 backdrop-blur-sm" 
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`bg-white rounded-2xl w-full ${sizes[size] || sizes.md} shadow-2xl flex flex-col max-h-[92vh] animate-modalIn`}>
        <div className="flex items-start justify-between p-5 border-b border-brand-100 shrink-0">
          <div>
            <h2 className=" text-lg font-bold text-brand-800">{title}</h2>
            {subtitle && <p className="text-xs text-brand-400 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg border border-brand-200 flex items-center justify-center text-brand-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-all shrink-0 ml-4">
            <X size={15} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="p-4 border-t border-brand-100 shrink-0">{footer}</div>}
      </div>
    </div>,
    document.body // Dito itatapon ang modal para hindi ma-trap[cite: 13]
  );
}

// ─── Card Components ──────────────────────────────────────────
export function Card({ children, className = '', ...props }) {
  return <div className={`bg-white rounded-xl border border-brand-200 shadow-sm ${className}`} {...props}>{children}</div>;
}

export function StatCard({ label, value, delta, deltaDir, icon, accentColor = 'bg-brand-400' }) {
  const isUp = deltaDir === 'up';
  return (
    <Card className="p-5 relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${accentColor}`} />
      {icon && <div className="mb-3">{icon}</div>}
      <p className="text-[11px] font-bold uppercase tracking-wider text-brand-400 mb-1">{label}</p>
      <p className="font-serif text-2xl font-bold text-brand-800 mb-2">{value}</p>
      {delta && <p className={`text-xs font-semibold flex items-center gap-1 ${isUp ? 'text-green-600' : 'text-red-500'}`}><span>{isUp ? '↑' : '↓'}</span><span>{delta}</span></p>}
    </Card>
  );
}

// ─── Table Components ─────────────────────────────────────────
export function Table({ columns, children, className = '' }) {
  return (
    <div className={`overflow-auto ${className}`}>
      <table className="w-full border-collapse min-w-full">
        <thead>
          <tr className="bg-brand-600 border-b border-brand-200">
            {columns.map((col, i) => (
              <th key={i} className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white text-left whitespace-nowrap ${col.align === 'right' ? 'text-right' : ''} ${col.align === 'center' ? 'text-center' : ''}`}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, onClick, className = '' }) {
  return (
    <tr className={`border-b border-brand-100 last:border-0 hover:bg-brand-50/50 transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`} onClick={onClick}>{children}</tr>
  );
}

export function Td({ children, className = '', align = 'left', colSpan, ...props }) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3 text-sm text-brand-800 ${align === 'right' ? 'text-right' : ''} ${align === 'center' ? 'text-center' : ''} ${className}`} {...props}>{children}</td>
  );
}

// ─── Navigation & Search ──────────────────────────────────────
export function Pagination({ page, total, perPage, count, onChange }) {
  const totalPages = Math.ceil(count / perPage);
  if (totalPages <= 1) return null;
  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, count);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-brand-100">
      <span className="text-xs text-brand-400">Showing {start}–{end} of {count} {total}</span>
      <div className="flex gap-1">
        <button disabled={page === 1} onClick={() => onChange(page - 1)} className="w-8 h-8 rounded-lg border border-brand-200 flex items-center justify-center text-brand-400 hover:border-brand-400 disabled:opacity-30 disabled:cursor-not-allowed text-sm">‹</button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
          <button key={p} onClick={() => onChange(p)} className={`w-8 h-8 rounded-lg border text-sm font-semibold transition-all ${p === page ? 'bg-brand-600 border-brand-600 text-white' : 'border-brand-200 text-brand-500 hover:border-brand-400'}`}>{p}</button>
        ))}
        <button disabled={page === totalPages} onClick={() => onChange(page + 1)} className="w-8 h-8 rounded-lg border border-brand-200 flex items-center justify-center text-brand-400 hover:border-brand-400 disabled:opacity-30 disabled:cursor-not-allowed text-sm">›</button>
      </div>
    </div>
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search...', className = '' }) {
  return (
    <div className={`flex items-center gap-2 bg-white border border-brand-200 rounded-lg px-3 py-2 ${className}`}>
      <Search size={14} className="text-brand-300 shrink-0" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="outline-none bg-transparent text-sm text-brand-800 placeholder:text-brand-300 w-full font-sans" />
    </div>
  );
}

export function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(opt => (
        <button key={opt} onClick={() => onChange(opt)} className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all border ${value === opt ? 'bg-brand-700 text-white border-brand-700' : 'bg-white text-brand-500 border-brand-200 hover:border-brand-400'}`}>{opt}</button>
      ))}
    </div>
  );
}

export function LevelBar({ stock, min }) {
  const pct = min > 0 ? Math.min(Math.round((stock / min) * 100), 100) : 100;
  const color = pct < 50 ? 'bg-red-500' : pct < 100 ? 'bg-amber-500' : 'bg-green-500';
  return (
    <div className="flex flex-col gap-0.5">
      <div className="h-1.5 w-20 bg-brand-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-brand-400">{pct}%</span>
    </div>
  );
}

// ─── Toast System ─────────────────────────────────────────────
const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Set());

  const show = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);

    const timerId = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timersRef.current.delete(timerId);
    }, 3200);

    timersRef.current.add(timerId);
  };

  // Kanselahin lahat ng natitirang timer kapag nag-unmount ang provider
  // (hal. sa dulo ng bawat test), para hindi na sumubok mag-set ng state
  // matapos matanggal ang component sa DOM.
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timerId => clearTimeout(timerId));
      timersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium animate-slideUp max-w-xs pointer-events-auto ${t.type === 'success' ? 'bg-brand-800 text-white' : t.type === 'warning' ? 'bg-amber-700 text-white' : 'bg-red-700 text-white'}`}>
            {t.type === 'success' && <CheckCircle size={16} />}
            {t.type === 'warning' && <AlertCircle size={16} />}
            {(t.type === 'error' || t.type === 'danger') && <XCircle size={16} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
};

// ─── Confirm Modal (UPDATED WITH PORTAL FIX) ──────────────────
export function ConfirmModal({ isOpen, onClose, onConfirm, title, message, confirmLabel = 'Confirm', variant = 'danger' }) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-brand-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 animate-modalIn">
        <h3 className=" text-lg font-bold text-brand-800 mb-2">{title}</h3>
        <p className="text-sm text-brand-500 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={variant} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body // Inilabas din sa body[cite: 13]
  );
}
