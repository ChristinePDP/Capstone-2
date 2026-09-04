import { useState, useRef } from 'react';
import { Plus, Search, Pencil, Wallet, Tag, Package, RefreshCw, Check } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Table, Tr, Td, Pagination, Badge, Card, LevelBar, ConfirmModal } from '../../components/ui/index';
import { ingStatus } from '../../utils/inventoryHelpers';
import { sanitizeNumericText, sanitizeQtyText, parseFractionInput, formatPesoLive, parseFormattedPeso, getQtyError, getCostError, MAX_QTY } from '../../utils/numberGuards';
import { STOCK_UNIT_CATEGORIES, UNIT_CONVERSION_HINTS } from '../../utils/unitUtils';
import { RestockHistoryPanel } from './InventoryHistoryModal';
import { TableSkeleton, CardSkeleton } from '../../components/ui/index';
import { useIsCompact } from '../../hooks/useIsCompact';

const PER_PAGE = 10;

export default function IngredientsTab() {
  const context = useApp() || {};
  const { addIngredient, updateIngredient, deleteIngredient, restockIngredient } = context;
  const ingredients = context.ingredients || [];
  const isLoading = !!context.loading;

  const { show: showToast } = useToast();
  const [containerRef, isCompact] = useIsCompact();
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editIng, setEditIng]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const isDeletingRef = useRef(false);

  const currentEditIng = ingredients.find(ing => ing.id === editIng?.id) || editIng;

  const filtered = ingredients.filter(ing =>
    ing.name.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

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
      showToast(`Na-update ang detalye at +${payload.addedQty} ${currentEditIng.unit} na-add sa ${currentEditIng.name}.`);
    } else if (payload.restockPayload) {
      showToast(`+${payload.addedQty} ${currentEditIng.unit} na-add sa ${currentEditIng.name}.`);
    } else if (payload.detailsPayload) {
      showToast('Naitama ang detalye ng ingredient.');
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
            <h3 className="font-bold text-brand-800">Raw Materials & Ingredients</h3>
            <p className="text-xs text-brand-400 mt-0.5">I-monitor ang Flour, Sugar, Baking Powder, at iba pang pangunahing sangkap.</p>
          </div>
          <Button variant="dark" onClick={() => { setEditIng(null); setModalOpen(true); }} className="w-full sm:w-auto justify-center">
            <Plus size={14} /> Add New Ingredient
          </Button>
        </div>

        <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/40">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search ingredient..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none focus:border-brand-400 bg-white"
            />
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
                  {search ? 'Walang nahanap na ingredient.' : 'Walang naka-record na raw materials.'}
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
        message={`I-delete ang "${deleteTarget?.name}" sa listahan?`}
        confirmLabel={isDeleting ? 'Dinedelete...' : 'Delete'} 
        variant="danger"
      />
    </div>
  );
}

function IngredientModal({ isOpen, onClose, ingredient, onSave }) {
  const { show: showToast } = useToast();
  
  const [name, setName]               = useState(ingredient?.name ?? '');
  const [unit, setUnit]               = useState(ingredient?.unit ?? 'kg');
  const [stock, setStock]             = useState('');
  const [min, setMin]                 = useState(ingredient?.min ?? '');
  const [cost, setCost]               = useState(''); 
  const [expiry, setExpiry]           = useState(''); // BAGONG DAGDAG
  const [detailsCost, setDetailsCost] = useState(String(ingredient?.costPerUnit ?? ''));

  const [editingDetails, setEditingDetails] = useState(false);
  const [isSaving, setIsSaving]             = useState(false);
  const [confirmPayload, setConfirmPayload] = useState(null);

  const isEdit = !!ingredient?.id;

  const finalizedStock = parseFractionInput(stock);
  const addedQty       = parseFloat(finalizedStock) || 0;
  
  const qtyError         = stock ? getQtyError(finalizedStock, { max: MAX_QTY, label: isEdit ? 'Dami na idadagdag' : 'Stock quantity' }) : '';
  const minError         = getQtyError(min, { max: MAX_QTY, label: 'Minimum safety stock' });
  const costError        = getCostError(cost);
  const detailsCostError = getCostError(detailsCost);

  const isDetailsModified = isEdit && (
    name.trim() !== (ingredient?.name ?? '').trim() ||
    unit !== (ingredient?.unit ?? 'kg') ||
    String(min) !== String(ingredient?.min ?? '') ||
    String(detailsCost) !== String(ingredient?.costPerUnit ?? '')
  );

  const handleDetailsHeaderClick = () => {
    if (!editingDetails) {
      setEditingDetails(true);
    } else {
      if (isDetailsModified) {
        if (!name.trim()) { showToast('Ingredient name is required.', 'error'); return; }
        if (minError) { showToast(minError, 'error'); return; }
        if (detailsCostError) { showToast(detailsCostError, 'error'); return; }
        
        setEditingDetails(false);
      } else {
        setEditingDetails(false);
      }
    }
  };

  const handleCancelDetails = () => {
    setName(ingredient?.name ?? '');
    setUnit(ingredient?.unit ?? 'kg');
    setMin(ingredient?.min ?? '');
    setDetailsCost(String(ingredient?.costPerUnit ?? ''));
    setEditingDetails(false);
  };

  const handleValidate = () => {
    if (isSaving) return;

    if (!isEdit) {
      if (!name.trim()) { showToast('Ingredient name is required.', 'error'); return; }
      if (!stock) { showToast('Stock quantity is required.', 'error'); return; }
      if (parseFloat(finalizedStock) < 0) { showToast('Stock quantity cannot be negative.', 'error'); return; }
      if (!min) { showToast('Minimum safety stock is required.', 'error'); return; }
      if (minError) { showToast(minError, 'error'); return; }
      if (qtyError) { showToast(qtyError, 'error'); return; }
      if (!cost) { showToast('Total halaga/resibo is required.', 'error'); return; }
      if (costError) { showToast(costError, 'error'); return; }

      setConfirmPayload({
        isNew: true,
        newData: { 
          name: name.trim(), 
          unit, 
          stock_quantity: addedQty, 
          minimum_stock: parseFloat(min), 
          cost_per_unit: cost ? parseFloat(cost) / addedQty : 0, 
          category: 'Raw Material',
          expiration_date: expiry || null // BAGONG DAGDAG
        },
        addedQty,
        itemName: name.trim(),
        itemUnit: unit,
        totalCost: cost ? parseFloat(cost) : 0
      });
      return;
    }

    if (isDetailsModified || editingDetails) {
      if (!name.trim()) { showToast('Ingredient name is required.', 'error'); return; }
      if (minError) { showToast(minError, 'error'); return; }
      if (detailsCostError) { showToast(detailsCostError, 'error'); return; }
    }

    if (stock) {
      if (addedQty <= 0) { showToast('Added quantity must be greater than 0.', 'error'); return; }
      if (qtyError) { showToast(qtyError, 'error'); return; }
      if (!cost) { showToast('Total cost is required kapag nagdadagdag ng stock.', 'error'); return; }
      if (costError) { showToast(costError, 'error'); return; }
    }

    if (!isDetailsModified && !stock) {
      showToast('Walang binago o idinagdag. I-edit ang detalye o maglagay ng dami na idadagdag.', 'error');
      return;
    }

    const detailsPayload = isDetailsModified || editingDetails
      ? { name: name.trim(), unit, minimum_stock: parseFloat(min) || 0, cost_per_unit: detailsCost ? parseFloat(detailsCost) : 0 }
      : null;
      
    // BAGONG DAGDAG SA RESTOCK PAYLOAD
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
      setExpiry(''); // Reset
      onClose(); 
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
      setConfirmPayload(null); 
    } finally {
      setIsSaving(false);
    }
  };

  const confirmTitle = confirmPayload?.isNew
    ? 'Kumpirmahin ang Bagong Ingredient'
    : confirmPayload?.detailsPayload && confirmPayload?.restockPayload
      ? 'Kumpirmahin ang Pagbabago at Restock'
      : confirmPayload?.restockPayload
        ? 'Kumpirmahin ang Restock'
        : 'Kumpirmahin ang Pag-edit';

  const confirmMessage = confirmPayload?.detailsPayload && confirmPayload?.restockPayload
    ? `I-sasave ang bagong detalye ng "${confirmPayload.itemName}" AT idadagdag ang ${confirmPayload.addedQty} ${confirmPayload.itemUnit}${confirmPayload.totalCost > 0 ? ` (₱${confirmPayload.totalCost.toFixed(2)})` : ''}. Sigurado ka na?`
    : confirmPayload?.restockPayload
      ? `Sigurado ka bang idadagdag ang ${confirmPayload?.addedQty} ${confirmPayload?.itemUnit} sa ${confirmPayload?.itemName}${confirmPayload?.totalCost > 0 ? ` na may kabuuang halaga na ₱${confirmPayload?.totalCost.toFixed(2)}` : ''}?`
      : `I-save ang bagong detalye ng "${confirmPayload?.itemName}"?`;

  return (
    <>
      <Modal
        isOpen={isOpen} 
        onClose={() => !isSaving && onClose()}
        title={isEdit ? `Manage Stock — ${ingredient?.name}` : 'Add New Raw Ingredient'}
        subtitle={isEdit ? `Unit: ${ingredient?.unit}` : 'I-record ang mga bagong biling sako o bultong sangkap.'}
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
          {isEdit && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-brand-50 border border-brand-100">
              <div className="w-9 h-9 rounded-lg bg-white border border-brand-200 flex items-center justify-center shrink-0 shadow-sm">
                <Wallet size={16} className="text-brand-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wide text-brand-400">Total Cost ng Kasalukuyang Stock</p>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input label="Ingredient Name" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wash Sugar" />
                  <div>
                    <Select label="Unit of Measurement" required value={unit} onChange={e => setUnit(e.target.value)}>
                      {STOCK_UNIT_CATEGORIES.map(cat => (
                        <optgroup key={cat.label} label={cat.label}>
                          {cat.units.map(u => <option key={u} value={u}>{u}</option>)}
                        </optgroup>
                      ))}
                    </Select>
                    {UNIT_CONVERSION_HINTS[unit] && (
                      <p className="text-[11px] text-brand-400 mt-1">{UNIT_CONVERSION_HINTS[unit]}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-brand-100" />

              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Package size={13} className="text-brand-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-400">2. Stock Levels</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Input label="Initial Stock Quantity" required type="text" inputMode="decimal" suffix={unit} value={stock} onChange={e => setStock(sanitizeQtyText(e.target.value))} onBlur={() => setStock(current => parseFractionInput(current))} placeholder="hal. 0.25 o 1/4" />
                    {qtyError && <p className="text-[11px] text-red-600 mt-1 font-medium">{qtyError}</p>}
                  </div>
                  <div>
                    <Input label="Minimum Safety Stock" required type="text" inputMode="decimal" suffix={unit} value={min} onChange={e => setMin(sanitizeNumericText(e.target.value))} placeholder="hal. 50" />
                    {minError && <p className="text-[11px] text-red-600 mt-1 font-medium">{minError}</p>}
                  </div>
                </div>
              </div>

              <div className="border-t border-brand-100" />

              <div className="space-y-3">
                <div className="flex items-center gap-1.5">
                  <Wallet size={13} className="text-brand-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-brand-400">3. Cost & Financials</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Input label="Total Halaga / Resibo" required type="text" inputMode="decimal" value={formatPesoLive(cost)} onChange={e => setCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))} placeholder="₱0.00" />
                    {costError && <p className="text-[11px] text-red-600 mt-1 font-medium">{costError}</p>}
                  </div>
                  <div>
                    {/* BAGONG DAGDAG NA EXPIRATION DATE INPUT PARA SA ADD NEW */}
                    <Input 
                      label="Expiration Date (Optional)" 
                      type="date" 
                      value={expiry} 
                      onChange={e => setExpiry(e.target.value)} 
                    />
                  </div>
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

                <div className="grid grid-cols-2 gap-2.5">
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
                      <div>
                        <Input label="Name" required value={name} onChange={e => setName(e.target.value)} />
                      </div>
                      <div>
                        <Select label="Unit" required value={unit} onChange={e => setUnit(e.target.value)}>
                          {STOCK_UNIT_CATEGORIES.map(cat => (
                            <optgroup key={cat.label} label={cat.label}>
                              {cat.units.map(u => <option key={u} value={u}>{u}</option>)}
                            </optgroup>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Input label="Min. Stock" type="text" inputMode="decimal" value={min} onChange={e => setMin(sanitizeNumericText(e.target.value))} />
                        {minError && <p className="text-[10px] text-red-600 font-medium mt-0.5">{minError}</p>}
                      </div>
                      <div>
                        <Input label="Cost/Unit (₱)" type="text" inputMode="decimal" value={formatPesoLive(detailsCost)} onChange={e => setDetailsCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))} />
                        {detailsCostError && <p className="text-[10px] text-red-600 font-medium mt-0.5">{detailsCostError}</p>}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl border border-brand-200 bg-white shadow-sm space-y-3">
                <div className="flex items-center gap-1.5 pb-2 border-b border-brand-100">
                  <RefreshCw size={13} className="text-brand-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">Restock / Add Quantity</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <Input
                      label="Dami na Idadagdag"
                      type="text" 
                      inputMode="decimal"
                      suffix={ingredient?.unit}
                      value={stock} 
                      onChange={e => setStock(sanitizeQtyText(e.target.value))}
                      onBlur={() => setStock(current => parseFractionInput(current))}
                      placeholder="hal. 0.25 o 1/4"
                    />
                    {qtyError && <p className="text-[11px] text-red-600 mt-1 font-medium">{qtyError}</p>}
                  </div>

                  <div>
                    <Input 
                      label="Total Halaga / Resibo" 
                      type="text" 
                      inputMode="decimal" 
                      value={formatPesoLive(cost)} 
                      onChange={e => setCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))} 
                      placeholder="₱0.00" 
                    />
                    {costError && <p className="text-[11px] text-red-600 mt-1 font-medium">{costError}</p>}
                  </div>

                  <div>
                    {/* BAGONG DAGDAG NA EXPIRATION DATE INPUT PARA SA RESTOCK */}
                    <Input 
                      label="Expiration Date (Optional)" 
                      type="date" 
                      value={expiry} 
                      onChange={e => setExpiry(e.target.value)} 
                    />
                  </div>
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
        confirmLabel={isSaving ? 'Sinasave...' : 'Oo, Sigurado Ako'}
        variant="primary"
      />
    </>
  );
}