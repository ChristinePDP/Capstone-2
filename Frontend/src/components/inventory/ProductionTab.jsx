import { useState, useMemo, useCallback } from 'react';
import { Plus, Trash2, CheckCircle2, Search, CalendarDays, AlertTriangle, ShoppingCart } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Card, CardSkeleton, ConfirmModal } from '../../components/ui/index';
import { sanitizeNumericText, getQtyError, MAX_QTY } from '../../utils/numberGuards';
import { normalizeText, normalizeUnit, convertToBase } from '../../utils/unitUtils';

// Pre-order cakes are produced PER ORDER (iba-iba ang theme/design/gastos), kaya
// hindi sila dumadaan sa "Target Goal → Confirm Production" ng Production Formula
// (na nagdadagdag ng stock sa products table para sa Buy Now). Ang listahan dito
// ay galing sa Confirmed Pre-Orders lang, at bawat item ay naka-link sa formula
// ng product para makita kung sapat ang stock ng ingredients.

const PAGE_SIZE = 20;

const roundQty = (value) => +Number(value || 0).toFixed(4);

const getOrderItems = (order = {}) => Array.isArray(order.order_items)
  ? order.order_items
  : Array.isArray(order.items)
    ? order.items
    : [];

const inventoryKey = (name, unit, type = '') => `${normalizeText(name)}|${normalizeUnit(unit)}|${normalizeText(type)}`;

const buildShortfallEntry = (entry, stockItem) => {
  const unit = normalizeUnit(entry.unit || stockItem?.unit || 'pcs');
  const totalNeeded = Number(entry.totalNeeded ?? 0);
  const stockValue = Number(stockItem?.stock ?? stockItem?.stock_quantity ?? 0);
  const stockUnit = normalizeUnit(stockItem?.unit || unit);
  const converted = convertToBase(stockValue, stockUnit, unit);
  const normalizedStock = Number.isFinite(converted) ? converted : stockValue;
  const shortage = Math.max(0, roundQty(totalNeeded - normalizedStock));
  if (shortage <= 0) return null;
  return { name: entry.name, unit, totalNeeded: roundQty(totalNeeded), currentStock: roundQty(normalizedStock), shortage: roundQty(shortage) };
};

const getItemQuantity = (item = {}) => Number(item.quantity ?? item.qty ?? item.count ?? 0);

const findInventoryItem = (name, itemType, ingredients, materials) => {
  const targetName = normalizeText(name);
  const collections = itemType === 'material'
    ? [materials, ingredients]
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

// ── PRODUCED PRE-ORDER ────────────────────────────────────────────────────
// Ang cakes ay ginagawa PER ORDER (iba-iba ang theme/design/gastos), kaya hindi
// sila dumadaan sa "Target Goal → Confirm Production" ng Formulas tab (na
// nagdadagdag ng stock sa products table para sa Buy Now). Dito, ang listahan
// ay direktang galing sa Confirmed Pre-Orders lang, at bawat item ay naka-link
// sa formula ng product para makita kung sapat ang stock ng ingredients.
const isConfirmedPreOrder = (order = {}) =>
  (order.order_type ?? order.orderType) === 'Pre-Order' && order.status === 'Confirmed';

const formatPickup = (value) => {
  if (!value) return 'No pickup date';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Para sa products na "Both" (Pick-up Today + Pre-Order): puwedeng piliin kung
// (a) 'fresh' = gumawa ng bago (bawas ingredients, walang galaw sa product stock), o
// (b) 'stock' = kunin sa nakaimbak na product stock (bawas product stock, walang
//     bawas sa ingredients). Default: 'fresh' (dating behavior).
const sourceKey = (orderId, itemKey) => `${orderId}|${itemKey}`;

const evaluateOrder = (order, sources = {}) => {
  const shortMap = {};
  const stockIssues = [];
  const missing = [];

  order.items.forEach(it => {
    const fromStock = it.canUseStock && sources[sourceKey(order.id, it.key)] === 'stock';
    if (fromStock) {
      if (it.stockQty < it.qty) {
        stockIssues.push({ productName: it.productName, needed: it.qty, available: it.stockQty });
      }
      return; // walang ingredients na ibabawas, kaya hindi kailangan ng formula
    }
    if (!it.recipe) missing.push(it);
    it.needs.forEach(n => {
      if (n.short <= 0) return;
      const k = `${normalizeText(n.name)}|${n.unit}`;
      shortMap[k] = shortMap[k]
        ? { ...shortMap[k], short: roundQty(shortMap[k].short + n.short) }
        : { name: n.name, unit: n.unit, short: n.short };
    });
  });

  const shortages = Object.values(shortMap);
  return {
    shortages,
    missing,
    stockIssues,
    needsAttention: shortages.length > 0 || missing.length > 0 || stockIssues.length > 0,
  };
};

function PreOrderProduction({ tabBar }) {
  const context = useApp() || {};
  const isLoading = !!context.loading;
  const orders = useMemo(() => context.orders || [], [context.orders]);
  const recipes = useMemo(() => context.recipes || [], [context.recipes]);
  const ingredients = useMemo(() => context.ingredients || [], [context.ingredients]);
  const materials = useMemo(() => context.materials || [], [context.materials]);
  const products = useMemo(() => context.products || [], [context.products]);

  const { producePreOrder } = context;
  const { show: showToast } = useToast();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [produceTarget, setProduceTarget] = useState(null);
  const [buyTarget, setBuyTarget] = useState(null); // order whose items-to-buy list is open
  const [expenseRows, setExpenseRows] = useState([{ label: '', amount: '' }]);
  const [expenseErrors, setExpenseErrors] = useState({});
  const [isProducing, setIsProducing] = useState(false);
  const [sources, setSources] = useState({}); // { 'orderId|itemKey': 'fresh' | 'stock' }

  const productsById = useMemo(
    () => Object.fromEntries(products.map(p => [p.id, p])),
    [products]
  );

  // Confirmed Pre-Orders lang — pinakamaagang pickup muna.
  const preOrders = useMemo(() => {
    return orders
      .filter(isConfirmedPreOrder)
      .map(order => {
        const items = getOrderItems(order)
          .filter(item => {
            const product = productsById[item.product_id || item.productId];
            return product?.category !== 'Celebration Material';
          })
          .map(item => {
            const productId = item.product_id || item.productId;
            const productName = item.product_name || item.productName || productsById[productId]?.name || 'Unknown product';
            const qty = getItemQuantity(item);
            const recipe = findRecipeByProductId(recipes, productId, productName);
            const product = productsById[productId];
            const canUseStock = isBatchProduct(product); // order type = Both
            const stockQty = Number(product?.stock_quantity ?? product?.stock ?? 0);

            let needs = [];
            if (recipe) {
              const yieldQty = Number(recipe.yield) > 0 ? Number(recipe.yield) : 1;
              // Prorated: ayon sa aktwal na ino-order (hindi buong batch).
              const batches = qty / yieldQty;
              needs = (recipe.ingredients || []).map(req => {
                const stockItem = findInventoryItem(req.name, req.itemType, ingredients, materials);
                const reqUnit = normalizeUnit(req.unit || stockItem?.unit || 'pcs');
                const needed = roundQty((Number(req.qty) || 0) * batches);
                const stockRaw = Number(stockItem?.stock ?? stockItem?.stock_quantity ?? 0);
                const converted = stockItem ? convertToBase(stockRaw, normalizeUnit(stockItem.unit || reqUnit), reqUnit) : NaN;
                const available = Number.isFinite(converted) ? converted : 0;
                return {
                  name: req.name,
                  unit: reqUnit,
                  needed,
                  available: roundQty(available),
                  short: roundQty(Math.max(0, needed - available)),
                  isMaterial: req.itemType === 'material',
                };
              });
            }

            return { key: productId || productName, productId, productName, qty, recipe, needs, canUseStock, stockQty };
          })
          // Pareho ang product sa iisang order (hal. 2 linya ng Cupcakes) → pagsamahin.
          .reduce((acc, it) => {
            const found = acc.find(x => x.key === it.key);
            if (!found) { acc.push({ ...it }); return acc; }
            found.qty += it.qty;
            found.needs = found.needs.map(n => {
              const other = it.needs.find(m => m.name === n.name && m.unit === n.unit);
              if (!other) return n;
              const needed = roundQty(n.needed + other.needed);
              return { ...n, needed, short: roundQty(Math.max(0, needed - n.available)) };
            });
            return acc;
          }, []);

        const customer = order.customers?.name || order.customer_name || order.customerName || 'Walk-in';
        const pickup = order.pickup_date ?? order.pickupDate ?? null;

        return {
          id: order.id,
          number: order.order_number ?? order.orderNumber ?? String(order.id).slice(0, 8),
          customer,
          pickup,
          items,
        };
      })
      .filter(o => o.items.length > 0)
      // Hidden sort: pinakamalapit na pickup date muna (kasama ang overdue sa
      // pinakauna). Walang pickup date = pinakahuli. Kapag pareho ang petsa,
      // sunod ang order number para stable ang pagkakasunod.
      .sort((a, b) => {
        const ta = a.pickup ? new Date(a.pickup).getTime() : NaN;
        const tb = b.pickup ? new Date(b.pickup).getTime() : NaN;
        const da = Number.isNaN(ta) ? Number.POSITIVE_INFINITY : ta;
        const db = Number.isNaN(tb) ? Number.POSITIVE_INFINITY : tb;
        if (da !== db) return da < db ? -1 : 1; // iwas NaN sa Infinity - Infinity
        return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
      });
  }, [orders, recipes, ingredients, materials, productsById]);

  // Kasama ang shortages/needsAttention na nakadepende sa napiling source ng bawat item.
  const evaluated = useMemo(
    () => preOrders.map(o => ({ ...o, ...evaluateOrder(o, sources) })),
    [preOrders, sources]
  );

  const usesStock = (order, it) => !!it.canUseStock && sources[sourceKey(order.id, it.key)] === 'stock';
  const setSource = (order, it, value) =>
    setSources(prev => ({ ...prev, [sourceKey(order.id, it.key)]: value }));

  const openProduce = (order) => {
    setProduceTarget(order);
    setExpenseRows([{ label: '', amount: '' }]);
    setExpenseErrors({});
  };

  const closeProduce = () => { if (!isProducing) setProduceTarget(null); };

  const updateExpense = (i, patch) => {
    setExpenseRows(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setExpenseErrors(prev => { const next = { ...prev }; delete next[i]; return next; });
  };

  const totalExpenses = expenseRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const handleProduce = async () => {
    if (!produceTarget || isProducing) return;

    // Walang laman na row = lalaktawan; kalahati lang ang laman = error.
    const errors = {};
    const cleaned = [];
    expenseRows.forEach((r, i) => {
      const label = r.label.trim();
      const hasAmount = String(r.amount).trim() !== '';
      if (!label && !hasAmount) return;
      if (!label) { errors[i] = 'Enter what the expense is for.'; return; }
      if (!hasAmount || !(Number(r.amount) > 0)) { errors[i] = 'Enter a price greater than 0.'; return; }
      if (Number(r.amount) > 1000000) { errors[i] = 'Price is too large.'; return; }
      cleaned.push({ label, amount: roundQty(Number(r.amount)) });
    });
    if (Object.keys(errors).length) { setExpenseErrors(errors); return; }

    if (typeof producePreOrder !== 'function') {
      showToast('Pre-order production is not connected to the backend yet.', 'warning');
      return;
    }

    const payload = {
      order_id: produceTarget.id,
      order_number: produceTarget.number,
      items: produceTarget.items.map(it => {
        // Ang backend ang nagko-compute ng prorated na ibabawas (qty ÷ yield).
        return {
          product_id: it.productId,
          product_name: it.productName,
          recipe_id: it.recipe?.id,
          quantity: it.qty,
          // true = kunin sa product stock (Both lang); false = gumawa ng bago
          use_stock: usesStock(produceTarget, it),
        };
      }),
      expenses: cleaned,
      total_expenses: roundQty(cleaned.reduce((sum, e) => sum + e.amount, 0)),
    };

    setIsProducing(true);
    try {
      await producePreOrder(payload);
      showToast(`✓ ${produceTarget.number} produced.`, 'success');
      setProduceTarget(null);
    } catch (err) {
      console.error('producePreOrder failed:', err);
      showToast(err?.message || "Couldn't mark the order as produced.", 'error');
    } finally {
      setIsProducing(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = evaluated.filter(o =>
    !q
    || String(o.number).toLowerCase().includes(q)
    || o.customer.toLowerCase().includes(q)
    || o.items.some(it => it.productName.toLowerCase().includes(q))
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const readyCount = evaluated.filter(o => !o.needsAttention).length;

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-brand-100 gap-3">
        <div>
          <h3 className="font-bold text-brand-800">Production</h3>
          <p className="text-xs text-brand-400 mt-0.5">Confirmed pre-orders only. Check if you have enough ingredients for each order before you produce.</p>
        </div>
      </div>

      {tabBar}

      <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="relative max-w-xs w-full">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search order, customer, or product..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none bg-white"
            />
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            {readyCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{readyCount} ready to produce</span>
            )}
            {evaluated.length - readyCount > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-100">{evaluated.length - readyCount} need attention</span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {isLoading && <CardSkeleton count={3} />}

        {!isLoading && paged.length > 0 && (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {paged.map(order => (
              <div
                key={order.id}
                className={`flex flex-col border rounded-xl bg-white shadow-sm overflow-hidden ${order.needsAttention ? 'border-red-200' : 'border-emerald-200'}`}
              >
                <div className="p-3 space-y-2 flex-1">
                  <div className="min-w-0">
                    <p className="font-bold text-brand-900 text-sm truncate">{order.number}</p>
                    <p className="text-[11px] text-brand-400 truncate">{order.customer}</p>
                  </div>

                  <span
                    title="Pickup date of this pre-order"
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-brand-600 bg-brand-50 border border-brand-100 px-1.5 py-0.5 rounded-md"
                  >
                    <CalendarDays size={10} /> Pickup: {formatPickup(order.pickup)}
                  </span>

                  <ul className="space-y-0.5">
                    {order.items.map(it => (
                      <li key={it.key} className="text-xs text-brand-800">
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="min-w-0 break-words">{it.productName}</span>
                          <span className="font-bold shrink-0">×{it.qty}</span>
                        </div>
                        {it.canUseStock && (
                          <div
                            className="mt-1 flex rounded-md overflow-hidden border border-brand-200 text-[10px] font-bold"
                            title="This product is also sold as Pick-up Today. Choose where this order comes from."
                          >
                            <button
                              type="button"
                              onClick={() => setSource(order, it, 'fresh')}
                              className={`flex-1 py-1 transition-colors ${!usesStock(order, it) ? 'bg-brand-600 text-white' : 'bg-white text-brand-500 hover:bg-brand-50'}`}
                            >
                              Produce new
                            </button>
                            <button
                              type="button"
                              onClick={() => setSource(order, it, 'stock')}
                              className={`flex-1 py-1 border-l border-brand-200 transition-colors ${usesStock(order, it) ? 'bg-brand-600 text-white' : 'bg-white text-brand-500 hover:bg-brand-50'}`}
                            >
                              From stock ({it.stockQty})
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>

                  {order.stockIssues.length > 0 && (
                    <p className="pt-2 border-t border-red-100 text-[11px] text-red-700">
                      <span className="font-bold">Not enough stock:</span> {order.stockIssues.map(s => `${s.productName} (need ${s.needed}, have ${s.available})`).join(', ')}. Switch to "Produce new" or restock.
                    </p>
                  )}

                  {order.missing.length > 0 && (
                    <p className="pt-2 border-t border-red-100 text-[11px] text-amber-700">
                      <span className="font-bold">No formula:</span> {order.missing.map(m => m.productName).join(', ')}. Add it in Production Formula.
                    </p>
                  )}
                </div>

                <div className="px-3 pb-3">
                  {order.shortages.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setBuyTarget(order)}
                      className="w-full flex items-center justify-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-100 py-1.5 rounded-lg transition-colors"
                    >
                      <AlertTriangle size={11} /> View items to buy ({order.shortages.length})
                    </button>
                  ) : order.needsAttention ? (
                    <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-100 py-1.5 rounded-lg">
                      <AlertTriangle size={11} /> Needs attention
                    </div>
                  ) : (
                    <Button size="sm" variant="primary" className="w-full justify-center bg-emerald-600 border-none" onClick={() => openProduce(order)}>
                      <CheckCircle2 size={12} className="mr-1" /> Produce
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !paged.length && (
          <div className="text-center py-8 text-brand-300">No confirmed pre-orders to produce.</div>
        )}
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-brand-100">
          <p className="text-xs text-brand-400">Page {safePage} of {totalPages}</p>
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>
            <Button size="sm" variant="secondary" disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={!!buyTarget}
        onClose={() => setBuyTarget(null)}
        title={`Items to buy — ${buyTarget?.number || ''}`}
        subtitle="Not enough stock for this order. Restock these before producing."
        size="md"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setBuyTarget(null)}>Close</Button>
          </div>
        }
      >
        {buyTarget && (
          <ul className="divide-y divide-gray-100 border border-red-100 rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
            {buyTarget.shortages.map((item, idx) => (
              <li key={`${item.name}-${item.unit}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-white">
                <span className="text-sm font-semibold text-gray-800">{idx + 1}. {item.name}</span>
                <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100">+{roundQty(item.short)} {item.unit}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      <Modal
        isOpen={!!produceTarget}
        onClose={closeProduce}
        title={`Produce ${produceTarget?.number || ''}`}
        subtitle="Add any theme or other expenses for this order."
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" disabled={isProducing} onClick={closeProduce}>Cancel</Button>
            <Button variant="primary" disabled={isProducing} onClick={handleProduce}>
              {isProducing ? 'Saving...' : 'Confirm Production'}
            </Button>
          </div>
        }
      >
        {produceTarget && (
          <div className="space-y-4">
            <div className="p-3 rounded-xl border border-brand-100 bg-brand-50/40 text-sm">
              <p className="font-bold text-brand-900">{produceTarget.number} <span className="font-normal text-brand-400 text-xs">· {produceTarget.customer}</span></p>
              <p className="text-brand-700 mt-1">
                {produceTarget.items.map(it => `${it.productName} ×${it.qty}${usesStock(produceTarget, it) ? ' (from stock)' : ''}`).join(' · ')}
              </p>
              {produceTarget.items.some(it => usesStock(produceTarget, it)) && (
                <p className="text-[11px] text-brand-500 mt-1.5">
                  Items marked “from stock” will be deducted from product stock. Their ingredients will not be deducted.
                </p>
              )}
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">Other / Theme Expenses</span>
                <span className="text-[10px] font-semibold text-brand-300">optional</span>
              </div>

              {expenseRows.map((row, i) => (
                <div key={i} className={`p-2.5 rounded-lg border space-y-1.5 ${expenseErrors[i] ? 'border-red-200 bg-red-50/30' : 'border-brand-100 bg-brand-50/20'}`}>
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={row.label}
                      onChange={e => updateExpense(i, { label: e.target.value })}
                      placeholder="e.g. Spiderman topper"
                      maxLength={80}
                      className={`flex-1 min-w-0 px-2.5 py-1.5 text-sm border rounded-lg outline-none bg-white ${expenseErrors[i] ? 'border-red-500' : 'border-brand-200 focus:border-brand-400'}`}
                    />
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-brand-400 pointer-events-none">₱</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={e => updateExpense(i, { amount: sanitizeNumericText(e.target.value) })}
                        placeholder="Price"
                        className={`w-full pl-6 pr-2 py-1.5 text-sm font-semibold border rounded-lg outline-none bg-white ${expenseErrors[i] ? 'border-red-500' : 'border-brand-200 focus:border-brand-400'}`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setExpenseRows(prev => (prev.length <= 1 ? [{ label: '', amount: '' }] : prev.filter((_, j) => j !== i)));
                        setExpenseErrors({});
                      }}
                      className="p-2 text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg shrink-0"
                      title="Remove expense"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {expenseErrors[i] && <p role="alert" className="text-[11px] text-red-600 font-medium pl-1">{expenseErrors[i]}</p>}
                </div>
              ))}

              <button
                type="button"
                onClick={() => setExpenseRows(prev => [...prev, { label: '', amount: '' }])}
                className="w-full border border-dashed border-brand-300 hover:border-brand-500 bg-brand-50/40 hover:bg-brand-50 text-brand-600 font-bold py-2 text-xs rounded-lg flex items-center justify-center gap-1"
              >
                <Plus size={13} /> Add Expense
              </button>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-brand-100 text-sm">
              <span className="text-brand-500 font-medium">Total expenses</span>
              <strong className="text-brand-900">₱{totalExpenses.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

// ── PRODUCED BY BATCH ─────────────────────────────────────────────────────
// Para sa mga product na may order type na "Both": gumagawa ng batch nang maaga,
// nababawasan ang ingredients, at nadadagdagan ang stock ng product para sa
// Buy Now. Ang products na Pre-Order lang (hal. cakes) ay per order ginagawa, kaya
// wala sila rito.
// I-edit ang `getProductOrderType` kung iba ang pangalan ng field sa products mo.
const getProductOrderType = (product) =>
  normalizeText(product?.order_type ?? product?.orderType ?? '');
const isBatchProduct = (product) => getProductOrderType(product) === 'both';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function BatchProduction({ tabBar }) {
  const context = useApp() || {};
  const isLoading = !!context.loading;
  const recipes = useMemo(() => context.recipes || [], [context.recipes]);
  const ingredients = useMemo(() => context.ingredients || [], [context.ingredients]);
  const materials = useMemo(() => context.materials || [], [context.materials]);
  const products = useMemo(() => context.products || [], [context.products]);
  const orders = useMemo(() => context.orders || [], [context.orders]);
  const { confirmBatch } = context;
  const { show: showToast } = useToast();

  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [quotas, setQuotas] = useState({});
  const [localStocks, setLocalStocks] = useState({});
  const [confirmingIds, setConfirmingIds] = useState({});
  const [confirmTarget, setConfirmTarget] = useState(null);

  const findProduct = useCallback(
    (recipe) => products.find(p => p.id === (recipe.productId || recipe.product_id))
      || products.find(p => normalizeText(p.name) === normalizeText(recipe.product)),
    [products]
  );

  // Ilan ang kayang gawin base sa stock ng ingredients/materials.
  const calculateMaxUnits = useCallback((recipe) => {
    if (!recipe.ingredients || recipe.ingredients.length === 0) return 0;
    let maxBatches = Infinity;

    for (const req of recipe.ingredients) {
      const stockItem = findInventoryItem(req.name, req.itemType, ingredients, materials);
      const stockValue = Number(stockItem?.stock ?? stockItem?.stock_quantity ?? 0);
      if (!stockItem || stockValue <= 0) return 0;

      const stockInReqUnit = convertToBase(stockValue, stockItem.unit, req.unit);
      if (!Number.isFinite(stockInReqUnit)) return 0;

      const possible = Math.floor(stockInReqUnit / Number(req.qty));
      if (possible < maxBatches) maxBatches = possible;
    }
    return maxBatches === Infinity ? 0 : maxBatches * Number(recipe.yield);
  }, [ingredients, materials]);

  const batchRecipes = useMemo(
    () => recipes.filter(r => {
      const product = findProduct(r);
      return product?.category !== 'Celebration Material' && isBatchProduct(product);
    }),
    [recipes, findProduct]
  );

  // ── SHOPPING LIST ──
  // Per recipe: ilang batch ang kailangan (Confirmed orders + Target Goal, o 1 batch
  // kung wala nang kayang gawin), i-sum ang kailangan per ingredient, at ISANG
  // BESES lang ibawas ang stock — para walang double-count.
  const allShortfalls = useMemo(() => {
    const orderedUnits = {};
    orders.filter(o => o.status === 'Confirmed').forEach(order => {
      getOrderItems(order).forEach(item => {
        const recipe = findRecipeByProductId(batchRecipes, item.product_id || item.productId, item.product_name || item.productName);
        if (!recipe) return;
        orderedUnits[recipe.id] = (orderedUnits[recipe.id] || 0) + getItemQuantity(item);
      });
    });

    const needs = {};
    for (const r of batchRecipes) {
      const yieldQty = Number(r.yield) > 0 ? Number(r.yield) : 1;
      const goal = Number(quotas[r.id]);
      const quotaUnits = goal > 0 && goal <= MAX_QTY ? goal * yieldQty : 0; // goal = batches
      const demandUnits = (orderedUnits[r.id] || 0) + quotaUnits;

      let batches = Math.ceil(demandUnits / yieldQty);
      if (batches <= 0 && calculateMaxUnits(r) <= 0) batches = 1;
      if (batches <= 0) continue;

      for (const req of r.ingredients || []) {
        const stockItem = findInventoryItem(req.name, req.itemType, ingredients, materials);
        const reqUnit = normalizeUnit(req.unit || stockItem?.unit || 'pcs');
        const stockUnit = normalizeUnit(stockItem?.unit || reqUnit);
        const perBatch = Number(req.qty) || 0;
        const converted = convertToBase(perBatch, reqUnit, stockUnit);
        const perBatchInStockUnit = Number.isFinite(converted) ? converted : perBatch;

        const key = inventoryKey(stockItem?.name || req.name, stockUnit, req.itemType);
        if (!needs[key]) needs[key] = { name: req.name, unit: stockUnit, totalNeeded: 0, stockItem };
        needs[key].totalNeeded = roundQty(needs[key].totalNeeded + perBatchInStockUnit * batches);
      }
    }

    return Object.values(needs)
      .map(entry => buildShortfallEntry({ name: entry.name, unit: entry.unit, totalNeeded: entry.totalNeeded }, entry.stockItem))
      .filter(Boolean);
  }, [orders, batchRecipes, quotas, ingredients, materials, calculateMaxUnits]);

  const q = search.trim().toLowerCase();
  const filtered = batchRecipes.filter(r => !q || (r.product || '').toLowerCase().includes(q));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    const { recipe, batchCount } = confirmTarget;
    if (!batchCount || batchCount <= 0) {
      showToast('Number of batches must be a positive number.', 'error');
      setConfirmTarget(null);
      return;
    }
    if (confirmingIds[recipe.id]) return;
    setConfirmingIds(prev => ({ ...prev, [recipe.id]: true }));

    const product = findProduct(recipe);
    const resolvedProductId = recipe.productId || product?.id;

    if (!UUID_RE.test(recipe.id) || !UUID_RE.test(resolvedProductId || '')) {
      showToast('Formula/product data not fully loaded yet — refresh the page and try again.', 'warning');
      setConfirmTarget(null);
      setConfirmingIds(prev => ({ ...prev, [recipe.id]: false }));
      return;
    }

    const perBatchYield = Number(recipe.yield) || 1;
    const batches = Number(batchCount);
    const totalProduced = batches * perBatchYield;

    try {
      if (confirmBatch) {
        await confirmBatch({
          recipe_id: recipe.id,
          product_id: resolvedProductId,
          product_name: recipe.product,
          batches,
          total_produced: totalProduced,
          yield_unit: recipe.yieldUnit || 'pcs',
          notes: '',
        });
      }
      const contextStock = product ? Number(product.stock ?? product.stock_quantity ?? 0) : 0;
      const current = localStocks[recipe.id] !== undefined ? localStocks[recipe.id] : contextStock;
      setLocalStocks(prev => ({ ...prev, [recipe.id]: current + totalProduced }));
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

  const confirmBatches = confirmTarget
    ? Number(confirmTarget.batchCount)
    : 0;

  return (
    <Card>
      <div className="flex flex-row items-start sm:items-center justify-between p-4 border-b border-brand-100 gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-brand-800">Production</h3>
          <p className="text-xs text-brand-400 mt-0.5">Enter the number of batches to produce for products that aren't pre-orders, like pastries.</p>
        </div>
        {allShortfalls.length > 0 && (
          <button
            type="button"
            onClick={() => setShoppingOpen(true)}
            title={`Shopping list — ${allShortfalls.length} ${allShortfalls.length === 1 ? 'item' : 'items'} to restock`}
            aria-label={`Open shopping list, ${allShortfalls.length} ${allShortfalls.length === 1 ? 'item' : 'items'} to restock`}
            className="relative inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg border border-brand-200 bg-white text-brand-700 hover:bg-brand-50 transition-colors shrink-0"
          >
            <ShoppingCart size={16} />
            <span className="text-xs font-bold hidden sm:inline">Shopping List</span>
            <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[11px] font-bold leading-none ring-2 ring-white">
              {allShortfalls.length}
            </span>
          </button>
        )}
      </div>

      {tabBar}

      <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/40">
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search product..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none bg-white"
          />
        </div>
      </div>

      <div className="p-4">
        {isLoading && <CardSkeleton count={3} />}

        {!isLoading && paged.length > 0 && (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-4">
            {paged.map(r => {
              const product = findProduct(r);
              const maxUnits = calculateMaxUnits(r);
              const quota = quotas[r.id] || '';
              const yieldPerBatch = Number(r.yield) > 0 ? Number(r.yield) : 1;
              const maxBatches = Math.floor(maxUnits / yieldPerBatch);
              const quotaNum = Number(quota);
              const hasInput = quotaNum > 0 && quotaNum <= MAX_QTY;
              const canMake = hasInput && quotaNum <= maxBatches;
              const quotaError = quota !== ''
                ? (getQtyError(quota, { max: MAX_QTY, label: 'Batches' })
                  || (!Number.isInteger(quotaNum) ? 'Batches must be a whole number.' : null))
                : null;
              const totalPieces = hasInput && Number.isInteger(quotaNum) ? quotaNum * yieldPerBatch : 0;
              const currentStock = localStocks[r.id] !== undefined
                ? localStocks[r.id]
                : (product ? Number(product.stock ?? product.stock_quantity ?? 0) : 0);
              const unit = r.yieldUnit || 'pcs';

              return (
                <div key={r.id} className="flex flex-col border border-brand-100 rounded-xl bg-white shadow-sm overflow-hidden">
                  <div className="p-4 space-y-3 flex-1">
                    <div className="min-w-0">
                      <p className="font-bold text-brand-900 text-base break-words leading-tight">{r.product}</p>
                      <p className="text-xs text-brand-400 mt-0.5">Yield: {r.yield} {unit} / batch</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-brand-50/60 border border-brand-100 px-3 py-2.5">
                        <p className="text-brand-400">Can make</p>
                        <p className={`font-bold text-sm mt-0.5 ${maxBatches === 0 ? 'text-red-600' : 'text-emerald-600'}`}>{maxBatches} {maxBatches === 1 ? 'batch' : 'batches'}</p>
                        <p className="text-[11px] text-brand-400">{maxUnits} {unit}</p>
                      </div>
                      <div className="rounded-lg bg-brand-50/60 border border-brand-100 px-3 py-2.5">
                        <p className="text-brand-400">In stock</p>
                        <p className="font-bold text-sm mt-0.5 text-blue-700">{currentStock} {unit}</p>
                      </div>
                    </div>
                  </div>

                  <div className="px-4 pb-4 space-y-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={quota}
                      onChange={e => setQuotas(prev => ({ ...prev, [r.id]: sanitizeNumericText(e.target.value) }))}
                      placeholder="No. of batches"
                      className={`w-full px-3 py-2.5 text-sm text-center font-bold border rounded-lg outline-none ${quotaError ? 'bg-red-50 text-red-700 border-red-400' : hasInput ? (canMake ? 'bg-emerald-50 text-emerald-700 border-emerald-400' : 'bg-red-50 text-red-700 border-red-300') : 'bg-white border-brand-200'}`}
                    />
                    {/* Fixed-height message slot para hindi tumalon ang layout kapag may tinype */}
                    <div className="min-h-[16px] text-[11px] font-medium text-center leading-4">
                      {quotaError ? (
                        <span className="text-red-600">{quotaError}</span>
                      ) : hasInput && !canMake ? (
                        <span className="text-red-600">Only enough for {maxBatches} {maxBatches === 1 ? 'batch' : 'batches'}.</span>
                      ) : canMake ? (
                        <span className="text-emerald-700">= {totalPieces} {unit}</span>
                      ) : null}
                    </div>
                    {/* Laging nakikita ang Confirm — disabled lang hanggang valid ang input */}
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!canMake || !!quotaError || !!confirmingIds[r.id]}
                      className={`w-full justify-center border-none ${canMake && !quotaError ? 'bg-emerald-600' : 'bg-brand-200 text-brand-400 cursor-not-allowed opacity-70'}`}
                      onClick={() => setConfirmTarget({ recipe: r, batchCount: quotaNum })}
                    >
                      <CheckCircle2 size={12} className="mr-1" /> {confirmingIds[r.id] ? 'Confirming...' : 'Confirm'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && !paged.length && (
          <div className="text-center py-8 text-brand-300">No products to produce by batch.</div>
        )}
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-brand-100">
          <p className="text-xs text-brand-400">Page {safePage} of {totalPages}</p>
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" disabled={safePage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>
            <Button size="sm" variant="secondary" disabled={safePage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={shoppingOpen}
        onClose={() => setShoppingOpen(false)}
        title="Shopping List"
        subtitle="Items to restock to cover your pending orders and production targets."
        size="lg"
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setShoppingOpen(false)}>Close</Button>
          </div>
        }
      >
        {allShortfalls.length > 0 ? (
          <ul className="divide-y divide-gray-100 border border-red-100 rounded-xl overflow-hidden max-h-[60vh] overflow-y-auto">
            {allShortfalls.map((item, idx) => (
              <li key={`${item.name}-${item.unit}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-white">
                <span className="text-sm font-semibold text-gray-800">{idx + 1}. {item.name}</span>
                <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100">+{roundQty(item.shortage)} {item.unit}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-center text-sm text-brand-400 py-6">Nothing to restock right now.</p>
        )}
      </Modal>

      <ConfirmModal
        isOpen={!!confirmTarget}
        onClose={() => !confirmingIds[confirmTarget?.recipe?.id] && setConfirmTarget(null)}
        onConfirm={handleConfirm}
        title="Confirm Batch Production"
        message={
          confirmTarget ? (
            <div className="space-y-3 text-left text-sm text-gray-600">
              <p>Start production for <strong>{confirmTarget.recipe.product}</strong>?</p>
              <div className="bg-brand-50 p-3 rounded-xl border border-brand-100 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Batches:</span>
                  <strong className="text-brand-900">{confirmBatches} {confirmBatches === 1 ? 'batch' : 'batches'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Yield per batch:</span>
                  <strong className="text-brand-900">{Number(confirmTarget.recipe.yield) || 1} {confirmTarget.recipe.yieldUnit || 'pcs'}</strong>
                </div>
                <div className="flex justify-between pt-1 border-t border-brand-200/60">
                  <span className="text-gray-700 font-medium">Total to Produce:</span>
                  <strong className="text-emerald-700">+{confirmBatches * (Number(confirmTarget.recipe.yield) || 1)} {confirmTarget.recipe.yieldUnit || 'pcs'}</strong>
                </div>
              </div>
            </div>
          ) : ''
        }
        confirmLabel={confirmingIds[confirmTarget?.recipe?.id] ? 'Confirming...' : 'Confirm Production'}
        variant="primary"
      />
    </Card>
  );
}

// ── Sub tabs: Made to Order | Pre-Order ──────────────────────
const PRODUCTION_VIEWS = [
  { key: 'batch',    label: 'Made to Order' },
  { key: 'preorder', label: 'Pre-Order' },
];

export default function ProductionTab() {
  const [view, setView] = useState(() => {
    const saved = localStorage.getItem('production_tab_view');
    return PRODUCTION_VIEWS.some(v => v.key === saved) ? saved : 'batch';
  });

  const changeView = (key) => {
    setView(key);
    localStorage.setItem('production_tab_view', key);
  };

  const renderTabBar = (className) => (
    <div className={`flex gap-6 border-b-2 border-brand-100 ${className}`}>
      {PRODUCTION_VIEWS.map(tab => (
        <button
          key={tab.key}
          type="button"
          onClick={() => changeView(tab.key)}
          className={`pb-2.5 text-sm font-bold border-b-2 transition-all -mb-0.5 ${
            view === tab.key
              ? 'border-brand-800 text-brand-900'
              : 'border-transparent text-brand-400 hover:text-brand-600'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const tabBar = renderTabBar('px-4 mt-3');

  return view === 'preorder'
    ? <PreOrderProduction tabBar={tabBar} />
    : <BatchProduction tabBar={tabBar} />;
}