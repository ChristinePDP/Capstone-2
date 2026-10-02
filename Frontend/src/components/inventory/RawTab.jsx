import { useState, useRef, useEffect } from 'react';
import { Plus, Search, Pencil, Wallet, Tag, Package, RefreshCw, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Table, Tr, Td, Pagination, Badge, Card, LevelBar, ConfirmModal } from '../../components/ui/index';
import { ingStatus } from '../../utils/inventoryHelpers';
import { sanitizeNumericText, sanitizeQtyText, parseFractionInput, formatPesoLive, parseFormattedPeso, getQtyError, getCostError, MAX_QTY } from '../../utils/numberGuards';
import { STOCK_UNIT_CATEGORIES, UNIT_CONVERSION_HINTS } from '../../utils/unitUtils';
import { RestockHistoryPanel } from './InventoryHistoryModal';
import { TableSkeleton, CardSkeleton } from '../../components/ui/index';
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

export default function IngredientsTab() {
  const context = useApp() || {};
  const { addIngredient, updateIngredient, deleteIngredient, restockIngredient } = context;
  const ingredients = context.ingredients || [];
  const isLoading = !!context.loading;

  const { show: showToast } = useToast();
  const [containerRef, isCompact] = useIsCompact();
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editIng, setEditIng]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const isDeletingRef = useRef(false);

  const currentEditIng = ingredients.find(ing => ing.id === editIng?.id) || editIng;

  const filtered = ingredients.filter(ing => {
    const matchesSearch = ing.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ingStatus(ing.stock, ing.min).label === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Counts shown in the status dropdown. Uses the same ingStatus() as the
  // table's Status column and the filter, so the numbers always match what
  // you get after picking that option.
  const statusCounts = ingredients.reduce((acc, ing) => {
    const label = ingStatus(ing.stock, ing.min).label;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const handleSave = async (payload) => {
    if (payload.isNew) {
      await addIngredient(payload.newData);
      showToast('Raw ingredient added successfully.');
      return;
    }

    if (payload.detailsPayload && updateIngredient) {
      await updateIngredient(currentEditIng.id, payload.detailsPayload);
    }
    if (payload.restockPayload && restockIngredient) {
      await restockIngredient(currentEditIng.id, payload.restockPayload);
    }

    if (payload.detailsPayload && payload.restockPayload) {
      showToast(`Details updated and +${payload.addedQty} ${currentEditIng.unit} added to ${currentEditIng.name}.`);
    } else if (payload.restockPayload) {
      showToast(`+${payload.addedQty} ${currentEditIng.unit} added to ${currentEditIng.name}.`);
    } else if (payload.detailsPayload) {
      showToast('Ingredient details updated.');
    }
  };

  const handleDelete = async () => {
    if (isDeletingRef.current || !deleteTarget) return;
    isDeletingRef.current = true;
    setIsDeleting(true);
    try {
      if (deleteIngredient) await deleteIngredient(deleteTarget.id);
      showToast(`${deleteTarget.name} removed from ingredients.`, 'warning');
    } catch (err) {
      showToast(err.message || 'Failed to delete ingredient', 'error');
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-brand-100 gap-3">
          <div>
            <h3 className="font-bold text-brand-800 flex items-center gap-2">
              Ingredients
              <span className="text-[11px] font-bold text-brand-600 bg-brand-100 px-2 py-0.5 rounded-full">{ingredients.length} total</span>
            </h3>
            <p className="text-xs text-brand-400 mt-0.5">Keep track of the key raw ingredients used to produce your products.</p>
          </div>
          <Button variant="dark" onClick={() => { setEditIng(null); setModalOpen(true); }} className="w-full sm:w-auto justify-center">
            <Plus size={14} /> Add New Ingredient
          </Button>
        </div>

        <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/40">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative max-w-xs w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search ingredient..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none focus:border-brand-400 bg-white"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none focus:border-brand-400 bg-white font-semibold text-brand-700 cursor-pointer w-full sm:w-auto"
            >
              <option value="all">All Status ({ingredients.length})</option>
              <option value="In Stock">In Stock ({statusCounts['In Stock'] || 0})</option>
              <option value="Low Stock">Low Stock ({statusCounts['Low Stock'] || 0})</option>
              <option value="Out of Stock">Out of Stock ({statusCounts['Out of Stock'] || 0})</option>
            </select>
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
                <div className="space-y-3">
                  {paged.map(ing => {
                    const st = ingStatus(ing.stock, ing.min);
                    return (
                      <div key={ing.id} className="p-4 bg-white border border-brand-100 rounded-xl shadow-sm">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h4 className="font-bold text-brand-800 text-sm">{ing.name}</h4>
                            <p className="text-xs text-brand-500 mt-0.5">
                              Stock: <span className="font-bold text-brand-700">{ing.stock} {ing.unit}</span>
                            </p>
                          </div>
                          <Badge variant={st.cls}>{st.label}</Badge>
                        </div>
                        <div className="my-3">
                          <LevelBar stock={ing.stock} min={ing.min} />
                        </div>
                        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-brand-50">
                          <Button size="sm" variant="secondary" onClick={() => { setEditIng(ing); setModalOpen(true); }}>Restock / Edit</Button>
                          <Button size="sm" variant="danger" onClick={() => setDeleteTarget(ing)}>Delete</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Table columns={[
                  { label: 'Ingredient Name' },
                  { label: 'Current Stock' },
                  { label: 'Stock Level' },
                  { label: 'Status' },
                  { label: 'Actions', align: 'right' },
                ]}>
                  {paged.map(ing => {
                    const st = ingStatus(ing.stock, ing.min);
                    return (
                      <Tr key={ing.id}>
                        <Td><strong>{ing.name}</strong></Td>
                        <Td><strong>{ing.stock}</strong> {ing.unit}</Td>
                        <Td><LevelBar stock={ing.stock} min={ing.min} /></Td>
                        <Td><Badge variant={st.cls}>{st.label}</Badge></Td>
                        <Td align="right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="secondary" onClick={() => { setEditIng(ing); setModalOpen(true); }}>Restock / Edit</Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteTarget(ing)}>Delete</Button>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </Table>
              )}

              {!paged.length && (
                <div className="text-center py-10 text-brand-400 font-medium bg-white border border-dashed border-brand-200 rounded-xl">
                  {(search || statusFilter !== 'all') ? 'No matching ingredient found.' : 'No ingredients recorded yet.'}
                </div>
              )}
            </>
          )}
        </div>

        {filtered.length > PER_PAGE && (
           <div className="p-3 border-t border-brand-100">
             <Pagination page={page} count={filtered.length} perPage={PER_PAGE} total="ingredients" onChange={setPage} />
           </div>
        )}
      </Card>

      <IngredientModal
        key={currentEditIng?.id ?? 'new'} 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        ingredient={currentEditIng}
        onSave={handleSave}
      />

      <ConfirmModal
        isOpen={!!deleteTarget} 
        onClose={() => !isDeletingRef.current && setDeleteTarget(null)} 
        onConfirm={handleDelete}
        title="Delete Ingredient" 
        message={`Remove "${deleteTarget?.name}" from the list?`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'} 
        variant="danger"
      />
    </div>
  );
}

function IngredientModal({ isOpen, onClose, ingredient, onSave }) {
  const [name, setName]               = useState(ingredient?.name ?? '');
  const [unit, setUnit]               = useState(ingredient?.unit ?? 'kg');
  const [stock, setStock]             = useState('');
  const [min, setMin]                 = useState(ingredient?.min ?? '');
  const [cost, setCost]               = useState('');
  const [expiry, setExpiry]           = useState('');
  const [detailsCost, setDetailsCost] = useState(String(ingredient?.costPerUnit ?? ''));

  const [editingDetails, setEditingDetails] = useState(false);
  const [isSaving, setIsSaving]             = useState(false);
  const [confirmPayload, setConfirmPayload] = useState(null);

  // Inline validation: ang error ng bawat field ay lumalabas mismo sa field (EventManager style).
  const [errors, setErrors]           = useState({});
  const [serverError, setServerError] = useState(null);

  const isEdit = !!ingredient?.id;

  const finalizedStock = parseFractionInput(stock);
  const addedQty       = parseFloat(finalizedStock) || 0;

  const qtyError         = stock ? getQtyError(finalizedStock, { max: MAX_QTY, label: isEdit ? 'Quantity to add' : 'Stock quantity' }) : '';
  const minError         = getQtyError(min, { max: MAX_QTY, label: 'Minimum safety stock' });
  const costError        = getCostError(cost);
  const detailsCostError = getCostError(detailsCost);

  const isDetailsModified = isEdit && (
    name.trim() !== (ingredient?.name ?? '').trim() ||
    unit !== (ingredient?.unit ?? 'kg') ||
    String(min) !== String(ingredient?.min ?? '') ||
    String(detailsCost) !== String(ingredient?.costPerUnit ?? '')
  );

  // Errors ng "Ingredient Details" panel (edit mode)
  const computeDetailsErrors = () => {
    const next = {};
    if (!name.trim()) next.name = 'Name is required.';
    if (minError) next.min = minError;
    if (detailsCostError) next.detailsCost = detailsCostError;
    return next;
  };

  // Lahat ng error ng buong form, depende kung Add o Edit.
  const computeErrors = () => {
    const next = {};

    if (!isEdit) {
      if (!name.trim()) next.name = 'Ingredient name is required.';

      if (!stock) next.stock = 'Stock quantity is required.';
      else if (parseFloat(finalizedStock) < 0) next.stock = 'Stock quantity cannot be negative.';
      else if (qtyError) next.stock = qtyError;

      if (!min) next.min = 'Minimum stock is required.';
      else if (minError) next.min = minError;

      if (!cost) next.cost = 'Total amount is required.';
      else if (costError) next.cost = costError;

      return next;
    }

    if (isDetailsModified || editingDetails) Object.assign(next, computeDetailsErrors());

    if (stock) {
      if (addedQty <= 0) next.stock = 'Quantity must be greater than 0.';
      else if (qtyError) next.stock = qtyError;

      if (!cost) next.cost = 'Total cost is required when adding stock.';
      else if (costError) next.cost = costError;
    }

    if (!isDetailsModified && !stock) {
      next.general = 'Nothing was changed or added. Edit the details or enter a quantity to add.';
    }

    return next;
  };

  const scrollToFirstInvalid = () => {
    setTimeout(() => {
      document.querySelector('[data-invalid="true"]')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  // Fresh na form sa tuwing bubukas ang modal.
  useEffect(() => {
    if (isOpen) {
      setErrors({});
      setServerError(null);
    }
  }, [isOpen]);

  // Mawawala agad ang error ng field na naayos na habang nagta-type.
  useEffect(() => {
    setErrors(prev => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const latest = computeErrors();
      const next = {};
      keys.forEach(k => { if (latest[k]) next[k] = latest[k]; });
      return Object.keys(next).length === keys.length ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, unit, stock, min, cost, detailsCost, editingDetails]);

  // Error na ipapakita sa field: required/submit error muna, kung wala ay live format error.
  const fieldErr = {
    name:        errors.name,
    stock:       errors.stock || qtyError,
    min:         errors.min || minError,
    cost:        errors.cost || costError,
    detailsCost: errors.detailsCost || detailsCostError,
  };

  const handleDetailsHeaderClick = () => {
    if (!editingDetails) {
      setEditingDetails(true);
      return;
    }
    if (isDetailsModified) {
      const found = computeDetailsErrors();
      if (Object.keys(found).length > 0) {
        setErrors(prev => {
          const rest = { ...prev };
          delete rest.name; delete rest.min; delete rest.detailsCost;
          return { ...rest, ...found };
        });
        scrollToFirstInvalid();
        return;
      }
    }
    setEditingDetails(false);
  };

  const handleCancelDetails = () => {
    setName(ingredient?.name ?? '');
    setUnit(ingredient?.unit ?? 'kg');
    setMin(ingredient?.min ?? '');
    setDetailsCost(String(ingredient?.costPerUnit ?? ''));
    setErrors(prev => {
      const rest = { ...prev };
      delete rest.name; delete rest.min; delete rest.detailsCost;
      return rest;
    });
    setEditingDetails(false);
  };

  const handleValidate = () => {
    if (isSaving) return;
    setServerError(null);

    const found = computeErrors();
    if (Object.keys(found).length > 0) {
      setErrors(found);
      scrollToFirstInvalid();
      return;
    }
    setErrors({});

    if (!isEdit) {
      setConfirmPayload({
        isNew: true,
        newData: {
          name: name.trim(),
          unit,
          stock_quantity: addedQty,
          minimum_stock: parseFloat(min),
          cost_per_unit: cost ? parseFloat(cost) / addedQty : 0,
          category: 'Raw Material',
          expiration_date: expiry || null
        },
        addedQty,
        itemName: name.trim(),
        itemUnit: unit,
        totalCost: cost ? parseFloat(cost) : 0
      });
      return;
    }

    const detailsPayload = isDetailsModified || editingDetails
      ? { name: name.trim(), unit, minimum_stock: parseFloat(min) || 0, cost_per_unit: detailsCost ? parseFloat(detailsCost) : 0 }
      : null;

    const restockPayload = stock ? {
      added_qty: addedQty,
      total_cost: cost ? parseFloat(cost) : 0,
      expiration_date: expiry || null
    } : null;

    setConfirmPayload({
      detailsPayload,
      restockPayload,
      addedQty,
      itemName: name.trim(),
      itemUnit: unit,
      totalCost: cost ? parseFloat(cost) : 0,
    });
  };

  const executeSave = async () => {
    if (!confirmPayload) return;
    setIsSaving(true);
    try {
      await onSave(confirmPayload);
      setConfirmPayload(null);
      setStock('');
      setCost('');
      setExpiry('');
      onClose();
    } catch (err) {
      // Ipinapakita sa loob ng modal (hindi toast sa labas)
      setServerError(err.message || 'Failed to save');
      setConfirmPayload(null);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmTitle = confirmPayload?.isNew
    ? 'Confirm New Ingredient'
    : confirmPayload?.detailsPayload && confirmPayload?.restockPayload
      ? 'Confirm Changes and Restock'
      : confirmPayload?.restockPayload
        ? 'Confirm Restock'
        : 'Confirm Changes';

  const confirmMessage = confirmPayload?.detailsPayload && confirmPayload?.restockPayload
    ? `This will save the new details for "${confirmPayload.itemName}" AND add ${confirmPayload.addedQty} ${confirmPayload.itemUnit}${confirmPayload.totalCost > 0 ? ` (₱${confirmPayload.totalCost.toFixed(2)})` : ''} to stock. Are you sure?`
    : confirmPayload?.restockPayload
      ? `Add ${confirmPayload?.addedQty} ${confirmPayload?.itemUnit} to ${confirmPayload?.itemName}${confirmPayload?.totalCost > 0 ? ` for a total cost of ₱${confirmPayload?.totalCost.toFixed(2)}` : ''}?`
      : `Save the new details for "${confirmPayload?.itemName}"?`;

  const bannerMessage = serverError || errors.general;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => !isSaving && onClose()}
        title={isEdit ? `Manage Stock — ${ingredient?.name}` : 'Add New Ingredient'}
        subtitle={isEdit ? `Unit: ${ingredient?.unit}` : 'Record a newly purchased sack or bulk ingredient.'}
        size="lg"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" disabled={isSaving} onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={isSaving} onClick={handleValidate}>
              {isEdit ? 'Save Changes' : 'Save Ingredient'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Server/save error o "nothing changed" — nasa loob ng modal mismo */}
          {bannerMessage && (
            <div role="alert" className="px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 font-medium">
              {bannerMessage}
            </div>
          )}

          {isEdit && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-50 border border-brand-100">
              <div className="w-9 h-9 rounded-lg bg-white border border-brand-200 flex items-center justify-center shrink-0 shadow-sm">
                <Wallet size={16} className="text-brand-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-brand-400">Total Cost of Current Stock</p>
                <p className="text-lg font-black text-brand-800 leading-tight">
                  ₱{((ingredient?.stock || 0) * (ingredient?.costPerUnit || 0)).toFixed(2)}
                  <span className="text-xs font-semibold text-brand-400 ml-1.5">({ingredient?.stock} {ingredient?.unit})</span>
                </p>
              </div>
            </div>
          )}

          {!isEdit && (
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Tag size={13} className="text-brand-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-400">1. Basic Information</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                  <FormInput
                    label="Ingredient Name"
                    required
                    error={fieldErr.name}
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Wash Sugar"
                  />
                  <FormSelect
                    label="Unit of Measurement"
                    required
                    hint={UNIT_CONVERSION_HINTS[unit]}
                    value={unit}
                    onChange={e => setUnit(e.target.value)}
                  >
                    {STOCK_UNIT_CATEGORIES.map(cat => (
                      <optgroup key={cat.label} label={cat.label}>
                        {cat.units.map(u => <option key={u} value={u}>{u}</option>)}
                      </optgroup>
                    ))}
                  </FormSelect>
                </div>
              </div>

              <div className="border-t border-brand-100" />

              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Package size={13} className="text-brand-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-400">2. Stock Levels</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                  <FormInput
                    label="Initial Stock Quantity"
                    required
                    error={fieldErr.stock}
                    type="text"
                    inputMode="decimal"
                    suffix={unit}
                    value={stock}
                    onChange={e => setStock(sanitizeQtyText(e.target.value))}
                    onBlur={() => setStock(current => parseFractionInput(current))}
                    placeholder="e.g. 0.25 or 1/4"
                  />
                  <FormInput
                    label="Minimum Safety Stock"
                    required
                    error={fieldErr.min}
                    type="text"
                    inputMode="decimal"
                    suffix={unit}
                    value={min}
                    onChange={e => setMin(sanitizeNumericText(e.target.value))}
                    placeholder="e.g. 50"
                  />
                </div>
              </div>

              <div className="border-t border-brand-100" />

              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Wallet size={13} className="text-brand-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-400">3. Cost & Financials</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-6">
                  <FormInput
                    label="Total Amount / Receipt"
                    required
                    error={fieldErr.cost}
                    type="text"
                    inputMode="decimal"
                    value={formatPesoLive(cost)}
                    onChange={e => setCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))}
                    placeholder="₱0.00"
                  />
                  <FormInput
                    label="Expiration Date (Optional)"
                    type="date"
                    value={expiry}
                    onChange={e => setExpiry(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {isEdit && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">

              <div className="p-4 rounded-xl border border-brand-100 bg-brand-50/30 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-brand-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-500">Ingredient Details</span>

                  {editingDetails ? (
                    <div className="flex items-center gap-1.5">
                      {isDetailsModified && (
                        <button
                          type="button"
                          onClick={handleCancelDetails}
                          className="text-xs font-bold text-gray-500 hover:text-gray-700 bg-white px-2 py-1 rounded-lg border border-gray-200 shadow-sm transition-all"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleDetailsHeaderClick}
                        className={`text-xs font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg border shadow-sm transition-all ${
                          isDetailsModified
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                            : 'bg-white text-brand-600 hover:text-brand-800 border-brand-200'
                        }`}
                      >
                        {isDetailsModified ? (
                          <>
                            <Check size={12} /> Save
                          </>
                        ) : (
                          'Cancel'
                        )}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingDetails(true)}
                      className="text-xs font-bold text-brand-600 hover:text-brand-800 flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-brand-200 shadow-sm transition-all"
                    >
                      <Pencil size={12} /> Edit Details
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-x-2.5 gap-y-6">
                  {!editingDetails ? (
                    <>
                      <div className="p-2.5 bg-white rounded-lg border border-brand-100 min-w-0">
                        <span className="block text-[10px] font-bold uppercase text-brand-400">Name</span>
                        <span className="text-sm font-bold text-brand-800 truncate block">{name}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-brand-100 min-w-0">
                        <span className="block text-[10px] font-bold uppercase text-brand-400">Unit</span>
                        <span className="text-sm font-bold text-brand-800 block">{unit}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-brand-100 min-w-0">
                        <span className="block text-[10px] font-bold uppercase text-brand-400">Min. Stock</span>
                        <span className="text-sm font-bold text-brand-800 block">{min} {unit}</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg border border-brand-100 min-w-0">
                        <span className="block text-[10px] font-bold uppercase text-brand-400">Cost per Unit</span>
                        <span className="text-sm font-bold text-brand-800 block">₱{(parseFloat(detailsCost) || 0).toFixed(2)}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <FormInput
                        label="Name"
                        required
                        error={fieldErr.name}
                        value={name}
                        onChange={e => setName(e.target.value)}
                      />
                      <FormSelect label="Unit" required value={unit} onChange={e => setUnit(e.target.value)}>
                        {STOCK_UNIT_CATEGORIES.map(cat => (
                          <optgroup key={cat.label} label={cat.label}>
                            {cat.units.map(u => <option key={u} value={u}>{u}</option>)}
                          </optgroup>
                        ))}
                      </FormSelect>
                      <FormInput
                        label="Min. Stock"
                        error={fieldErr.min}
                        type="text"
                        inputMode="decimal"
                        value={min}
                        onChange={e => setMin(sanitizeNumericText(e.target.value))}
                      />
                      <FormInput
                        label="Cost/Unit (₱)"
                        error={fieldErr.detailsCost}
                        type="text"
                        inputMode="decimal"
                        value={formatPesoLive(detailsCost)}
                        onChange={e => setDetailsCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-brand-200 bg-white shadow-sm space-y-3">
                <div className="flex items-center gap-1.5 pb-2 border-b border-brand-100">
                  <RefreshCw size={13} className="text-brand-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">Restock / Add Quantity</span>
                </div>

                <div className="space-y-6">
                  <FormInput
                    label="Quantity to Add"
                    error={fieldErr.stock}
                    type="text"
                    inputMode="decimal"
                    suffix={ingredient?.unit}
                    value={stock}
                    onChange={e => setStock(sanitizeQtyText(e.target.value))}
                    onBlur={() => setStock(current => parseFractionInput(current))}
                    placeholder="e.g. 0.25 or 1/4"
                  />
                  <FormInput
                    label="Total Amount / Receipt"
                    error={fieldErr.cost}
                    type="text"
                    inputMode="decimal"
                    value={formatPesoLive(cost)}
                    onChange={e => setCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))}
                    placeholder="₱0.00"
                  />
                  <FormInput
                    label="Expiration Date (Optional)"
                    type="date"
                    value={expiry}
                    onChange={e => setExpiry(e.target.value)}
                  />
                </div>
              </div>

            </div>
          )}

          {isEdit && <RestockHistoryPanel itemName={ingredient?.name} itemType="raw" />}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmPayload}
        onClose={() => !isSaving && setConfirmPayload(null)}
        onConfirm={executeSave}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={isSaving ? 'Saving...' : "Yes, I'm Sure"}
        variant="primary"
      />
    </>
  );
}