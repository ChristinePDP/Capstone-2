import { useState, useMemo, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Trash2, Edit2, Search, Tag, Package, ChevronDown, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Table, Tr, Td, Card, ConfirmModal, TableSkeleton, CardSkeleton } from '../../components/ui/index';
import { sanitizeNumericText, getQtyError, MAX_QTY } from '../../utils/numberGuards';
import { normalizeText, normalizeUnit, getCompatibleUnits, convertToBase } from '../../utils/unitUtils';
import { useIsCompact } from '../../hooks/useIsCompact';

const PAGE_SIZE = 8;

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
// ── Searchable dropdown ───────────────────────────────────────────────────
// Pamalit sa native <select> para sa ingredient/material picker: may search box
// para mabilis mahanap ang item kahit marami. Naka-portal sa document.body at
// fixed ang position para hindi maputol ng scroll area ng modal; bumubukas
// pataas kapag kulang ang espasyo sa ibaba.
function SearchableSelect({ value, options, placeholder = 'Select', searchPlaceholder = 'Search...', emptyText = 'No results found', onChange, invalid }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const selected = options.find(o => String(o.id) === String(value));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => String(o.label).toLowerCase().includes(q));
  }, [options, query]);

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const PANEL_H = 260;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < PANEL_H && r.top > spaceBelow;
    setPos({
      left: r.left,
      width: r.width,
      top: openUp ? undefined : r.bottom + 4,
      bottom: openUp ? window.innerHeight - r.top + 4 : undefined,
    });
  }, []);

  const close = useCallback(() => { setOpen(false); setQuery(''); }, []);

  const openPanel = () => {
    const idx = options.findIndex(o => String(o.id) === String(value));
    setActive(idx >= 0 ? idx : 0);
    setQuery('');
    updatePos();
    setOpen(true);
  };

  useLayoutEffect(() => {
    if (!open) return undefined;
    updatePos();
    const reposition = () => updatePos();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.children?.[active]?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (option) => {
    onChange(option.id);
    close();
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(a => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(a => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if (e.key === 'Escape') {
      // Huwag isara ang buong modal — dropdown lang.
      e.preventDefault();
      e.stopPropagation();
      close();
      triggerRef.current?.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openPanel())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={!!invalid}
        data-invalid={invalid ? 'true' : undefined}
        className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-sm text-left border rounded-lg outline-none bg-white transition-colors ${invalid ? 'border-red-500 focus:border-red-500' : 'border-brand-200 focus:border-brand-400'}`}
      >
        <span className={`truncate ${selected ? '' : 'text-gray-500'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={14} className={`shrink-0 text-brand-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
          className="z-[9999] bg-white border border-brand-200 rounded-xl shadow-lg overflow-hidden"
        >
          <div className="relative p-2 border-b border-brand-100">
            <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-brand-300 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setActive(0); }}
              onKeyDown={handleKeyDown}
              placeholder={searchPlaceholder}
              className="w-full pl-7 pr-2.5 py-1.5 text-sm border border-brand-200 rounded-lg outline-none bg-white focus:border-brand-400"
            />
          </div>
          <ul ref={listRef} role="listbox" className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-xs text-center text-brand-400">{emptyText}</li>
            ) : filtered.map((option, idx) => {
              const isSelected = String(option.id) === String(value);
              return (
                <li
                  key={option.id}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActive(idx)}
                  onClick={() => choose(option)}
                  className={`flex items-center justify-between gap-2 px-3 py-1.5 text-sm cursor-pointer ${idx === active ? 'bg-brand-50' : ''} ${isSelected ? 'font-bold text-brand-800' : 'text-brand-700'}`}
                >
                  <span className="truncate">{option.label}</span>
                  {isSelected && <Check size={13} className="shrink-0 text-brand-500" />}
                </li>
              );
            })}
          </ul>
        </div>,
        document.body
      )}
    </>
  );
}

const roundQty = (value) => +Number(value || 0).toFixed(4);

const formatPeso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Estimated cost ng isang batch = sum ng (qty x cost per unit) ng bawat
// ingredient at material. `lines`: [{ qty, unit, item }] kung saan ang `item`
// ay may `costPerUnit` at `unit` (base unit ng inventory item). Ang qty ay
// kino-convert muna sa base unit ng item bago i-multiply sa cost per unit.
// `missing` = ilang line ang walang makitang item o walang cost, para malaman
// ng owner na kulang ang computation.
function sumCost(lines) {
  let total = 0;
  let missing = 0;
  lines.forEach(({ qty, unit, item }) => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return;
    const unitCost = Number(item?.costPerUnit ?? item?.cost_per_unit ?? 0);
    if (!item || !(unitCost > 0)) { missing += 1; return; }
    const baseUnit = normalizeUnit(item.unit);
    const converted = convertToBase(q, normalizeUnit(unit || item.unit), baseUnit);
    total += (Number.isFinite(converted) ? converted : q) * unitCost;
  });
  return { total, missing };
}

// A Production Formula is for a product that actually needs raw ingredients
// to be made — a Celebration Material "product" (e.g. a tarpaulin or balloon
// that's sold as-is) doesn't need a formula, so it's excluded from the
// Product Name list below.
// A formula has two parts: the Recipe (raw ingredients ONLY) and the Product
// Materials (boxes, packaging, etc. needed to produce the product). No
// materials are selectable in the Recipe picker, and no raw ingredients are
// selectable in the Product Materials picker.
// `getMaterialViewKey` is kept only for the legacy shortfall/lookup helpers
// further down that still need to resolve materials already saved on older
// recipes.
function getMaterialViewKey(material, productsById = {}) {
  if (material?.category === 'Product Material') return 'product';
  if (material?.category === 'Celebration Material') return 'celebration';
  const linkedProduct = productsById[material?.productId || material?.product_id];
  return linkedProduct?.category === 'Celebration Material' ? 'celebration' : 'product';
}

export default function RecipeTab() {
  const context = useApp() || {};
  const isLoading = !!context.loading;
  const recipes = useMemo(() => context.recipes || [], [context.recipes]);
  const ingredients = useMemo(() => context.ingredients || [], [context.ingredients]);
  const materials = useMemo(() => context.materials || [], [context.materials]);
  const products = useMemo(() => context.products || [], [context.products]);
  const { addRecipe, updateRecipe, deleteRecipe } = context;

  const { show: showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);

  const [rows, setRows] = useState([{ itemId: '', qty: '', unit: '' }]);
  const [addonRows, setAddonRows] = useState([]);
  const [productId, setProductId] = useState('');
  const [yld, setYld] = useState('');
  const [yldUnit, setYldUnit] = useState('pcs');
  const [formErrors, setFormErrors] = useState({}); // inline field errors ng formula modal
  const [serverError, setServerError] = useState(null); // save error — ipinapakita sa loob ng modal

  const [containerRef, isCompact] = useIsCompact();
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const productsById = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])),
    [products]
  );

  const inventoryOptions = useMemo(() => {
    const ingredientOptions = ingredients.map(item => ({
      id: item.id,
      name: item.name,
      unit: normalizeUnit(item.unit),
      sourceType: 'raw',
      costPerUnit: Number(item.costPerUnit ?? item.cost_per_unit ?? 0),
      label: `${item.name} (Raw${item.unit ? ` · ${normalizeUnit(item.unit)}` : ''})`,
    }));

    // Celebration Materials are not recipe ingredients — only
    // Product Materials (e.g. boxes) are offered here.
    const materialOptions = materials
      .filter(item => getMaterialViewKey(item, productsById) !== 'celebration')
      .map(item => ({
        id: item.id,
        name: item.name,
        unit: normalizeUnit(item.unit),
        sourceType: 'material',
        costPerUnit: Number(item.costPerUnit ?? item.cost_per_unit ?? 0),
        label: `${item.name} (Material${item.unit ? ` · ${normalizeUnit(item.unit)}` : ''})`,
      }));

    return [...ingredientOptions, ...materialOptions];
  }, [ingredients, materials, productsById]);

  const inventoryById = useMemo(() => {
    const map = {};
    inventoryOptions.forEach(item => { map[item.id] = item; });
    return map;
  }, [inventoryOptions]);

  // What the "Add/Edit Recipe" modal actually offers to pick from — raw
  // ingredients ONLY. Materials never belong in a recipe, so they're not in
  // this list at all (unlike `inventoryOptions` above, which still includes
  // materials for the legacy shortfall/lookup helpers).
  const ingredientPickerOptions = useMemo(
    () => inventoryOptions.filter(option => option.sourceType === 'raw'),
    [inventoryOptions]
  );

  // Product Materials section of the modal — materials only (Product Materials; the
  // same Celebration-Material exclusion as before still applies). These are
  // attached to the recipe as their own section, never merged into the
  // ingredients rows above, but they're saved through the same
  // `recipe_ingredients` rows on the backend (tagged `item_type: 'material'`)
  // so batch production still auto-deducts their stock like an ingredient.
  const addonPickerOptions = useMemo(
    () => inventoryOptions.filter(option => option.sourceType === 'material'),
    [inventoryOptions]
  );

  // ── Estimated production cost ───────────────────────────────────────────
  // Live-computed mula sa kasalukuyang cost per unit ng bawat ingredient at
  // material, kaya sumusunod ito kapag nagbago ang presyo sa restock. Ito ang
  // basis ng owner sa pagtatakda ng selling price ng product.
  const costLookup = useMemo(() => {
    const map = new Map();
    ingredients.forEach(item => map.set(`raw:${normalizeText(item.name)}`, item));
    materials.forEach(item => map.set(`material:${normalizeText(item.name)}`, item));
    return map;
  }, [ingredients, materials]);

  const getRecipeCost = useCallback((recipe) => {
    const lines = (recipe.ingredients || []).map(i => ({
      qty: i.qty,
      unit: i.unit,
      item: costLookup.get(`${String(i.itemType || 'raw').toLowerCase()}:${normalizeText(i.name)}`),
    }));
    const { total, missing } = sumCost(lines);
    const batchYield = Number(recipe.yield) || 0;
    return { total, missing, perItem: batchYield > 0 ? total / batchYield : 0 };
  }, [costLookup]);

  const modalCost = useMemo(() => {
    const lines = [...rows, ...addonRows]
      .filter(row => row.itemId && Number(row.qty) > 0)
      .map(row => ({ qty: row.qty, unit: row.unit, item: inventoryById[row.itemId] }));
    const { total, missing } = sumCost(lines);
    const batchYield = Number(yld) || 0;
    return { total, missing, perItem: batchYield > 0 ? total / batchYield : 0 };
  }, [rows, addonRows, inventoryById, yld]);

  // A recipe only makes sense for a product that needs to be produced from
  // raw ingredients — Celebration Material products (sold as-is) don't need
  // one, so they're left out of this list.
  // Products na may formula na ay hindi na lalabas sa dropdown (isang formula
  // lang kada product — unique ang recipes.product_id sa database). Kapag
  // nag-e-edit, ang product ng formula na ine-edit ay nananatiling available
  // para hindi mawala ang selected value.
  const usedProductIds = useMemo(() => {
    const ids = new Set();
    recipes.forEach(recipe => {
      if (editRecipe?.id && recipe.id === editRecipe.id) return;
      const id = recipe.productId || recipe.product_id;
      if (id) ids.add(String(id));
    });
    return ids;
  }, [recipes, editRecipe]);

  const productOptions = useMemo(() => products
    .filter(product => product.category !== 'Celebration Material')
    .filter(product => !usedProductIds.has(String(product.id)))
    .map(product => ({
      id: product.id,
      label: product.name,
    })), [products, usedProductIds]);

  const openAdd = () => {
    setEditRecipe(null);
    setProductId('');
    setYld('');
    setYldUnit('pcs');
    setRows([{ itemId: '', qty: '', unit: '' }]);
    setAddonRows([]);
    setFormErrors({});
    setServerError(null);
    setModalOpen(true);
  };

  const openEdit = (r) => {
    setEditRecipe(r);
    setProductId(r.productId || products.find(p => normalizeText(p.name) === normalizeText(r.product))?.id || '');
    setYld(r.yield);
    setYldUnit(r.yieldUnit || 'pcs');

    const mappedRows = (r.ingredients || []).map(i => {
      const item = inventoryOptions.find(option => normalizeText(option.name) === normalizeText(i.name || i.item_name || '') && normalizeText(option.sourceType) === normalizeText(i.itemType || i.item_type || option.sourceType));
      return {
        itemId: item?.id || '',
        qty: i.qty ?? i.quantity ?? '',
        unit: normalizeUnit(i.unit || item?.unit || ''),
        sourceType: item?.sourceType || normalizeText(i.itemType || i.item_type || 'raw'),
      };
    });

    // Split the saved recipe_ingredients rows back into the two sections —
    // raw ingredients (Recipe) go to `rows`, materials (Product Materials) go to `addonRows`.
    const savedIngredientRows = mappedRows
      .filter(row => row.sourceType !== 'material')
      .map(({ sourceType, ...row }) => row);
    const savedAddonRows = mappedRows
      .filter(row => row.sourceType === 'material')
      .map(({ sourceType, ...row }) => row);

    setRows(savedIngredientRows.length ? savedIngredientRows : [{ itemId: '', qty: '', unit: '' }]);
    setAddonRows(savedAddonRows);
    setFormErrors({});
    setServerError(null);
    setModalOpen(true);
  };

  // ── Inline validation (EventManager style) ────────────────────────────────
  // Keys: 'product' | 'yield' | 'yieldUnit' | '<section>:<rowIndex>:<item|qty|unit>'
  // section: 'r' = Recipe rows, 'a' = Product Materials rows.
  const computeFormErrors = () => {
    const next = {};

    const matchedProduct = products.find(p => p.id === productId);
    if (!productId) next.product = 'Please select a product.';
    else if (!matchedProduct?.id) next.product = 'Product not found in the list.';
    else if (usedProductIds.has(String(productId))) next.product = 'This product already has a formula.';

    const numericYield = Number(yld);
    if (!String(yld ?? '').trim()) next.yield = 'Items per batch is required.';
    else if (!Number.isFinite(numericYield) || numericYield <= 0) next.yield = 'Must be greater than zero.';
    else {
      const overflow = getQtyError(String(yld), { max: MAX_QTY, label: 'Items per batch' });
      if (overflow) next.yield = overflow;
    }

    if (!yldUnit || !yldUnit.trim()) next.yieldUnit = 'Unit is required.';

    const isUsed = row => row.itemId || row.qty || row.unit;
    if (!rows.some(isUsed)) next['r:0:item'] = 'Add at least one ingredient.';

    const checkRows = (list, section, { requiredSourceType, noun }) => {
      list.forEach((row, i) => {
        if (!isUsed(row)) return;
        const key = field => `${section}:${i}:${field}`;
        const item = inventoryById[row.itemId];

        if (!row.itemId) next[key('item')] = `Select ${noun === 'ingredient' ? 'an' : 'a'} ${noun}.`;
        else if (!item) next[key('item')] = `Invalid ${noun} selection.`;
        else if (item.sourceType !== requiredSourceType) {
          next[key('item')] = requiredSourceType === 'raw'
            ? `"${item.name}" is a material — move it to Product Materials.`
            : `"${item.name}" is an ingredient — move it to the Recipe section.`;
        }

        const qtyText = String(row.qty ?? '').trim();
        const qtyValue = Number(row.qty);
        if (!qtyText) next[key('qty')] = 'Enter a quantity.';
        else if (!Number.isFinite(qtyValue) || qtyValue <= 0) next[key('qty')] = 'Quantity must be greater than 0.';
        else {
          const qtyErr = getQtyError(qtyText, { max: MAX_QTY, label: `Quantity for ${item?.name || noun}` });
          if (qtyErr) next[key('qty')] = qtyErr;
        }

        if (item && !next[key('qty')]) {
          const selectedUnit = normalizeUnit(row.unit || item.unit);
          const baseUnit = normalizeUnit(item.unit);
          if (!Number.isFinite(convertToBase(qtyValue, selectedUnit, baseUnit))) {
            next[key('unit')] = `Unit doesn't match ${item.name} — check the units.`;
          }
        }
      });
    };

    checkRows(rows, 'r', { requiredSourceType: 'raw', noun: 'ingredient' });
    checkRows(addonRows, 'a', { requiredSourceType: 'material', noun: 'material' });

    return next;
  };

  const scrollToFirstInvalid = () => {
    setTimeout(() => {
      document.querySelector('[data-invalid="true"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  // Mawawala agad ang error ng field/row na naayos na habang nag-e-edit.
  useEffect(() => {
    setFormErrors(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const latest = computeFormErrors();
      const next = {};
      keys.forEach(k => { if (latest[k]) next[k] = latest[k]; });
      return Object.keys(next).length === keys.length ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, yld, yldUnit, rows, addonRows]);

  // Kapag may inalis na row, nagbabago ang index kaya nililinis ang error ng section na iyon.
  const clearSectionErrors = (section) => {
    setFormErrors(prev => {
      const next = {};
      Object.keys(prev).forEach(k => { if (!k.startsWith(`${section}:`)) next[k] = prev[k]; });
      return next;
    });
  };

  const handleSave = async () => {
    if (isSaving) return;
    setServerError(null);

    const found = computeFormErrors();
    if (Object.keys(found).length > 0) {
      setFormErrors(found);
      scrollToFirstInvalid();
      return;
    }
    setFormErrors({});

    try {
      const matchedProduct = products.find(p => p.id === productId);
      const numericYield = Number(yld);

      const validRows = rows.filter(row => row.itemId || row.qty || row.unit);
      const validAddonRows = addonRows.filter(row => row.itemId || row.qty || row.unit);

      // Na-validate na lahat sa computeFormErrors(), kaya normalize na lang dito.
      const normalizeRows = (rowsToCheck) => rowsToCheck.map(row => {
        const inventoryItem = inventoryById[row.itemId];
        const selectedUnit = normalizeUnit(row.unit || inventoryItem.unit);
        const baseUnit = normalizeUnit(inventoryItem.unit);
        const normalizedQty = convertToBase(Number(row.qty), selectedUnit, baseUnit);
        return {
          item_type: inventoryItem.sourceType,
          item_name: inventoryItem.name,
          quantity: roundQty(normalizedQty),
          unit: baseUnit,
        };
      });

      const data = {
        product_id: matchedProduct.id,
        yield_quantity: numericYield,
        yield_unit: yldUnit.trim(),
        // The backend's recipe_ingredients table doesn't know about the
        // "Recipe" vs "Product Materials" split — that's purely a UI grouping.
        // Both are sent in one array here, distinguished by `item_type`
        // ('raw' vs 'material').
        ingredients: [...normalizeRows(validRows), ...normalizeRows(validAddonRows)],
      };

      setIsSaving(true);
      if (editRecipe?.id) {
        if (updateRecipe) await updateRecipe(editRecipe.id, data);
        showToast('Formula updated.', 'success');
      } else {
        if (addRecipe) await addRecipe(data);
        showToast('Formula added.', 'success');
      }

      setModalOpen(false);
    } catch (err) {
      console.error('Recipe save failed:', err);
      // Ipinapakita sa loob ng modal (hindi toast sa labas)
      setServerError(err?.message || 'Something went wrong while saving the formula.');
    } finally {
      setIsSaving(false);
    }
  };

  // Isang row ng ingredient/material picker (item + qty + unit). Ang error ay
  // pulang border sa mismong control + mensahe sa ilalim ng row.
  const renderItemRows = (section, list, setList, { options, noun, resetLast }) => list.map((row, i) => {
    const rowItem = inventoryById[row.itemId];
    const liveQtyErr = row.qty ? getQtyError(String(row.qty), { max: MAX_QTY, label: `Quantity for ${rowItem?.name || noun}` }) : null;
    const err = {
      item: formErrors[`${section}:${i}:item`],
      qty:  formErrors[`${section}:${i}:qty`] || liveQtyErr,
      unit: formErrors[`${section}:${i}:unit`],
    };
    const rowMessage = err.item || err.qty || err.unit;
    const ctl = (bad) => `w-full px-2.5 py-1.5 text-sm border rounded-lg outline-none bg-white transition-colors ${bad ? 'border-red-500 focus:border-red-500' : 'border-brand-200 focus:border-brand-400'}`;
    const flag = (bad) => ({ 'aria-invalid': !!bad, 'data-invalid': bad ? 'true' : undefined });

    return (
      <div key={i} className={`p-2.5 rounded-lg border space-y-2 transition-colors ${rowMessage ? 'border-red-200 bg-red-50/30' : 'border-brand-100 bg-brand-50/20'}`}>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="w-full sm:flex-1 sm:min-w-0">
            <SearchableSelect
              value={row.itemId}
              options={options}
              placeholder={`Select ${noun}`}
              searchPlaceholder={`Search ${noun}...`}
              emptyText={`No ${noun} found`}
              invalid={!!err.item}
              onChange={(id) => {
                const selected = inventoryById[id];
                setList(prev => prev.map((r, j) => j === i ? { ...r, itemId: id, unit: selected?.unit || r.unit } : r));
              }}
            />
          </div>

          <div className="flex gap-2 items-center">
            <div className="flex-1 min-w-0 sm:w-24 sm:flex-none">
              <input
                value={row.qty}
                type="text"
                inputMode="decimal"
                onChange={e => setList(prev => prev.map((r, j) => j === i ? { ...r, qty: sanitizeNumericText(e.target.value) } : r))}
                placeholder="Qty"
                className={`${ctl(err.qty)} font-semibold`}
                {...flag(err.qty)}
              />
            </div>

            <div className="flex-1 min-w-0 sm:w-28 sm:flex-none">
              <select
                value={row.unit}
                onChange={e => setList(prev => prev.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))}
                className={ctl(err.unit)}
                {...flag(err.unit)}
              >
                <option value="">Unit</option>
                {getCompatibleUnits(inventoryById[row.itemId]?.unit || row.unit).map(unit => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setList(prev => (resetLast && prev.length <= 1) ? [{ itemId: '', qty: '', unit: '' }] : prev.filter((_, j) => j !== i));
                clearSectionErrors(section);
              }}
              className="p-2 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors shrink-0"
              title="Remove row"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {rowMessage && (
          <p role="alert" className="text-[11px] text-red-600 font-medium pl-1">{rowMessage}</p>
        )}
      </div>
    );
  });

  const handleDeleteRecipe = async () => {
    if (!deleteTarget?.id || isDeletingRef.current) return;
    isDeletingRef.current = true;
    setIsDeleting(true);
    try {
      if (deleteRecipe) await deleteRecipe(deleteTarget.id);
      showToast('Formula deleted.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      console.error('deleteRecipe failed:', err);
      showToast(err?.message || "Couldn't delete the formula.", 'error');
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  const filteredRecipes = recipes.filter(r => (r.product || '').toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filteredRecipes.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paged = filteredRecipes.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-brand-100 gap-3">
          <div>
            <h3 className="font-bold text-brand-800">Production Formulas</h3>
            <p className="text-xs text-brand-400 mt-0.5">Manage the recipe and product materials needed to make each product.</p>
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <Button variant="dark" onClick={openAdd} className="flex-1 sm:flex-none justify-center"><Plus size={14} /> Add Formula</Button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/40">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search formula..." className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none bg-white" />
          </div>
        </div>

        <div ref={containerRef} className="px-4 pb-4 mt-4">
          {isLoading && (
            <>
              <CardSkeleton count={3} />
              <TableSkeleton columns={5} rows={5} />
            </>
          )}

          {!isLoading && (
          <>
          {isCompact ? (
          /* Compact (cards) View */
          <div className="space-y-3">
            {paged.map(r => (
              <div key={r.id} className="p-3 sm:p-4 bg-white border border-brand-100 rounded-xl shadow-sm">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h4 className="font-bold text-brand-900 text-base break-words">{r.product}</h4>
                    <p className="text-[11px] text-brand-400 mt-0.5">Yield: {r.yield} {r.yieldUnit}</p>
                    {(() => {
                      const cost = getRecipeCost(r);
                      return (
                        <p className="text-[11px] text-brand-600 font-semibold mt-1">
                          Est. cost per batch: {cost.total > 0 ? formatPeso(cost.total) : '—'}
                          {cost.total > 0 && <span className="font-normal text-brand-400"> · ≈ {formatPeso(cost.perItem)} per item</span>}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => openEdit(r)} className="p-1.5 text-brand-500 bg-brand-50 rounded-lg"><Edit2 size={13} /></button>
                    <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-red-500 bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          ) : (
          /* Table View */
          <Table columns={[{ label: 'Item Info' }, { label: 'Items per Batch' }, { label: 'Est. Cost per Batch' }, { label: 'Actions', align: 'right' }]}>
              {paged.map(r => {
                const cost = getRecipeCost(r);
                return (
                <Tr key={r.id}>
                  <Td><p className="font-bold text-brand-900 text-sm">{r.product}</p></Td>
                  <Td><p className="font-semibold text-brand-700">{r.yield} {r.yieldUnit}</p></Td>
                  <Td>
                    <p className="font-semibold text-brand-700">{cost.total > 0 ? formatPeso(cost.total) : '—'}</p>
                    {cost.total > 0 && <p className="text-[11px] text-brand-400">≈ {formatPeso(cost.perItem)} per item</p>}
                    {cost.missing > 0 && <p className="text-[10px] text-amber-600">{cost.missing} {cost.missing === 1 ? 'item has' : 'items have'} no cost yet</p>}
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(r)} className="p-1.5 text-brand-400 hover:text-brand-700"><Edit2 size={14} /></button>
                      <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </div>
                  </Td>
                </Tr>
                );
              })}
          </Table>
          )}

          {!paged.length && <div className="text-center py-8 text-brand-300">No formulas found.</div>}
          </>
          )}
        </div>

        {filteredRecipes.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-brand-100">
            <p className="text-xs text-brand-400">Page {safePage} of {totalPages}</p>
            <div className="flex gap-1">
              <Button size="sm" variant="secondary" disabled={safePage === 1} onClick={() => setCurrentPage(p => Math.max(1, p - 1))}>Prev</Button>
              <Button size="sm" variant="secondary" disabled={safePage === totalPages} onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      {/* PRODUCTION FORMULA MODAL */}
      <Modal
        isOpen={modalOpen}
        onClose={() => !isSaving && setModalOpen(false)}
        title={editRecipe ? `Edit Formula — ${editRecipe.product}` : 'Add New Formula'}
        subtitle="Set the recipe and product materials needed per batch."
        size="lg"
        footer={
          <div className="flex gap-2 sm:gap-3 sm:justify-end">
            <Button variant="secondary" className="flex-1 sm:flex-none justify-center" disabled={isSaving} onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" className="flex-1 sm:flex-none justify-center" disabled={isSaving} onClick={handleSave}>
              {isSaving ? 'Saving...' : editRecipe ? 'Save Changes' : 'Save Formula'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 sm:space-y-5">
          {/* Server/save error — nasa loob ng modal mismo */}
          {serverError && (
            <div role="alert" className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
              {serverError}
            </div>
          )}

          {/* SECTION 1: BASIC FORMULA DETAILS */}
          <div className="p-3 sm:p-4 rounded-xl border border-brand-100 bg-brand-50/30 space-y-3">
            <div className="flex items-center gap-1.5 pb-2 border-b border-brand-100">
              <Tag size={13} className="text-brand-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">1. Formula Details</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-5 sm:gap-y-6">
              <div className="col-span-2 sm:col-span-1 min-w-0">
              <FormSelect
                label="Product Name"
                required
                error={formErrors.product}
                value={productId}
                onChange={e => setProductId(e.target.value)}
              >
                <option value="">Select product</option>
                {productOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </FormSelect>
              </div>
              <FormInput
                label="Items per Batch"
                required
                error={formErrors.yield || (yld ? getQtyError(String(yld), { max: MAX_QTY, label: 'Items per batch' }) : '')}
                type="text"
                inputMode="decimal"
                value={yld}
                onChange={e => setYld(sanitizeNumericText(e.target.value))}
                placeholder="e.g. 12"
              />
              <FormInput
                label="Unit"
                required
                error={formErrors.yieldUnit}
                value={yldUnit}
                onChange={e => setYldUnit(e.target.value)}
                placeholder="pcs"
              />
            </div>
          </div>

          {/* SECTION 2: RECIPE (raw ingredients only) */}
          <div className="p-3 sm:p-4 rounded-xl border border-brand-200 bg-white shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-brand-100">
              <div className="flex items-center gap-1.5">
                <Package size={13} className="text-brand-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">2. Recipe</span>
              </div>
              <span className="text-[11px] text-brand-400 font-semibold whitespace-nowrap">{rows.length} {rows.length === 1 ? 'item' : 'items'} added</span>
            </div>

            <div className="space-y-2.5">
              {renderItemRows('r', rows, setRows, { options: ingredientPickerOptions, noun: 'ingredient', resetLast: true })}

              <button
                type="button"
                onClick={() => setRows(prev => [...prev, { itemId: '', qty: '', unit: '' }])}
                className="w-full border border-dashed border-brand-300 hover:border-brand-500 bg-brand-50/40 hover:bg-brand-50 text-brand-600 font-bold py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1 mt-2"
              >
                <Plus size={13} /> Add Ingredient
              </button>
            </div>
          </div>

          {/* SECTION 3: PRODUCT MATERIALS (materials only, e.g. boxes / packaging needed to produce the product) */}
          <div className="p-3 sm:p-4 rounded-xl border border-brand-200 bg-white shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2 pb-2 border-b border-brand-100">
              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                <Package size={13} className="text-brand-500 shrink-0" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">3. Product Materials</span>
                <span className="text-[10px] font-semibold text-brand-300 basis-full sm:basis-auto pl-[19px] sm:pl-0">(optional — boxes, packaging, etc.)</span>
              </div>
              <span className="text-[11px] text-brand-400 font-semibold whitespace-nowrap shrink-0">{addonRows.length} {addonRows.length === 1 ? 'item' : 'items'} added</span>
            </div>

            <div className="space-y-2.5">
              {renderItemRows('a', addonRows, setAddonRows, { options: addonPickerOptions, noun: 'material', resetLast: false })}

              <button
                type="button"
                onClick={() => setAddonRows(prev => [...prev, { itemId: '', qty: '', unit: '' }])}
                className="w-full border border-dashed border-brand-300 hover:border-brand-500 bg-brand-50/40 hover:bg-brand-50 text-brand-600 font-bold py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1 mt-2"
              >
                <Plus size={13} /> Add Material
              </button>

              {!addonRows.length && (
                <p className="text-[11px] text-brand-300 text-center py-1">
                  No product materials yet — boxes, packaging, or other materials needed to produce this product go here, deducted from stock the same way when a batch is produced.
                </p>
              )}
            </div>
          </div>

          {/* ESTIMATED PRODUCTION COST — basis sa pagtatakda ng selling price */}
          <div className="p-3 sm:p-4 rounded-xl border border-brand-200 bg-brand-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-800">Estimated Production Cost</p>
              <p className="text-[11px] text-brand-400 mt-0.5">
                Based on the current cost per unit of each ingredient and material. Use this as your basis for the selling price.
              </p>
              {modalCost.missing > 0 && (
                <p className="text-[11px] text-amber-600 font-medium mt-0.5">
                  {modalCost.missing} {modalCost.missing === 1 ? 'item has' : 'items have'} no cost yet, so this total may be too low.
                </p>
              )}
            </div>
            <div className="sm:text-right shrink-0">
              <p className="text-lg font-bold text-brand-900">{formatPeso(modalCost.total)} <span className="text-[11px] font-semibold text-brand-400">per batch</span></p>
              {modalCost.perItem > 0 && <p className="text-xs font-semibold text-brand-600">≈ {formatPeso(modalCost.perItem)} per item</p>}
            </div>
          </div>
        </div>
      </Modal>

      {/* DELETE FORMULA CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => !isDeletingRef.current && setDeleteTarget(null)}
        onConfirm={handleDeleteRecipe}
        title="Delete Formula"
        message={`Delete the formula for "${deleteTarget?.product}"?`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        variant="danger"
      />
    </div>
  );
}