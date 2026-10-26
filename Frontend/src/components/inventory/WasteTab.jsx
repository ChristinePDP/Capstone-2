import { useState, useMemo, useRef, useEffect } from 'react';
import { AlertTriangle, Search, Filter, Plus, RotateCcw, ListChecks, X, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Textarea, Table, Tr, Td, Pagination, Badge, Card, ConfirmModal, TableSkeleton, CardSkeleton, useUnsavedChanges } from '../../components/ui/index';
import { sanitizeNumericText, getQtyError, MAX_QTY } from '../../utils/numberGuards';
import { useIsCompact } from '../../hooks/useIsCompact';

const PER_PAGE = 10;

// ── Inline-validated fields (EventManager layout) ─────────────────────────
// Pulang border + pulang label, at ang error message ay nasa mismong field
// (overlay sa ilalim ng input, hindi nagdadagdag ng taas kaya hindi gumagalaw
// ang form). Kapag may `hint`, itinatago ito habang may error para hindi magpatong.
const ERR_CLS = 'absolute left-1 text-[10px] leading-3 text-red-500 whitespace-nowrap pointer-events-none';

function FieldShell({ label, required, error, hint, children }) {
  return (
    <div className="w-full min-w-0">
      {label && (
        <label className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 block ${error ? 'text-red-500' : 'text-brand-500'}`}>
          {label} {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {children}
        {!hint && error && <span role="alert" className={`${ERR_CLS} top-full mt-0.5`}>{error}</span>}
      </div>
      {hint && (
        <div className="relative mt-1.5">
          <p className={`text-[10px] text-[#8A7264] leading-snug ${error ? 'invisible' : ''}`}>{hint}</p>
          {error && <span role="alert" className={`${ERR_CLS} top-0`}>{error}</span>}
        </div>
      )}
    </div>
  );
}

function FormInput({ label, required, error, hint, suffix, className = '', ...props }) {
  return (
    <FieldShell label={label} required={required} error={error} hint={hint}>
      <input
        aria-invalid={!!error}
        data-invalid={error ? 'true' : undefined}
        className={`w-full border rounded-xl py-2.5 text-xs outline-none bg-white transition-colors ${suffix ? 'pl-3.5 pr-12' : 'px-3.5'} ${error ? 'border-red-500 focus:border-red-500' : 'border-[#DED4CC] focus:border-[#5A453C]'} ${className}`}
        {...props}
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-brand-400 pointer-events-none">
          {suffix}
        </span>
      )}
    </FieldShell>
  );
}

function FormSelect({ label, required, error, hint, className = '', children, ...props }) {
  return (
    <FieldShell label={label} required={required} error={error} hint={hint}>
      <select
        aria-invalid={!!error}
        data-invalid={error ? 'true' : undefined}
        className={`w-full border rounded-xl px-3 py-2.5 text-xs outline-none bg-white transition-colors cursor-pointer ${error ? 'border-red-500 focus:border-red-500' : 'border-[#DED4CC] focus:border-[#5A453C]'} ${className}`}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
}

// Select na may search (dropdown na may "Type to search..." sa taas ng listahan).
// options: [{ value, label }]
function SearchableSelect({
  label, required, error, hint, value, options, onChange,
  placeholder = '— Select —', searchPlaceholder = 'Type to search...', emptyText = 'No results found',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find(o => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const close = () => { setOpen(false); setQuery(''); };
  const choose = (opt) => { onChange(opt.value); close(); };

  // click sa labas = isara
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // pagbukas: i-start sa napiling item
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex(o => o.value === value);
    setActiveIdx(idx >= 0 ? idx : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // balik sa unang resulta kapag nagbago ang search
  useEffect(() => { setActiveIdx(0); }, [query]);

  // panatilihing kita ang active item habang nag-a-arrow key
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'Tab') close();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) choose(filtered[activeIdx]); }
  };

  return (
    <FieldShell label={label} required={required} error={error} hint={hint}>
      <div ref={wrapRef} className="relative" onKeyDown={onKeyDown}>
        <div
          className={`w-full flex items-center gap-2 border rounded-xl px-3 py-2.5 text-xs bg-white transition-colors cursor-text ${error ? 'border-red-500' : open ? 'border-[#5A453C]' : 'border-[#DED4CC]'}`}
          onClick={() => { setOpen(true); searchRef.current?.focus(); }}
        >
          <input
            ref={searchRef}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-autocomplete="list"
            aria-invalid={!!error}
            data-invalid={error ? 'true' : undefined}
            autoComplete="off"
            value={open ? query : (selected ? selected.label : '')}
            onFocus={() => setOpen(true)}
            onChange={e => { setQuery(e.target.value); if (!open) setOpen(true); }}
            placeholder={open && selected ? selected.label : (open ? searchPlaceholder : placeholder)}
            className={`min-w-0 flex-1 truncate text-xs outline-none bg-transparent ${selected && !open ? 'text-[#3B1F0A]' : 'text-[#3B1F0A]'} ${open && selected ? 'placeholder:text-[#3B1F0A]' : 'placeholder:text-[#8A7264]'}`}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label={open ? 'Close list' : 'Open list'}
            onMouseDown={e => e.preventDefault()}
            onClick={e => { e.stopPropagation(); if (open) close(); else { setOpen(true); searchRef.current?.focus(); } }}
            className="shrink-0 text-[#8A7264]"
          >
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {open && (
          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-[#DED4CC] rounded-xl shadow-lg overflow-hidden">
            <ul ref={listRef} role="listbox" className="max-h-56 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3.5 py-3 text-xs text-[#8A7264] text-center">{emptyText}</li>
              ) : filtered.map((opt, idx) => {
                const isSel = opt.value === value;
                return (
                  <li
                    key={`${opt.value}-${idx}`}
                    role="option"
                    aria-selected={isSel}
                    data-active={idx === activeIdx ? 'true' : undefined}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => choose(opt)}
                    className={`flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs cursor-pointer ${idx === activeIdx ? 'bg-brand-50' : ''} ${isSel ? 'font-bold text-[#3B1F0A]' : 'text-[#6B5648]'}`}
                  >
                    <span className="min-w-0 break-words">{opt.label}</span>
                    {isSel && <Check size={13} className="shrink-0 text-[#8A7264]" />}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </FieldShell>
  );
}

const REASONS = {
  ingredient: ['Spoiled', 'Expiring Soon', 'Spilled/Wasted', 'Pest Damage', 'Other'],
  product: ['Unsold', 'Damaged', 'Expired', 'Quality Defect', 'Other'],
  material: ['Popped/Butas', 'Damaged', 'Misprinted', 'Lost', 'Other']
};

const TYPE_LABELS = { ingredient: 'Ingredient', product: 'Product', material: 'Product Material' };

const formatLocal = (isoString) => {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) + ' · ' + 
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return isoString;
  }
};

export default function WasteTab() {
  const { 
    logWaste, 
    voidWasteLog,
    wasteLogs = [], 
    ingredients = [], 
    products = [], 
    materials = [],
    loading,
  } = useApp() || {};

  // Product materials lang ang may stock sa shop; ang celebration materials
  // ay galing sa ibang shop kaya hindi kasama sa waste log.
  const productMaterials = useMemo(
    () => materials.filter(m => (m.materialType ?? m.material_type) === 'product'),
    [materials]
  );

  const { show: showToast } = useToast();
  const [containerRef, isCompact] = useIsCompact();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterDate, setFilterDate] = useState('All');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkVoidConfirm, setShowBulkVoidConfirm] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const isVoidingRef = useRef(false);

  const [selectionMode, setSelectionMode] = useState(false);

  const enterSelectionMode = () => setSelectionMode(true);
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [logType, setLogType] = useState('ingredient');

  const [ingName, setIngName] = useState('');
  const [ingQty, setIngQty] = useState('');
  const [ingUnit, setIngUnit] = useState('kg');

  const [productName, setProductName] = useState('');
  const [productQty, setProductQty] = useState('');
  const [productUnit, setProductUnit] = useState('pcs');

  const [matName, setMatName] = useState('');
  const [matQty, setMatQty] = useState('');
  const [matUnit, setMatUnit] = useState('pcs');

  const [reason, setReason] = useState('Spoiled');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState({}); // inline field errors ng modal
  const [serverError, setServerError] = useState(null); // save error — ipinapakita sa loob ng modal

  const filteredLogs = useMemo(() => {
    return wasteLogs.filter(log => {
      const matchesSearch = log.item?.toLowerCase().includes(search.toLowerCase()) || 
                            log.reason?.toLowerCase().includes(search.toLowerCase()) ||
                            (log.notes && log.notes.toLowerCase().includes(search.toLowerCase()));
      const matchesType = filterType === 'All' || log.type === filterType;

      if (!matchesSearch || !matchesType) return false;
      if (filterDate === 'All') return true;

      if (!log.dt) return false;
      const logDate = new Date(log.dt);
      const now = new Date();

      if (filterDate === 'Today') {
        return logDate.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' }) ===
               now.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
      }
      if (filterDate === 'This Week') {
        const diffTime = Math.abs(now - logDate);
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) <= 7;
      }
      if (filterDate === 'This Month') {
        return logDate.getMonth() === now.getMonth() && logDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [wasteLogs, search, filterType, filterDate]);

  const pagedLogs = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filteredLogs.slice(start, start + PER_PAGE);
  }, [filteredLogs, page]);

  const WASTE_TYPE_OPTIONS = [
    { value: 'ingredient', label: 'Ingredient' },
    { value: 'product', label: 'Finished Product' },
    { value: 'material', label: 'Product Material' },
  ];

  // Nire-reset ang item/qty ng lahat ng type para walang maiwang pinili
  // mula sa ibang kategorya (iwas pagkakahalo ng ingredient/product/material).
  const resetItemFields = () => {
    setIngName(''); setIngQty(''); setIngUnit('kg');
    setProductName(''); setProductQty(''); setProductUnit('pcs');
    setMatName(''); setMatQty(''); setMatUnit('pcs');
  };

  const handleOpenLogModal = (type = 'ingredient') => {
    // Kapag nasa void/selection mode, kanselahin muna bago mag-log ng waste.
    if (selectionMode) exitSelectionMode();
    setLogType(type);
    setReason(REASONS[type][0]);
    setNotes('');
    resetItemFields();
    setIsSaving(false);
    setFormErrors({});
    setServerError(null);
    setModalOpen(true);
  };

  // Kapag pinalitan ang Waste Type sa loob ng modal: bagong listahan ng item
  // at bagong listahan ng reason ayon sa napiling type.
  const handleTypeChange = (type) => {
    setLogType(type);
    setReason(REASONS[type][0]);
    resetItemFields();
    setFormErrors({});
    setServerError(null);
  };

  // ── Inline validation (EventManager style) ────────────────────────────────
  // Binubuo ang payload at ang mga error ng form sa iisang lugar para pareho
  // ang rules sa pag-save at sa live na pag-clear ng error.
  const buildLog = () => {
    const errs = {};
    let finalItem = '';
    let rawQty = 0;
    let computedCost = 0;
    let finalUnit = '';
    let selectedItemStock = 0;
    let qtyText = '';
    let inventoryItemId = null;

    if (logType === 'ingredient') {
      const match = ingredients.find(i => i.name === ingName);
      if (!ingName) errs.item = 'Please select an ingredient.';
      selectedItemStock = match ? match.stock : 0;
      inventoryItemId = match?.id || null;
      finalItem = ingName;
      qtyText = ingQty;
      rawQty = parseFloat(ingQty);
      finalUnit = match?.unit || ingUnit;
      computedCost = (match?.costPerUnit || 0) * rawQty;
    } else if (logType === 'product') {
      const match = products.find(p => p.name === productName);
      if (!productName) errs.item = 'Please select a product.';
      selectedItemStock = match ? match.stock : 0;
      inventoryItemId = match?.id || null;
      finalItem = productName;
      qtyText = productQty;
      rawQty = parseInt(productQty, 10);
      finalUnit = productUnit;
      computedCost = (match?.estimatedCost || 45) * rawQty;
    } else if (logType === 'material') {
      const match = productMaterials.find(m => m.name === matName);
      if (!matName) errs.item = 'Please select a product material.';
      selectedItemStock = match ? match.stock : 0;
      inventoryItemId = match?.id || null;
      finalItem = matName;
      qtyText = matQty;
      rawQty = parseFloat(matQty);
      finalUnit = match?.unit || matUnit;
      computedCost = (match?.costPerUnit || 0) * rawQty;
    }

    if (!String(qtyText).trim()) {
      errs.qty = 'Quantity is required.';
    } else if (!Number.isFinite(rawQty) || rawQty <= 0) {
      errs.qty = 'Must be greater than zero.';
    } else if (finalItem && rawQty > selectedItemStock) {
      errs.qty = `Not enough stock — only ${selectedItemStock} left.`;
    } else {
      const overflow = getQtyError(rawQty, { max: MAX_QTY, label: 'Quantity' });
      if (overflow) errs.qty = overflow;
    }

    const payload = {
      waste_type: logType,
      item_name: finalItem,
      raw_ingredient_id: logType === 'ingredient' ? inventoryItemId : null,
      material_id: logType === 'material' ? inventoryItemId : null,
      quantity: rawQty,
      unit: finalUnit ? String(finalUnit) : (logType === 'ingredient' ? 'kg' : 'pcs'),
      cost: computedCost,
      reason: reason,
      notes: notes.trim()
    };

    return { errs, payload };
  };

  // Mawawala agad ang error ng field na naayos na habang nagta-type.
  useEffect(() => {
    setFormErrors(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const latest = buildLog().errs;
      const next = {};
      keys.forEach(k => { if (latest[k]) next[k] = latest[k]; });
      return Object.keys(next).length === keys.length ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logType, ingName, ingQty, matName, matQty, productName, productQty]);

  const handleLog = async () => {
    if (isSaving) return;
    setServerError(null);

    const { errs, payload: backendPayload } = buildLog();
    if (Object.keys(errs).length > 0) {
      setFormErrors(errs);
      setTimeout(() => {
        document.querySelector('[data-invalid="true"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    setFormErrors({});

    setIsSaving(true);
    try {
      if (logWaste) {
        await logWaste(backendPayload);
        showToast('Waste record logged successfully.', 'success');
      }
      setModalOpen(false);
    } catch (err) {
      // Ipinapakita sa loob ng modal (hindi toast sa labas)
      setServerError(err.message || 'Something went wrong while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const closeGuard = useUnsavedChanges({
    isOpen: modalOpen,
    values: { logType, ingName, ingQty, ingUnit, productName, productQty, productUnit, matName, matQty, matUnit, reason, notes },
    initialValues: { logType, ingName: '', ingQty: '', ingUnit: 'kg', productName: '', productQty: '', productUnit: 'pcs', matName: '', matQty: '', matUnit: 'pcs', reason: REASONS[logType][0], notes: '' },
    onClose: () => setModalOpen(false),
    onSave: handleLog,
    isSaving,
  });

  const totalCostFiltered = useMemo(() => {
    return filteredLogs.reduce((acc, curr) => acc + (curr.cost || 0), 0);
  }, [filteredLogs]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allPagedSelected = pagedLogs.length > 0 && pagedLogs.every(log => selectedIds.has(log.id));
  const toggleSelectAllOnPage = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPagedSelected) {
        pagedLogs.forEach(log => next.delete(log.id));
      } else {
        pagedLogs.forEach(log => next.add(log.id));
      }
      return next;
    });
  };

  const selectedLogs = useMemo(
    () => wasteLogs.filter(log => selectedIds.has(log.id)),
    [wasteLogs, selectedIds]
  );

  const handleBulkVoid = async () => {
    if (isVoidingRef.current || selectedLogs.length === 0) return;
    isVoidingRef.current = true;
    setIsVoiding(true);

    const results = await Promise.allSettled(
      selectedLogs.map(log => voidWasteLog(log.id))
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;

    if (failed === 0) {
      showToast(`Voided ${succeeded} record${succeeded > 1 ? 's' : ''}. Stock restored.`, 'success');
    } else if (succeeded === 0) {
      showToast(`Failed to void ${failed} record${failed > 1 ? 's' : ''}. Please try again.`, 'error');
    } else {
      showToast(`Voided ${succeeded}, but ${failed} failed — please retry those.`, 'warning');
    }

    exitSelectionMode();
    setShowBulkVoidConfirm(false);
    isVoidingRef.current = false;
    setIsVoiding(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        {/* HEADER SECTION */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-brand-100 gap-3">
          <div>
            <h3 className="font-bold text-brand-800 flex items-center gap-2 text-base">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              Waste Log
            </h3>
            <p className="text-xs text-brand-400 mt-0.5">Log spoiled, expired, or unsold items to deduct from stock.</p>
          </div>

          {/* ACTION BUTTONS (Only Void is RED) */}
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <Button
              variant="dark"
              onClick={() => handleOpenLogModal()}
              className="flex-1 sm:flex-none justify-center"
            >
              <Plus size={14} /> Log Waste
            </Button>
            <Button
              variant="danger"
              onClick={selectionMode ? exitSelectionMode : enterSelectionMode}
              className={`w-full sm:w-auto justify-center ${selectionMode ? 'ring-2 ring-red-400' : ''}`}
            >
              <ListChecks size={14} /> Select to Void
            </Button>
          </div>
        </div>

        {/* SEARCH, FILTER & RESPONSIVE ESTIMATED LOSS */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 px-4 py-3 border-b border-brand-100 bg-brand-50/30">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 min-w-0">
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search waste log..." 
                value={search} 
                onChange={e => { setSearch(e.target.value); setPage(1); }} 
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-brand-200 rounded-lg outline-none focus:border-brand-500 bg-white" 
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="flex-1 sm:flex-none flex items-center gap-1.5 bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-xs text-brand-700">
                <Filter size={13} className="text-gray-400 shrink-0" />
                <select className="bg-transparent text-xs outline-none w-full cursor-pointer font-medium" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
                  <option value="All">All Categories</option>
                  <option value="ingredient"> Ingredient</option>
                  <option value="product">Finished Product</option>
                  <option value="material">Product Material</option>
                </select>
              </div>

              <div className="flex-1 sm:flex-none flex items-center gap-1.5 bg-white border border-brand-200 rounded-lg px-2.5 py-1.5 text-xs text-brand-700">
                <select className="bg-transparent text-xs outline-none w-full cursor-pointer font-medium" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(1); }}>
                  <option value="All">All Time</option>
                  <option value="Today">Today</option>
                  <option value="This Week">This Week</option>
                  <option value="This Month">This Month</option>
                </select>
              </div>
            </div>
          </div>

          {/* ESTIMATED LOSS STAT - RESPONSIVE MOBILE DISPLAY */}
          <div className="flex items-center justify-between md:justify-end gap-2 bg-red-50/80 border border-red-200/80 px-3.5 py-2 rounded-lg w-full md:w-auto shrink-0">
            <span className="text-xs font-bold text-red-900/80 uppercase tracking-wider">Estimated Loss:</span>
            <span className="text-base font-black text-red-600 whitespace-nowrap">₱{totalCostFiltered.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* SELECTION MODE BANNER */}
        {selectionMode && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-red-50 border-b border-red-200 text-xs">
            <span className="font-bold text-red-900">
              {selectedIds.size > 0
                ? `${selectedIds.size} record${selectedIds.size > 1 ? 's' : ''} selected — tap a row's checkbox to void`
                : 'Select records to void by clicking their checkboxes'}
            </span>
            <div className="flex items-center gap-2 self-end sm:self-auto">
              {selectedIds.size > 0 && (
                <Button size="sm" variant="danger" onClick={() => setShowBulkVoidConfirm(true)}>
                  <RotateCcw size={13} className="mr-1" /> Void Selected ({selectedIds.size})
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={exitSelectionMode}>
                <X size={13} className="mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {/* CONTENT AREA */}
        <div ref={containerRef} className="p-4">
          
          {isCompact ? (
          /* CARDS WITH RED HIGHLIGHT ON SELECTION */
          <div className="space-y-3">
            {pagedLogs.map(log => {
              const isSelected = selectionMode && selectedIds.has(log.id);
              return (
                <div 
                  key={log.id} 
                  className={`p-3.5 rounded-xl border transition-all duration-150 space-y-2 min-w-0 ${
                    isSelected 
                      ? 'border-red-500 bg-red-50/80 ring-2 ring-red-400 shadow-xs' 
                      : 'border-brand-100 bg-white shadow-2xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {selectionMode && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(log.id)}
                          onChange={() => toggleSelect(log.id)}
                          className="mt-0.5 h-4 w-4 accent-red-600 shrink-0 cursor-pointer"
                        />
                      )}
                      <div className="min-w-0">
                        <h4 className="font-bold text-brand-900 text-sm truncate">{log.item}</h4>
                        <p className="text-[11px] text-gray-400">{formatLocal(log.dt)}</p>
                      </div>
                    </div>
                    <Badge variant={log.type === 'ingredient' ? 'warning' : log.type === 'product' ? 'info' : 'default'} className="shrink-0 text-[10px]">
                      {TYPE_LABELS[log.type] || log.type}
                    </Badge>
                  </div>

                  <div className={`grid grid-cols-2 gap-2 text-xs p-2 rounded-lg border ${isSelected ? 'bg-white/80 border-red-200' : 'bg-brand-50/50 border-brand-100/50'}`}>
                    <div>
                      <span className="text-gray-400 block text-[10px] font-medium">Quantity</span>
                      <span className="font-bold text-gray-800">{log.qty}</span>
                    </div>
                    <div>
                      <span className="text-gray-400 block text-[10px] font-medium">Loss</span>
                      <span className="font-bold text-red-600">₱{log.cost?.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-gray-400 text-[11px]">Reason:</span>
                      <span className="font-semibold text-red-700 bg-red-100/70 px-1.5 py-0.5 rounded text-[11px]">{log.reason}</span>
                    </div>
                    {log.notes && (
                      <p className="text-gray-600 text-[11px] truncate">
                        <span className="text-gray-400">Notes:</span> {log.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          ) : (
          /* TABLE WITH RED HIGHLIGHT ON SELECTION */
          <div className="overflow-x-auto">
            <Table columns={[
              ...(selectionMode && filteredLogs.length > 0 ? [{
                label: (
                  <input
                    type="checkbox"
                    checked={allPagedSelected}
                    onChange={toggleSelectAllOnPage}
                    className="accent-red-600 cursor-pointer"
                  />
                )
              }] : []),
              { label: 'Date & Time' },
              { label: 'Category' },
              { label: 'Item Name' },
              { label: 'Qty' },
              { label: 'Loss (₱)' },
              { label: 'Reason' },
              { label: 'Notes' },
            ]}>
              {!filteredLogs.length && !loading && (
                <tr>
                  <td colSpan={7} className="text-center text-gray-400 py-10 text-sm">
                    No waste records found.
                  </td>
                </tr>
              )}
              {pagedLogs.map(log => {
                const isSelected = selectionMode && selectedIds.has(log.id);
                return (
                  <Tr key={log.id} className={isSelected ? 'bg-red-100/70 font-medium' : ''}>
                    {selectionMode && (
                      <Td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(log.id)}
                          onChange={() => toggleSelect(log.id)}
                          className="accent-red-600 cursor-pointer"
                        />
                      </Td>
                    )}
                    <Td className="text-xs text-gray-500 whitespace-nowrap">{formatLocal(log.dt)}</Td>
                    <Td>
                      <Badge variant={log.type === 'ingredient' ? 'warning' : log.type === 'product' ? 'info' : 'default'} className="whitespace-nowrap">
                        {TYPE_LABELS[log.type] || log.type}
                      </Badge>
                    </Td>
                    <Td className="font-bold text-brand-900">{log.item}</Td>
                    <Td>{log.qty}</Td>
                    <Td className="font-semibold text-red-600">₱{log.cost?.toFixed(2)}</Td>
                    <Td>
                      <span className="text-xs font-bold text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded">
                        {log.reason}
                      </span>
                    </Td>
                    <Td className="text-xs text-gray-500 max-w-xs truncate">{log.notes || '—'}</Td>
                  </Tr>
                );
              })}
            </Table>
          </div>
          )}

          {isCompact && !filteredLogs.length && !loading && (
            <div className="text-center text-gray-400 py-10 text-sm">
              No waste records found.
            </div>
          )}

          {!!loading && (
            <>
              <CardSkeleton count={3} />
              <TableSkeleton columns={5} rows={5} />
            </>
          )}
        </div>

        {/* PAGINATION */}
        {filteredLogs.length > 0 && (
          <div className="p-3 border-t border-brand-100">
            <Pagination page={page} count={filteredLogs.length} perPage={PER_PAGE} total="logs" onChange={setPage} />
          </div>
        )}
      </Card>

      {/* MODAL */}
      <Modal 
        isOpen={modalOpen} 
        onClose={closeGuard.requestClose}
        title="Log Waste"
        footer={
          <div className="flex gap-2 justify-end w-full sm:w-auto">
            <Button variant="secondary" className="flex-1 sm:flex-none" disabled={isSaving} onClick={closeGuard.requestClose}>Cancel</Button>
            <Button variant="primary" className="flex-1 sm:flex-none" disabled={isSaving} onClick={handleLog}>{isSaving ? 'Saving...' : 'Confirm Log'}</Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Server/save error — nasa loob ng modal mismo */}
          {serverError && (
            <div role="alert" className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
              {serverError}
            </div>
          )}

          <FormSelect
            label="Waste Type"
            required
            value={logType}
            onChange={e => handleTypeChange(e.target.value)}
          >
            {WASTE_TYPE_OPTIONS.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </FormSelect>

          {logType === 'ingredient' && (
            <div className="space-y-6">
              <SearchableSelect
                label="Select Ingredient"
                required
                error={formErrors.item}
                placeholder="— Select an ingredient —"
                value={ingName}
                options={ingredients.map(i => ({ value: i.name, label: `${i.name} (In stock: ${i.stock} ${i.unit})` }))}
                onChange={val => {
                  const matched = ingredients.find(i => i.name === val);
                  setIngName(val);
                  if (matched) setIngUnit(matched.unit);
                }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-6">
                <FormInput
                  label="Quantity Lost"
                  required
                  error={formErrors.qty}
                  type="text"
                  inputMode="decimal"
                  value={ingQty}
                  onChange={e => setIngQty(sanitizeNumericText(e.target.value))}
                  placeholder="0"
                />
                <FormSelect label="Reason" required value={reason} onChange={e => setReason(e.target.value)}>
                  {REASONS.ingredient.map(r => <option key={r}>{r}</option>)}
                </FormSelect>
              </div>
              <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
            </div>
          )}

          {logType === 'material' && (
            <div className="space-y-6">
              <SearchableSelect
                label="Select Product Material"
                required
                error={formErrors.item}
                placeholder="— Select a product material —"
                value={matName}
                options={productMaterials.map(m => ({ value: m.name, label: `${m.name} (In stock: ${m.stock} ${m.unit})` }))}
                onChange={val => {
                  const matched = productMaterials.find(m => m.name === val);
                  setMatName(val);
                  if (matched) setMatUnit(matched.unit);
                }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-6">
                <FormInput
                  label="Quantity Lost"
                  required
                  error={formErrors.qty}
                  type="text"
                  inputMode="decimal"
                  value={matQty}
                  onChange={e => setMatQty(sanitizeNumericText(e.target.value))}
                  placeholder="0"
                />
                <FormSelect label="Reason" required value={reason} onChange={e => setReason(e.target.value)}>
                  {REASONS.material.map(r => <option key={r}>{r}</option>)}
                </FormSelect>
              </div>
              <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
            </div>
          )}

          {logType === 'product' && (
            <div className="space-y-6">
              <SearchableSelect
                label="Select Product"
                required
                error={formErrors.item}
                placeholder="— Select a product —"
                value={productName}
                options={products.filter(p => p.stock > 0).map(p => ({ value: p.name, label: `${p.name} (Current Stock: ${p.stock} pcs)` }))}
                onChange={val => {
                  setProductName(val); setProductQty(''); setProductUnit('pcs');
                }}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-6">
                <FormInput
                  label="Quantity"
                  required
                  error={formErrors.qty}
                  type="text"
                  inputMode="numeric"
                  value={productQty}
                  onChange={e => setProductQty(sanitizeNumericText(e.target.value))}
                  placeholder="0"
                />
                <FormSelect label="Reason" required value={reason} onChange={e => setReason(e.target.value)}>
                  {REASONS.product.map(r => <option key={r}>{r}</option>)}
                </FormSelect>
              </div>
              <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
            </div>
          )}
        </div>
      </Modal>
      {closeGuard.confirmation}

      <ConfirmModal
        isOpen={showBulkVoidConfirm}
        onClose={() => !isVoidingRef.current && setShowBulkVoidConfirm(false)}
        onConfirm={handleBulkVoid}
        title="Void Waste Records"
        message={
          selectedLogs.length === 1
            ? `Void "${selectedLogs[0]?.item}" (${selectedLogs[0]?.qty})? Stock will be restored.`
            : `Void ${selectedLogs.length} selected records? Stock will be restored for each.`
        }
        confirmLabel={isVoiding ? 'Voiding...' : 'Void'}
        variant="danger"
      />
    </div>
  );
}
