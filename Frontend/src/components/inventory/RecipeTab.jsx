import { useState, useMemo, useCallback, useRef } from 'react';
import { Plus, Trash2, CheckCircle2, ShoppingCart, Edit2, Search, Tag, Package } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Table, Tr, Td, Card, ConfirmModal, TableSkeleton, CardSkeleton } from '../../components/ui/index';
import { sanitizeNumericText, getQtyError, MAX_QTY } from '../../utils/numberGuards';
import { normalizeText, normalizeUnit, getCompatibleUnits, convertToBase } from '../../utils/unitUtils';
import { useIsCompact } from '../../hooks/useIsCompact';

const PAGE_SIZE = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const roundQty = (value) => +Number(value || 0).toFixed(4);

// A recipe is for a product that actually needs raw ingredients to be made
// — a Celebration Material "product" (e.g. a tarpaulin or balloon that's
// sold as-is) doesn't need a recipe, so it's excluded from the Product Name
// list below.
// A recipe is INGREDIENTS ONLY — no materials of any kind (Product Material
// or Celebration Material) are selectable in the recipe picker. Materials
// (packaging, boxes, ribbons, etc.) are add-ons attached to a product/bundle
// separately from the recipe, not something a recipe "consumes" per batch.
// `getMaterialViewKey` is kept only for the legacy shortfall/lookup helpers
// further down that still need to resolve materials already saved on older
// recipes.
function getMaterialViewKey(material, productsById = {}) {
  if (material?.category === 'Product Material') return 'product';
  if (material?.category === 'Celebration Material') return 'celebration';
  const linkedProduct = productsById[material?.productId || material?.product_id];
  return linkedProduct?.category === 'Celebration Material' ? 'celebration' : 'product';
}

const inventoryKey = (name, unit, type = '') => `${normalizeText(name)}|${normalizeUnit(unit)}|${normalizeText(type)}`;

const getOrderItems = (order = {}) => Array.isArray(order.order_items)
  ? order.order_items
  : Array.isArray(order.items)
    ? order.items
    : [];

const getItemQuantity = (item = {}) => Number(item.quantity ?? item.qty ?? item.count ?? 0);

const findInventoryItem = (name, itemType, ingredients, materials) => {
  const targetName = normalizeText(name);
  const collections = itemType === 'material'
    ? [materials, ingredients]
    : itemType === 'raw'
      ? [ingredients, materials]
      : [ingredients, materials];

  for (const collection of collections) {
    const match = collection.find(item => normalizeText(item.name) === targetName);
    if (match) return match;
  }

  return null;
};

const findRecipeByProductId = (recipes, productId, productName = '') => {
  const normalizedProductId = normalizeText(productId);
  const normalizedProductName = normalizeText(productName);

  return recipes.find(recipe => {
    const recipeProductId = normalizeText(recipe.productId || recipe.product_id || '');
    const recipeProductName = normalizeText(recipe.product || recipe.product_name || '');
    return (normalizedProductId && recipeProductId === normalizedProductId)
      || (normalizedProductName && recipeProductName === normalizedProductName);
  });
};

const buildShortfallEntry = (entry, stockItem) => {
  const unit = normalizeUnit(entry.unit || stockItem?.unit || 'pcs');
  const totalNeeded = Number(entry.totalNeeded ?? entry.total ?? 0);
  const stockValue = Number(stockItem?.stock ?? stockItem?.stock_quantity ?? 0);
  const stockUnit = normalizeUnit(stockItem?.unit || unit);
  const normalizedStock = Number.isFinite(convertToBase(stockValue, stockUnit, unit))
    ? convertToBase(stockValue, stockUnit, unit)
    : stockValue;
  const shortage = Math.max(0, roundQty(totalNeeded - normalizedStock));

  if (shortage <= 0) return null;

  return {
    name: entry.name,
    unit,
    totalNeeded: roundQty(totalNeeded),
    currentStock: roundQty(normalizedStock),
    shortage: roundQty(shortage),
  };
};

export default function RecipeTab() {
  const context = useApp() || {};
  const isLoading = !!context.loading;
  const recipes = useMemo(() => context.recipes || [], [context.recipes]);
  const ingredients = useMemo(() => context.ingredients || [], [context.ingredients]);
  const materials = useMemo(() => context.materials || [], [context.materials]);
  const products = useMemo(() => context.products || [], [context.products]);
  const orders = useMemo(() => context.orders || [], [context.orders]);
  const { addRecipe, updateRecipe, deleteRecipe, confirmBatch } = context;

  const { show: showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null); // Modal state for production confirmation
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);

  const [rows, setRows] = useState([{ itemId: '', qty: '', unit: '' }]);
  const [addonRows, setAddonRows] = useState([]);
  const [productId, setProductId] = useState('');
  const [yld, setYld] = useState('');
  const [yldUnit, setYldUnit] = useState('pcs');

  const [quotas, setQuotas] = useState({});
  const [localStocks, setLocalStocks] = useState({});
  const [confirmingIds, setConfirmingIds] = useState({});
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
      label: `${item.name} (Raw${item.unit ? ` · ${normalizeUnit(item.unit)}` : ''})`,
    }));

    // Celebration Materials are add-ons, not recipe ingredients — only
    // Product Materials (e.g. boxes) are offered here.
    const materialOptions = materials
      .filter(item => getMaterialViewKey(item, productsById) !== 'celebration')
      .map(item => ({
        id: item.id,
        name: item.name,
        unit: normalizeUnit(item.unit),
        sourceType: 'material',
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

  // Add-ons section of the modal — materials only (Product Materials; the
  // same Celebration-Material exclusion as before still applies). These are
  // attached to the recipe as their own section, never merged into the
  // ingredients rows above, but they're saved through the same
  // `recipe_ingredients` rows on the backend (tagged `item_type: 'material'`)
  // so batch production still auto-deducts their stock like an ingredient.
  const addonPickerOptions = useMemo(
    () => inventoryOptions.filter(option => option.sourceType === 'material'),
    [inventoryOptions]
  );

  // A recipe only makes sense for a product that needs to be produced from
  // raw ingredients — Celebration Material products (sold as-is) don't need
  // one, so they're left out of this list.
  const productOptions = useMemo(() => products
    .filter(product => product.category !== 'Celebration Material')
    .map(product => ({
      id: product.id,
      label: product.name,
    })), [products]);

  const calculateMaxUnits = useCallback((recipe, inventory) => {
    if (!recipe.ingredients || recipe.ingredients.length === 0) return 0;
    let maxBatches = Infinity;

    for (const req of recipe.ingredients) {
      const stockItem = findInventoryItem(req.name, req.itemType, ingredients, materials)
        || inventory.find(i => normalizeText(i.name) === normalizeText(req.name));
      if (!stockItem || Number(stockItem.stock ?? stockItem.stock_quantity ?? 0) <= 0) return 0;

      const stockInReqUnit = convertToBase(Number(stockItem.stock ?? stockItem.stock_quantity ?? 0), stockItem.unit, req.unit);
      if (!Number.isFinite(stockInReqUnit)) return 0;

      const possibleBatches = Math.floor(stockInReqUnit / Number(req.qty));
      if (possibleBatches < maxBatches) maxBatches = possibleBatches;
    }

    return maxBatches === Infinity ? 0 : maxBatches * Number(recipe.yield);
  }, [ingredients, materials]);

  const preOrderDemand = useMemo(() => {
    const map = {};
    const confirmed = orders?.filter(o => o.status === 'Confirmed') || [];

    confirmed.forEach(order => {
      getOrderItems(order).forEach(item => {
        const recipe = findRecipeByProductId(recipes, item.product_id || item.productId, item.product_name || item.productName);
        if (!recipe) return;

        recipe.ingredients.forEach(req => {
          const unit = normalizeUnit(req.unit || 'pcs');
          const key = inventoryKey(req.name, unit, req.itemType);
          if (!map[key]) map[key] = { name: req.name, unit, total: 0, itemType: req.itemType || '' };
          map[key].total += Number(req.qty) * getItemQuantity(item);
        });
      });
    });

    return map;
  }, [orders, recipes]);

  const preOrderShortfalls = useMemo(() => {
    const result = [];

    for (const entry of Object.values(preOrderDemand)) {
      const stockItem = findInventoryItem(entry.name, entry.itemType, ingredients, materials);
      const shortfall = buildShortfallEntry({ name: entry.name, unit: entry.unit, totalNeeded: entry.total }, stockItem);
      if (shortfall) result.push(shortfall);
    }

    return result;
  }, [preOrderDemand, ingredients, materials]);

  const zeroCapacityShortfalls = useMemo(() => {
    const totalNeededMap = {};

    for (const r of recipes) {
      const maxUnits = calculateMaxUnits(r, ingredients);
      if (maxUnits > 0) continue;

      for (const req of r.ingredients) {
        const unit = normalizeUnit(req.unit || 'pcs');
        const key = inventoryKey(req.name, unit, req.itemType);
        if (!totalNeededMap[key]) {
          totalNeededMap[key] = { name: req.name, unit, totalNeeded: 0, itemType: req.itemType || '' };
        }
        totalNeededMap[key].totalNeeded = roundQty(totalNeededMap[key].totalNeeded + Number(req.qty));
      }
    }

    const result = [];
    for (const entry of Object.values(totalNeededMap)) {
      const stockItem = findInventoryItem(entry.name, entry.itemType, ingredients, materials);
      const shortage = buildShortfallEntry(entry, stockItem);
      if (shortage) result.push(shortage);
    }

    return result;
  }, [recipes, ingredients, materials, calculateMaxUnits]);

  const consolidatedShortfalls = useMemo(() => {
    const totalNeededMap = {};

    for (const r of recipes) {
      const targetGoal = Number(quotas[r.id]);
      if (!targetGoal || targetGoal <= 0 || targetGoal > MAX_QTY) continue;
      const maxUnits = calculateMaxUnits(r, ingredients);
      if (maxUnits >= targetGoal) continue;

      const neededBatches = Math.ceil(targetGoal / Number(r.yield));
      for (const req of r.ingredients) {
        const unit = normalizeUnit(req.unit || 'pcs');
        const key = inventoryKey(req.name, unit, req.itemType);
        if (!totalNeededMap[key]) {
          totalNeededMap[key] = { name: req.name, unit, totalNeeded: 0, itemType: req.itemType || '' };
        }
        totalNeededMap[key].totalNeeded = roundQty(totalNeededMap[key].totalNeeded + (Number(req.qty) * neededBatches));
      }
    }

    const result = [];
    for (const entry of Object.values(totalNeededMap)) {
      const stockItem = findInventoryItem(entry.name, entry.itemType, ingredients, materials);
      const shortage = buildShortfallEntry(entry, stockItem);
      if (shortage) result.push(shortage);
    }

    return result;
  }, [recipes, ingredients, materials, quotas, calculateMaxUnits]);

  const allShortfalls = useMemo(() => {
    const map = {};
    const pushItem = (item) => {
      const key = inventoryKey(item.name, item.unit);
      if (!map[key]) {
        map[key] = {
          name: item.name,
          unit: normalizeUnit(item.unit),
          totalNeeded: roundQty(item.totalNeeded ?? item.shortage ?? 0),
          currentStock: roundQty(item.currentStock ?? 0),
          shortage: roundQty(item.shortage ?? 0),
        };
        return;
      }

      map[key].totalNeeded = roundQty(map[key].totalNeeded + Number(item.totalNeeded ?? item.shortage ?? 0));
      map[key].currentStock = roundQty(Math.min(map[key].currentStock, Number(item.currentStock ?? map[key].currentStock)));
      map[key].shortage = roundQty(map[key].shortage + Number(item.shortage ?? 0));
    };

    preOrderShortfalls.forEach(pushItem);
    zeroCapacityShortfalls.forEach(pushItem);
    consolidatedShortfalls.forEach(pushItem);

    return Object.values(map).filter(item => item.shortage > 0);
  }, [preOrderShortfalls, zeroCapacityShortfalls, consolidatedShortfalls]);

  const openAdd = () => {
    setEditRecipe(null);
    setProductId('');
    setYld('');
    setYldUnit('pcs');
    setRows([{ itemId: '', qty: '', unit: '' }]);
    setAddonRows([]);
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
    // raw ingredients go to `rows`, materials go to `addonRows`.
    const savedIngredientRows = mappedRows
      .filter(row => row.sourceType !== 'material')
      .map(({ sourceType, ...row }) => row);
    const savedAddonRows = mappedRows
      .filter(row => row.sourceType === 'material')
      .map(({ sourceType, ...row }) => row);

    setRows(savedIngredientRows.length ? savedIngredientRows : [{ itemId: '', qty: '', unit: '' }]);
    setAddonRows(savedAddonRows);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (isSaving) return;
    try {
      if (!productId) {
        showToast('Please select a product first.', 'warning');
        return;
      }

      const matchedProduct = products.find(p => p.id === productId);
      if (!matchedProduct?.id) {
        showToast('Product not found in the products list.', 'warning');
        return;
      }

      const numericYield = Number(yld);
      if (!Number.isFinite(numericYield) || numericYield <= 0) {
        showToast('Invalid yield — must be greater than zero.', 'warning');
        return;
      }
      const yieldOverflow = getQtyError(yld, { max: MAX_QTY, label: 'Yield' });
      if (yieldOverflow) { showToast(yieldOverflow, 'warning'); return; }

      if (!yldUnit || !yldUnit.trim()) {
        showToast('Please specify a yield unit.', 'warning');
        return;
      }

      const validRows = rows.filter(row => row.itemId || row.qty || row.unit);
      if (!validRows.length) {
        showToast('Add at least one ingredient row.', 'warning');
        return;
      }
      const validAddonRows = addonRows.filter(row => row.itemId || row.qty || row.unit);

      // Shared validator for both the Ingredients rows and the Add-ons rows.
      // `requiredSourceType` enforces the section boundary: an ingredient
      // row can only resolve to a raw ingredient, an add-on row can only
      // resolve to a material. Returns null (after showing a toast) on the
      // first invalid row, or the normalized recipe_ingredients entries.
      const normalizeRowsOrToast = (rowsToCheck, { requiredSourceType, sectionLabel }) => {
        const normalized = [];

        for (const row of rowsToCheck) {
          if (!row.itemId) {
            showToast(`Select a${sectionLabel === 'ingredient' ? 'n' : ''} ${sectionLabel} for each row.`, 'warning');
            return null;
          }

          const inventoryItem = inventoryById[row.itemId];
          if (!inventoryItem) {
            showToast(`One of the rows has an invalid ${sectionLabel} selection.`, 'warning');
            return null;
          }

          // Defensive guard: keeps the two sections from bleeding into each
          // other. Mainly catches a row carried over from editing an older
          // recipe saved before this split existed — the pickers themselves
          // no longer offer the wrong kind as an option.
          if (inventoryItem.sourceType !== requiredSourceType) {
            showToast(
              requiredSourceType === 'raw'
                ? `"${inventoryItem.name}" is a material, not an ingredient — move it to the Add-ons section instead.`
                : `"${inventoryItem.name}" is an ingredient, not a material — it belongs in the Ingredients section instead.`,
              'warning'
            );
            return null;
          }

          const qtyValue = Number(row.qty);
          if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
            showToast(`Invalid quantity for ${inventoryItem.name}.`, 'warning');
            return null;
          }

          const rowQtyErr = getQtyError(row.qty, { max: MAX_QTY, label: `Quantity for ${inventoryItem.name}` });
          if (rowQtyErr) {
            showToast(rowQtyErr, 'warning');
            return null;
          }

          const selectedUnit = normalizeUnit(row.unit || inventoryItem.unit);
          const baseUnit = normalizeUnit(inventoryItem.unit);
          const normalizedQty = convertToBase(qtyValue, selectedUnit, baseUnit);
          if (!Number.isFinite(normalizedQty)) {
            showToast(`Unit conversion not supported for ${inventoryItem.name} — check if the units match.`, 'warning');
            return null;
          }

          normalized.push({
            item_type: inventoryItem.sourceType,
            item_name: inventoryItem.name,
            quantity: roundQty(normalizedQty),
            unit: baseUnit,
          });
        }

        return normalized;
      };

      const normalizedIngredients = normalizeRowsOrToast(validRows, { requiredSourceType: 'raw', sectionLabel: 'ingredient' });
      if (!normalizedIngredients) return;

      const normalizedAddons = normalizeRowsOrToast(validAddonRows, { requiredSourceType: 'material', sectionLabel: 'add-on' });
      if (!normalizedAddons) return;

      const data = {
        product_id: matchedProduct.id,
        yield_quantity: numericYield,
        yield_unit: yldUnit.trim(),
        // The backend's recipe_ingredients table doesn't know about the
        // "Ingredients" vs "Add-ons" split — that's purely a UI grouping.
        // Both are sent in one array here, distinguished by `item_type`
        // ('raw' vs 'material'), which is exactly what ProductionService
        // already uses to deduct raw-ingredient stock and material stock
        // separately when a batch is confirmed.
        ingredients: [...normalizedIngredients, ...normalizedAddons],
      };

      setIsSaving(true);
      if (editRecipe?.id) {
        if (updateRecipe) await updateRecipe(editRecipe.id, data);
        showToast('Recipe updated.', 'success');
      } else {
        if (addRecipe) await addRecipe(data);
        showToast('Recipe added.', 'success');
      }

      setModalOpen(false);
    } catch (err) {
      console.error('Recipe save failed:', err);
      showToast(err?.message || 'Something went wrong while saving the recipe.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Confirmation and actual execution of batch production
  const handleExecuteConfirm = async () => {
    if (!confirmTarget) return;
    const { recipe, goalNum } = confirmTarget;

    if (!goalNum || goalNum <= 0) {
      showToast('Target Goal must be a positive number.', 'error');
      setConfirmTarget(null);
      return;
    }
    if (confirmingIds[recipe.id]) return;
    setConfirmingIds(prev => ({ ...prev, [recipe.id]: true }));

    const product = products.find(p => p.id === recipe.productId) || products.find(p => normalizeText(p.name) === normalizeText(recipe.product));
    const resolvedProductId = recipe.productId || product?.id;
    const recipeId = recipe.id;

    if (!UUID_RE.test(recipeId) || !UUID_RE.test(resolvedProductId || '')) {
      showToast('Recipe/product data not fully loaded yet — refresh the page and try again.', 'warning');
      setConfirmTarget(null);
      setConfirmingIds(prev => ({ ...prev, [recipe.id]: false }));
      return;
    }

    const perBatchYield = Number(recipe.yield) || 1;
    const batches = Math.ceil(Number(goalNum) / perBatchYield);
    const totalProduced = batches * perBatchYield;
    const payload = {
      recipe_id: recipeId,
      product_id: resolvedProductId,
      product_name: recipe.product,
      batches,
      total_produced: totalProduced,
      yield_unit: recipe.yieldUnit || 'pcs',
      notes: '',
    };

    try {
      if (confirmBatch) await confirmBatch(payload);
      const contextStock = product ? Number(product.stock ?? product.stock_quantity ?? 0) : 0;
      const actualCurrentStock = localStocks[recipe.id] !== undefined ? localStocks[recipe.id] : contextStock;
      const newStock = actualCurrentStock + Number(totalProduced);
      setLocalStocks(prev => ({ ...prev, [recipe.id]: newStock }));
      setQuotas(prev => { const next = { ...prev }; delete next[recipe.id]; return next; });
      showToast(`✓ Produced ${totalProduced} ${recipe.yieldUnit || 'pcs'} of ${recipe.product}.`, 'success');
    } catch (err) {
      console.error('confirmBatch failed:', err);
      showToast("Batch wasn't logged — check the server console for validation errors.", 'warning');
    } finally {
      setConfirmingIds(prev => { const next = { ...prev }; delete next[recipe.id]; return next; });
      setConfirmTarget(null);
    }
  };

  const handleDeleteRecipe = async () => {
    if (!deleteTarget?.id || isDeletingRef.current) return;
    isDeletingRef.current = true;
    setIsDeleting(true);
    try {
      if (deleteRecipe) await deleteRecipe(deleteTarget.id);
      showToast('Recipe deleted.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      console.error('deleteRecipe failed:', err);
      showToast(err?.message || "Couldn't delete the recipe.", 'error');
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
      {allShortfalls.length > 0 && (
        <div className="border border-red-200 bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-200">
            <ShoppingCart size={14} className="text-red-600 shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wider text-red-700 flex-1">Shopping List</p>
            <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">{allShortfalls.length} items</span>
          </div>
          <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {allShortfalls.map((item, idx) => (
              <li key={`${item.name}-${item.unit}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="text-sm font-semibold text-gray-800">{idx + 1}. {item.name}</span>
                <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100">+{roundQty(item.shortage)} {item.unit}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-brand-100 gap-3">
          <div>
            <h3 className="font-bold text-brand-800">Recipe Log</h3>
            <p className="text-xs text-brand-400 mt-0.5">Enter a Target Goal to see if you have enough ingredients.</p>
          </div>
          <Button variant="dark" onClick={openAdd} className="w-full sm:w-auto justify-center"><Plus size={14} /> Add Recipe</Button>
        </div>

        <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/40">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search recipe..." className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none bg-white" />
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
          <div className="space-y-4">
            {paged.map(r => {
              const maxUnits = calculateMaxUnits(r, [...ingredients, ...materials]);
              const quota = quotas[r.id] || '';
              const quotaNum = Number(quota);
              const hasInput = quotaNum > 0 && quotaNum <= MAX_QTY;
              const canMake = hasInput && maxUnits >= quotaNum;
              const quotaError = quota !== '' ? getQtyError(quota, { max: MAX_QTY, label: 'Target Goal' }) : null;
              const matchedProduct = products.find(p => p.id === r.productId) || products.find(p => normalizeText(p.name) === normalizeText(r.product));
              const currentStock = localStocks[r.id] !== undefined
                ? localStocks[r.id]
                : (matchedProduct ? Number(matchedProduct.stock ?? matchedProduct.stock_quantity ?? 0) : 0);

              return (
                <div key={r.id} className="p-4 bg-white border border-brand-100 rounded-xl shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-brand-900 text-base">{r.product}</h4>
                      <p className="text-[11px] text-brand-400 mt-0.5">Yield: {r.yield} {r.yieldUnit}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => openEdit(r)} className="p-1.5 text-brand-500 bg-brand-50 rounded-lg"><Edit2 size={13} /></button>
                      <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-red-500 bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-brand-50/50 p-2 rounded-lg">
                    <div><span className="text-brand-400">Stock Capacity:</span> <div className={`font-bold ${maxUnits === 0 ? 'text-red-600' : 'text-emerald-600'}`}>{maxUnits} {r.yieldUnit}</div></div>
                    <div><span className="text-brand-400">Finished Stock:</span> <div className="font-bold text-blue-700">{currentStock} {r.yieldUnit}</div></div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-brand-50">
                    <div className="flex-1">
                      <input
                        type="text" inputMode="numeric"
                        placeholder="Target Goal"
                        value={quota}
                        onChange={e => setQuotas(prev => ({ ...prev, [r.id]: sanitizeNumericText(e.target.value) }))}
                        className={`w-full px-2 py-1.5 text-xs text-center border font-bold rounded-lg ${quotaError ? 'bg-red-50 text-red-700 border-red-400' : hasInput ? (canMake ? 'bg-emerald-50 text-emerald-700 border-emerald-400' : 'bg-red-50 text-red-700 border-red-300') : 'bg-white'}`}
                      />
                      {quotaError && <p className="text-[10px] text-red-600 font-medium mt-1">{quotaError}</p>}
                    </div>
                    {canMake && (
                      <Button 
                        size="sm" 
                        variant="primary" 
                        disabled={!!confirmingIds[r.id]} 
                        className="bg-emerald-600 text-xs px-3 border-none py-2 h-auto" 
                        onClick={() => setConfirmTarget({ recipe: r, goalNum: quotaNum })}
                      >
                        <CheckCircle2 size={12} className="mr-1" /> {confirmingIds[r.id] ? 'Confirming...' : 'Confirm'}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          ) : (
          /* Table View */
          <Table columns={[{ label: 'Item Info' }, { label: 'Items per Batch' }, { label: 'Stock Capacity' }, { label: 'Production Target' }, { label: 'Finished Production' }, { label: 'Actions', align: 'right' }]}>
              {paged.map(r => {
                const maxUnits = calculateMaxUnits(r, [...ingredients, ...materials]);
                const quota = quotas[r.id] || '';
                const quotaNum = Number(quota);
                const hasInput = quotaNum > 0 && quotaNum <= MAX_QTY;
                const canMake = hasInput && maxUnits >= quotaNum;
                const quotaError = quota !== '' ? getQtyError(quota, { max: MAX_QTY, label: 'Target Goal' }) : null;
                const matchedProduct = products.find(p => p.id === r.productId) || products.find(p => normalizeText(p.name) === normalizeText(r.product));
                const currentStock = localStocks[r.id] !== undefined
                  ? localStocks[r.id]
                  : (matchedProduct ? Number(matchedProduct.stock ?? matchedProduct.stock_quantity ?? 0) : 0);

                return (
                  <Tr key={r.id}>
                    <Td><p className="font-bold text-brand-900 text-sm">{r.product}</p></Td>
                    <Td><p className="font-semibold text-brand-700">{r.yield} {r.yieldUnit}</p></Td>
                    <Td><span className={`font-bold px-2 py-1 rounded-md border ${maxUnits === 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{maxUnits} {r.yieldUnit}</span></Td>
                    <Td>
                      <input
                        type="text" inputMode="numeric"
                        value={quota}
                        onChange={e => setQuotas(prev => ({ ...prev, [r.id]: sanitizeNumericText(e.target.value) }))}
                        placeholder="0"
                        className={`w-20 px-2 py-1 text-center font-bold border rounded-lg ${quotaError ? 'bg-red-50 text-red-700 border-red-400' : hasInput ? (canMake ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700') : 'bg-white'}`}
                      />
                      {quotaError && <p className="text-[10px] text-red-600 font-medium mt-1 max-w-[100px]">{quotaError}</p>}
                    </Td>
                    <Td><span className="font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border">{currentStock} {r.yieldUnit}</span></Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        {canMake && (
                          <Button 
                            size="sm" 
                            variant="primary" 
                            disabled={!!confirmingIds[r.id]} 
                            className="bg-emerald-600 border-none" 
                            onClick={() => setConfirmTarget({ recipe: r, goalNum: quotaNum })}
                          >
                            <CheckCircle2 size={12} className="mr-1" /> {confirmingIds[r.id] ? 'Confirming...' : 'Confirm'}
                          </Button>
                        )}
                        <button onClick={() => openEdit(r)} className="p-1.5 text-brand-400 hover:text-brand-700"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
          </Table>
          )}

          {!paged.length && <div className="text-center py-8 text-brand-300">No recipes found.</div>}
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

      {/* REFACTORED RECIPE MODAL */}
      <Modal
        isOpen={modalOpen}
        onClose={() => !isSaving && setModalOpen(false)}
        title={editRecipe ? `Edit Recipe — ${editRecipe.product}` : 'Add New Recipe'}
        subtitle="Set the mix and exact ingredient amounts per batch."
        size="lg"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" disabled={isSaving} onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" disabled={isSaving} onClick={handleSave}>
              {isSaving ? 'Saving...' : editRecipe ? 'Save Changes' : 'Save Recipe'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* SECTION 1: BASIC RECIPE DETAILS */}
          <div className="p-4 rounded-xl border border-brand-100 bg-brand-50/30 space-y-3">
            <div className="flex items-center gap-1.5 pb-2 border-b border-brand-100">
              <Tag size={13} className="text-brand-500" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">1. Recipe Details</span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <Select label="Product Name" required value={productId} onChange={e => setProductId(e.target.value)}>
                  <option value="">Select product</option>
                  {productOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </Select>
              </div>
              <div>
                <Input label="Actual Yield per Batch" required type="text" inputMode="decimal" value={yld} onChange={e => setYld(sanitizeNumericText(e.target.value))} placeholder="e.g. 12" />
                {getQtyError(yld, { max: MAX_QTY, label: 'Yield' }) && <p className="text-[11px] text-red-600 mt-1 font-medium">{getQtyError(yld, { max: MAX_QTY, label: 'Yield' })}</p>}
              </div>
              <div>
                <Input label="Yield Unit" required value={yldUnit} onChange={e => setYldUnit(e.target.value)} placeholder="pcs" />
              </div>
            </div>
          </div>

          {/* SECTION 2: INGREDIENTS (raw only) */}
          <div className="p-4 rounded-xl border border-brand-200 bg-white shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-brand-100">
              <div className="flex items-center gap-1.5">
                <Package size={13} className="text-brand-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">2. Ingredients</span>
              </div>
              <span className="text-[11px] text-brand-400 font-semibold">{rows.length} {rows.length === 1 ? 'item' : 'items'} added</span>
            </div>

            <div className="space-y-2.5">
              {rows.map((row, i) => {
                const rowItem = inventoryById[row.itemId];
                const rowQtyErr = row.qty ? getQtyError(row.qty, { max: MAX_QTY, label: `Quantity for ${rowItem?.name || 'ingredient'}` }) : null;

                return (
                  <div key={i} className="p-2.5 rounded-lg border border-brand-100 bg-brand-50/20 space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <div className="w-full sm:flex-1 sm:min-w-0">
                        <Select
                          value={row.itemId}
                          onChange={e => {
                            const selected = inventoryById[e.target.value];
                            setRows(prev => prev.map((r, j) => j === i ? { ...r, itemId: e.target.value, unit: selected?.unit || r.unit } : r));
                          }}
                          className="w-full"
                          required
                        >
                          <option value="">Select ingredient</option>
                          {ingredientPickerOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </Select>
                      </div>

                      <div className="flex gap-2 items-center">
                        <div className="flex-1 min-w-0 sm:w-24 sm:flex-none">
                          <input
                            value={row.qty}
                            type="text"
                            inputMode="decimal"
                            onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, qty: sanitizeNumericText(e.target.value) } : r))}
                            placeholder="Qty"
                            className={`w-full px-2.5 py-1.5 text-sm border rounded-lg outline-none bg-white font-semibold ${rowQtyErr ? 'border-red-400' : 'border-brand-200 focus:border-brand-400'}`}
                          />
                        </div>

                        <div className="flex-1 min-w-0 sm:w-28 sm:flex-none">
                          <Select
                            value={row.unit}
                            onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))}
                            className="w-full"
                            required
                          >
                            <option value="">Unit</option>
                            {getCompatibleUnits(inventoryById[row.itemId]?.unit || row.unit).map(unit => <option key={unit} value={unit}>{unit}</option>)}
                          </Select>
                        </div>

                        <button
                          type="button"
                          onClick={() => setRows(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ itemId: '', qty: '', unit: '' }])}
                          className="p-2 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors shrink-0"
                          title="Remove row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {rowQtyErr && (
                      <p className="text-[11px] text-red-600 font-medium pl-1">{rowQtyErr}</p>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setRows(prev => [...prev, { itemId: '', qty: '', unit: '' }])}
                className="w-full border border-dashed border-brand-300 hover:border-brand-500 bg-brand-50/40 hover:bg-brand-50 text-brand-600 font-bold py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1 mt-2"
              >
                <Plus size={13} /> Add Ingredient
              </button>
            </div>
          </div>

          {/* SECTION 3: ADD-ONS (materials only, e.g. packaging for bundle products) */}
          <div className="p-4 rounded-xl border border-brand-200 bg-white shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-brand-100">
              <div className="flex items-center gap-1.5">
                <Package size={13} className="text-brand-500" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">3. Add-ons</span>
                <span className="text-[10px] font-semibold text-brand-300">(optional — materials for bundles)</span>
              </div>
              <span className="text-[11px] text-brand-400 font-semibold">{addonRows.length} {addonRows.length === 1 ? 'item' : 'items'} added</span>
            </div>

            <div className="space-y-2.5">
              {addonRows.map((row, i) => {
                const rowItem = inventoryById[row.itemId];
                const rowQtyErr = row.qty ? getQtyError(row.qty, { max: MAX_QTY, label: `Quantity for ${rowItem?.name || 'add-on'}` }) : null;

                return (
                  <div key={i} className="p-2.5 rounded-lg border border-brand-100 bg-brand-50/20 space-y-2">
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                      <div className="w-full sm:flex-1 sm:min-w-0">
                        <Select
                          value={row.itemId}
                          onChange={e => {
                            const selected = inventoryById[e.target.value];
                            setAddonRows(prev => prev.map((r, j) => j === i ? { ...r, itemId: e.target.value, unit: selected?.unit || r.unit } : r));
                          }}
                          className="w-full"
                        >
                          <option value="">Select material</option>
                          {addonPickerOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                        </Select>
                      </div>

                      <div className="flex gap-2 items-center">
                        <div className="flex-1 min-w-0 sm:w-24 sm:flex-none">
                          <input
                            value={row.qty}
                            type="text"
                            inputMode="decimal"
                            onChange={e => setAddonRows(prev => prev.map((r, j) => j === i ? { ...r, qty: sanitizeNumericText(e.target.value) } : r))}
                            placeholder="Qty"
                            className={`w-full px-2.5 py-1.5 text-sm border rounded-lg outline-none bg-white font-semibold ${rowQtyErr ? 'border-red-400' : 'border-brand-200 focus:border-brand-400'}`}
                          />
                        </div>

                        <div className="flex-1 min-w-0 sm:w-28 sm:flex-none">
                          <Select
                            value={row.unit}
                            onChange={e => setAddonRows(prev => prev.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))}
                            className="w-full"
                          >
                            <option value="">Unit</option>
                            {getCompatibleUnits(inventoryById[row.itemId]?.unit || row.unit).map(unit => <option key={unit} value={unit}>{unit}</option>)}
                          </Select>
                        </div>

                        <button
                          type="button"
                          onClick={() => setAddonRows(prev => prev.filter((_, j) => j !== i))}
                          className="p-2 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors shrink-0"
                          title="Remove row"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {rowQtyErr && (
                      <p className="text-[11px] text-red-600 font-medium pl-1">{rowQtyErr}</p>
                    )}
                  </div>
                );
              })}

              <button
                type="button"
                onClick={() => setAddonRows(prev => [...prev, { itemId: '', qty: '', unit: '' }])}
                className="w-full border border-dashed border-brand-300 hover:border-brand-500 bg-brand-50/40 hover:bg-brand-50 text-brand-600 font-bold py-2 text-xs rounded-lg transition-all flex items-center justify-center gap-1 mt-2"
              >
                <Plus size={13} /> Add Add-on
              </button>

              {!addonRows.length && (
                <p className="text-[11px] text-brand-300 text-center py-1">
                  No add-ons yet — packaging or other materials for bundle products go here, deducted from stock the same way when a batch is produced.
                </p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* PRODUCTION CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={!!confirmTarget}
        onClose={() => !confirmingIds[confirmTarget?.recipe?.id] && setConfirmTarget(null)}
        onConfirm={handleExecuteConfirm}
        title="Confirm Batch Production"
        message={
          confirmTarget ? (
            <div className="space-y-3 text-left text-sm text-gray-600">
              <p>Are you sure you want to start production for <strong>{confirmTarget.recipe.product}</strong>?</p>
              <div className="bg-brand-50 p-3 rounded-xl border border-brand-100 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Target Goal:</span>
                  <strong className="text-brand-900">{confirmTarget.goalNum} {confirmTarget.recipe.yieldUnit || 'pcs'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Complete Batches:</span>
                  <strong className="text-brand-900">{Math.ceil(Number(confirmTarget.goalNum) / (Number(confirmTarget.recipe.yield) || 1))} batch(es)</strong>
                </div>
                <div className="flex justify-between pt-1 border-t border-brand-200/60">
                  <span className="text-gray-700 font-medium">Total to Produce:</span>
                  <strong className="text-emerald-700">+{Math.ceil(Number(confirmTarget.goalNum) / (Number(confirmTarget.recipe.yield) || 1)) * (Number(confirmTarget.recipe.yield) || 1)} {confirmTarget.recipe.yieldUnit || 'pcs'}</strong>
                </div>
              </div>
              <p className="text-[11px] text-amber-600 font-medium bg-amber-50 p-2 rounded-lg border border-amber-200">
                ⚠️ The matching raw ingredients will be automatically deducted from inventory once this is confirmed.
              </p>
            </div>
          ) : ''
        }
        confirmLabel={confirmingIds[confirmTarget?.recipe?.id] ? 'Confirming...' : 'Confirm Production'}
        variant="primary"
      />

      {/* DELETE RECIPE CONFIRMATION MODAL */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => !isDeletingRef.current && setDeleteTarget(null)}
        onConfirm={handleDeleteRecipe}
        title="Delete Recipe"
        message={`Delete the recipe for "${deleteTarget?.product}"?`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'}
        variant="danger"
      />
    </div>
  );
}