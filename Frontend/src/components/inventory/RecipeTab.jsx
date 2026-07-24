import { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, CheckCircle2, ShoppingCart, Edit2, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Table, Tr, Td, Card, ConfirmModal } from '../../components/ui';

const PAGE_SIZE = 8;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const UNIT_ALIASES = {
  gram: 'g', grams: 'g', g: 'g',
  kilogram: 'kg', kilograms: 'kg', kg: 'kg',
  milliliter: 'ml', milliliters: 'ml', ml: 'ml',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l', l: 'l',
  piece: 'pcs', pieces: 'pcs', pc: 'pcs', pcs: 'pcs',
};

const UNIT_GROUPS = {
  mass: ['kg', 'g'],
  volume: ['l', 'ml'],
  count: ['pcs'],
};

const normalizeText = (value = '') => String(value).trim().toLowerCase();
const normalizeUnit = (unit = '') => UNIT_ALIASES[normalizeText(unit)] || normalizeText(unit);
const roundQty = (value) => +Number(value || 0).toFixed(4);

const getUnitGroup = (unit = '') => {
  const normalized = normalizeUnit(unit);
  return Object.entries(UNIT_GROUPS).find(([, units]) => units.includes(normalized))?.[0] || null;
};

const getCompatibleUnits = (unit = '') => {
  const normalized = normalizeUnit(unit);
  const group = getUnitGroup(normalized);
  return group ? UNIT_GROUPS[group] : (normalized ? [normalized] : []);
};

const convertToBase = (value, fromUnit, toUnit) => {
  const amount = Number(value);
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (!Number.isFinite(amount)) return NaN;
  if (!from || !to || from === to) return amount;

  const group = getUnitGroup(from);
  if (!group || group !== getUnitGroup(to)) return NaN;

  const factors = { kg: 1, g: 0.001, l: 1, ml: 0.001, pcs: 1 };
  if (!(from in factors) || !(to in factors)) return NaN;
  return amount * (factors[from] / factors[to]);
};

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
  const recipes = useMemo(() => context.recipes || [], [context.recipes]);
  const ingredients = useMemo(() => context.ingredients || [], [context.ingredients]);
  const materials = useMemo(() => context.materials || [], [context.materials]);
  const products = useMemo(() => context.products || [], [context.products]);
  const orders = useMemo(() => context.orders || [], [context.orders]);
  const { addRecipe, updateRecipe, deleteRecipe, confirmBatch, formatPHP } = context;

  const { show: showToast } = useToast();

  const [modalOpen, setModalOpen] = useState(false);
  const [editRecipe, setEditRecipe] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [rows, setRows] = useState([{ itemId: '', qty: '', unit: '' }]);
  const [productId, setProductId] = useState('');
  const [cost, setCost] = useState('');
  const [yld, setYld] = useState('');
  const [yldUnit, setYldUnit] = useState('pcs');

  const [quotas, setQuotas] = useState({});
  const [localStocks, setLocalStocks] = useState({});
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const inventoryOptions = useMemo(() => {
    const ingredientOptions = ingredients.map(item => ({
      id: item.id,
      name: item.name,
      unit: normalizeUnit(item.unit),
      sourceType: 'raw',
      label: `${item.name} (Raw${item.unit ? ` · ${normalizeUnit(item.unit)}` : ''})`,
    }));

    const materialOptions = materials.map(item => ({
      id: item.id,
      name: item.name,
      unit: normalizeUnit(item.unit),
      sourceType: 'material',
      label: `${item.name} (Material${item.unit ? ` · ${normalizeUnit(item.unit)}` : ''})`,
    }));

    return [...ingredientOptions, ...materialOptions];
  }, [ingredients, materials]);

  const inventoryById = useMemo(() => {
    const map = {};
    inventoryOptions.forEach(item => { map[item.id] = item; });
    return map;
  }, [inventoryOptions]);

  const productOptions = useMemo(() => products.map(product => ({
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
      if (!targetGoal || targetGoal <= 0) continue;
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
    setCost('');
    setYld('');
    setYldUnit('pcs');
    setRows([{ itemId: '', qty: '', unit: '' }]);
    setModalOpen(true);
  };

  const openEdit = (r) => {
    setEditRecipe(r);
    setProductId(r.productId || products.find(p => normalizeText(p.name) === normalizeText(r.product))?.id || '');
    setCost(r.estimatedCost);
    setYld(r.yield);
    setYldUnit(r.yieldUnit);
    setRows((r.ingredients || []).map(i => {
      const item = inventoryOptions.find(option => normalizeText(option.name) === normalizeText(i.name || i.item_name || '') && normalizeText(option.sourceType) === normalizeText(i.itemType || i.item_type || option.sourceType));
      return {
        itemId: item?.id || '',
        qty: i.qty ?? i.quantity ?? '',
        unit: normalizeUnit(i.unit || item?.unit || ''),
      };
    }));
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (!productId) {
        showToast('Pumili muna ng product.', 'warning');
        return;
      }

      const matchedProduct = products.find(p => p.id === productId);
      if (!matchedProduct?.id) {
        showToast('Hindi makita ang product sa products list.', 'warning');
        return;
      }

      const numericYield = Number(yld);
      if (!Number.isFinite(numericYield) || numericYield <= 0) {
        showToast('Invalid ang yield. Pumili ng numerong mas mataas sa zero.', 'warning');
        return;
      }

      const validRows = rows.filter(row => row.itemId || row.qty || row.unit);
      if (!validRows.length) {
        showToast('Kailangan ng kahit isang ingredient row.', 'warning');
        return;
      }

      const normalizedIngredients = [];

      for (const row of validRows) {
        if (!row.itemId) {
          showToast('Pumili muna ng ingredient o material sa bawat row.', 'warning');
          return;
        }

        const inventoryItem = inventoryById[row.itemId];
        if (!inventoryItem) {
          showToast('May row na hindi valid ang ingredient/material selection.', 'warning');
          return;
        }

        const qtyValue = Number(row.qty);
        if (!Number.isFinite(qtyValue) || qtyValue <= 0) {
          showToast(`Invalid ang quantity para sa ${inventoryItem.name}.`, 'warning');
          return;
        }

        const selectedUnit = normalizeUnit(row.unit || inventoryItem.unit);
        const baseUnit = normalizeUnit(inventoryItem.unit);
        const normalizedQty = convertToBase(qtyValue, selectedUnit, baseUnit);
        if (!Number.isFinite(normalizedQty)) {
          showToast(`Hindi supported ang unit conversion para sa ${inventoryItem.name}.`, 'warning');
          return;
        }

        normalizedIngredients.push({
          item_type: inventoryItem.sourceType,
          item_name: inventoryItem.name,
          quantity: roundQty(normalizedQty),
          unit: baseUnit,
        });
      }

      const data = {
        product_id: matchedProduct.id,
        yield_quantity: numericYield,
        yield_unit: yldUnit || 'pcs',
        estimated_cost: Number(cost) || 0,
        ingredients: normalizedIngredients,
      };

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
      showToast(err?.message || 'May naganap na error sa pag-save ng recipe.', 'error');
    }
  };

  const handleDirectConfirm = async (recipe, goalNum) => {
    if (!goalNum || goalNum <= 0) return;

    const product = products.find(p => p.id === recipe.productId) || products.find(p => normalizeText(p.name) === normalizeText(recipe.product));
    const resolvedProductId = recipe.productId || product?.id;
    const recipeId = recipe.id;

    if (!UUID_RE.test(recipeId) || !UUID_RE.test(resolvedProductId || '')) {
      showToast('Hindi pa loaded ang backend UUIDs para sa recipe/product. Refresh the page and try again.', 'warning');
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
      showToast(`✓ ${totalProduced} ${recipe.yieldUnit || 'pcs'} ng ${recipe.product} na-produce.`, 'success');
    } catch (err) {
      console.error('confirmBatch failed:', err);
      showToast('Hindi na-log ang batch. Tingnan ang server console para sa validation error.', 'warning');
    }
  };

  const handleDeleteRecipe = async () => {
    if (!deleteTarget?.id) return;
    try {
      if (deleteRecipe) await deleteRecipe(deleteTarget.id);
      showToast('Recipe deleted.', 'success');
      setDeleteTarget(null);
    } catch (err) {
      console.error('deleteRecipe failed:', err);
      showToast(err?.message || 'Hindi ma-delete ang recipe.', 'error');
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
            <p className="text-xs text-brand-400 mt-0.5">Maglagay ng Goal upang makita kung sapat ang ingredients mo.</p>
          </div>
          <Button variant="dark" onClick={openAdd} className="w-full sm:w-auto justify-center"><Plus size={14} /> Add Recipe</Button>
        </div>

        <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/40">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1); }} placeholder="Search recipe..." className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none bg-white" />
          </div>
        </div>

        <div className="px-4 pb-4 mt-4">
          <div className="block md:hidden space-y-4">
            {paged.map(r => {
              const maxUnits = calculateMaxUnits(r, [...ingredients, ...materials]);
              const quota = quotas[r.id] || '';
              const quotaNum = Number(quota);
              const hasInput = quotaNum > 0;
              const canMake = hasInput && maxUnits >= quotaNum;
              const matchedProduct = products.find(p => p.id === r.productId) || products.find(p => normalizeText(p.name) === normalizeText(r.product));
              const currentStock = localStocks[r.id] !== undefined
                ? localStocks[r.id]
                : (matchedProduct ? Number(matchedProduct.stock ?? matchedProduct.stock_quantity ?? 0) : 0);

              return (
                <div key={r.id} className="p-4 bg-white border border-brand-100 rounded-xl shadow-sm space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-brand-900 text-base">{r.product}</h4>
                      <p className="text-[11px] text-brand-400 mt-0.5">Cost/Batch: {formatPHP(r.estimatedCost)} · Yield: {r.yield} {r.yieldUnit}</p>
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
                      <input type="number" placeholder="Target Goal" value={quota} onChange={e => setQuotas(prev => ({ ...prev, [r.id]: e.target.value }))} className={`w-full px-2 py-1.5 text-xs text-center border font-bold rounded-lg ${hasInput ? (canMake ? 'bg-emerald-50 text-emerald-700 border-emerald-400' : 'bg-red-50 text-red-700 border-red-300') : 'bg-white'}`} />
                    </div>
                    {canMake && (
                      <Button size="sm" variant="primary" className="bg-emerald-600 text-xs px-3 border-none py-2 h-auto" onClick={() => handleDirectConfirm(r, quotaNum)}>
                        <CheckCircle2 size={12} className="mr-1" /> Confirm
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="hidden md:block">
            <Table columns={[{ label: 'Item Info' }, { label: 'Items per Batch' }, { label: 'Expense per Batch' }, { label: 'Stock Capacity' }, { label: 'Production Target' }, { label: 'Finished Production' }, { label: 'Actions', align: 'right' }]}>
              {paged.map(r => {
                const maxUnits = calculateMaxUnits(r, [...ingredients, ...materials]);
                const quota = quotas[r.id] || '';
                const quotaNum = Number(quota);
                const hasInput = quotaNum > 0;
                const canMake = hasInput && maxUnits >= quotaNum;
                const matchedProduct = products.find(p => p.id === r.productId) || products.find(p => normalizeText(p.name) === normalizeText(r.product));
                const currentStock = localStocks[r.id] !== undefined
                  ? localStocks[r.id]
                  : (matchedProduct ? Number(matchedProduct.stock ?? matchedProduct.stock_quantity ?? 0) : 0);

                return (
                  <Tr key={r.id}>
                    <Td><p className="font-bold text-brand-900 text-sm">{r.product}</p></Td>
                    <Td><p className="font-semibold text-brand-700">{r.yield} {r.yieldUnit}</p></Td>
                    <Td><p className="font-semibold text-brand-500">{formatPHP(r.estimatedCost)}</p></Td>
                    <Td><span className={`font-bold px-2 py-1 rounded-md border ${maxUnits === 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{maxUnits} {r.yieldUnit}</span></Td>
                    <Td><input type="number" value={quota} onChange={e => setQuotas(prev => ({ ...prev, [r.id]: e.target.value }))} placeholder="0" className={`w-20 px-2 py-1 text-center font-bold border rounded-lg ${hasInput ? (canMake ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700') : 'bg-white'}`} /></Td>
                    <Td><span className="font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border">{currentStock} {r.yieldUnit}</span></Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-2">
                        {canMake && <Button size="sm" variant="primary" className="bg-emerald-600 border-none" onClick={() => handleDirectConfirm(r, quotaNum)}><CheckCircle2 size={12} className="mr-1" /> Confirm</Button>}
                        <button onClick={() => openEdit(r)} className="p-1.5 text-brand-400 hover:text-brand-700"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteTarget(r)} className="p-1.5 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </Table>
          </div>

          {!paged.length && <div className="text-center py-8 text-brand-300">Walang recipe na nahanap.</div>}
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

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editRecipe ? 'Edit Recipe' : 'Add Recipe'}
        size="lg"
        footer={
          <div className="flex gap-3 ml-auto">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>Save Recipe</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select label="Product Name" required value={productId} onChange={e => setProductId(e.target.value)}>
              <option value="">Select product</option>
              {productOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </Select>
            <Input label="Est. Cost per Batch (₱)" type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00" />
            <Input label="Actual Yield per Batch" required type="number" value={yld} onChange={e => setYld(e.target.value)} placeholder="12" />
            <Input label="Yield Unit" value={yldUnit} onChange={e => setYldUnit(e.target.value)} placeholder="pcs" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase text-brand-500 mb-2">Ingredients</p>
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Select
                  value={row.itemId}
                  onChange={e => {
                    const selected = inventoryById[e.target.value];
                    setRows(prev => prev.map((r, j) => j === i ? { ...r, itemId: e.target.value, unit: selected?.unit || r.unit } : r));
                  }}
                  className="flex-2 min-w-0"
                  required
                >
                  <option value="">Select ingredient/material</option>
                  {inventoryOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </Select>
                <input value={row.qty} type="number" onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, qty: e.target.value } : r))} placeholder="Qty" className="w-20 px-2 py-1 text-sm border rounded-lg" />
                <Select
                  value={row.unit}
                  onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, unit: e.target.value } : r))}
                  className="w-24"
                  required
                >
                  <option value="">Unit</option>
                  {getCompatibleUnits(inventoryById[row.itemId]?.unit || row.unit).map(unit => <option key={unit} value={unit}>{unit}</option>)}
                </Select>
                <button onClick={() => setRows(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : [{ itemId: '', qty: '', unit: '' }])} className="p-2 text-red-500 bg-red-50 rounded"><Trash2 size={14} /></button>
              </div>
            ))}
            <button onClick={() => setRows(prev => [...prev, { itemId: '', qty: '', unit: '' }])} className="w-full border border-dashed py-2 text-xs text-brand-500 rounded-lg">+ Row</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteRecipe}
        title="Delete Recipe"
        message={`Burahin ang recipe para sa "${deleteTarget?.product}"?`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}