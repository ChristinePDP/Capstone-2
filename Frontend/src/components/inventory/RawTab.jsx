import { useState, useRef } from 'react';
import { Plus, Search, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Table, Tr, Td, Pagination, Badge, Card, LevelBar, ConfirmModal } from '../../components/ui';
import { ingStatus } from '../../utils/inventoryHelpers';
import { sanitizeNumericText, sanitizeQtyText, parseFractionInput, formatWithCommas, formatPesoLive, parseFormattedPeso, getQtyError, getCostError, MAX_QTY } from '../../utils/numberGuards';
import { STOCK_UNIT_CATEGORIES, UNIT_CONVERSION_HINTS } from '../../utils/unitUtils';
import { RestockHistoryPanel } from './InventoryHistoryModal';

const PER_PAGE = 10;

export default function IngredientsTab() {
  const context = useApp() || {};
  const { addIngredient, updateIngredient, deleteIngredient, restockIngredient } = context;
  const ingredients = context.ingredients || [];
  const isLoading = !!context.loading;

  const { show: showToast } = useToast();
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editIng, setEditIng]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Ginagamit ang ref (bukod sa state) dahil INSTANT ito mag-update,
  // hindi tulad ng useState na naka-batch/async pa rin ang effect sa
  // parehong render tick. Kung ang ConfirmModal ay tumatawag ng
  // onConfirm() at onClose() nang magkasunod sa iisang tick, ang
  // `isDeleting` state ay HINDI pa naka-update sa oras na tawagin ang
  // onClose — kaya ang ref ang gagamitin bilang tunay na "totoong oras"
  // na proteksyon laban dito.
  const isDeletingRef = useRef(false);

  const [detailsTarget, setDetailsTarget] = useState(null); // for typo/name correction

  const filtered = ingredients.filter(ing =>
    ing.name.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleSave = async (data, addedQty = 0, note = '') => {
    if (editIng?.id) {
      if (restockIngredient) await restockIngredient(editIng.id, data);
      showToast(`+${addedQty} ${editIng.unit} na-add sa ${editIng.name}.`);
    } else {
      if (addIngredient) await addIngredient(data);
      showToast('Raw ingredient added successfully.');
    }
    void note; // reserved for future audit-note support
  };

  const handleDelete = async () => {
    // Guard: kung may ongoing delete na, huwag na ulitin (double-click / double-tap).
    if (isDeletingRef.current || !deleteTarget) return;
    isDeletingRef.current = true; // instant, hindi naka-batch — dito nagaganap ang tunay na proteksyon
    setIsDeleting(true);
    try {
      if (deleteIngredient) await deleteIngredient(deleteTarget.id);
      showToast(`${deleteTarget.name} removed from ingredients.`, 'warning');
      setDeleteTarget(null);
    } catch (err) {
      showToast(err.message || 'Failed to delete ingredient', 'error');
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
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

        {/* Search Bar */}
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

        {/* Responsive Container */}
        <div className="px-4 pb-4 mt-4">
          {/* LOADING STATE — habang kinukuha pa ang data mula sa backend.
              Dati, wala nito, kaya kahit habang naglo-load pa, agad nang
              lumalabas ang "Walang naka-record" — mali dahil parang
              sinasabing walang laman, kahit hindi pa talaga tapos ang
              fetch. */}
          {isLoading && (
            <div className="text-center py-10 text-brand-400 font-medium bg-white border border-dashed border-brand-200 rounded-xl animate-pulse">
              Naglo-load ng raw materials...
            </div>
          )}

          {!isLoading && (
            <>
              {/* Mobile Cards View */}
              <div className="block md:hidden space-y-3">
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
                        <Button size="sm" variant="ghost" onClick={() => setDetailsTarget(ing)}><Pencil size={13} /> Edit</Button>
                        <Button size="sm" variant="secondary" onClick={() => { setEditIng(ing); setModalOpen(true); }}>Restock</Button>
                        <Button size="sm" variant="danger" onClick={() => setDeleteTarget(ing)}>Delete</Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block">
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
                            <Button size="sm" variant="ghost" title="Ayusin ang pangalan/unit" onClick={() => setDetailsTarget(ing)}><Pencil size={14} /></Button>
                            <Button size="sm" variant="secondary" onClick={() => { setEditIng(ing); setModalOpen(true); }}>Restock</Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteTarget(ing)}>Delete</Button>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </Table>
              </div>

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
        key={editIng?.id ?? 'new'}   // remount kada bagong item / bagong "add" — dito nagre-reset ang state
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        ingredient={editIng}
        onSave={handleSave}
      />

      <EditDetailsModal
        key={detailsTarget?.id ?? 'none'}  // remount din dito para automatic mag-reset
        isOpen={!!detailsTarget}
        onClose={() => setDetailsTarget(null)}
        item={detailsTarget}
        onSave={async (payload) => {
          if (updateIngredient) await updateIngredient(detailsTarget.id, payload);
          showToast('Naitama ang detalye ng ingredient.');
        }}
      />

      <ConfirmModal
        isOpen={!!deleteTarget} onClose={() => !isDeletingRef.current && setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Ingredient" message={`I-delete ang "${deleteTarget?.name}" sa listahan?`}
        confirmLabel={isDeleting ? 'Dinedelete...' : 'Delete'} variant="danger"
      />
    </div>
  );
}

function IngredientModal({ isOpen, onClose, ingredient, onSave }) {
  const { show: showToast } = useToast();
  
  const [name, setName]   = useState(ingredient?.name ?? '');
  const [unit, setUnit]   = useState(ingredient?.unit ?? 'kg');
  const [stock, setStock] = useState('');
  const [min, setMin]     = useState(ingredient?.min ?? '');
  const [cost, setCost]   = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState(null); // BAGONG STATE PARA SA CONFIRMATION

  const isEdit = !!ingredient?.id;

  const finalizedStock = parseFractionInput(stock);
  const addedQty = parseFloat(finalizedStock) || 0;
  const qtyError = getQtyError(finalizedStock, { max: MAX_QTY, label: isEdit ? 'Dami na idadagdag' : 'Stock quantity' });
  const minError = getQtyError(min, { max: MAX_QTY, label: 'Minimum safety stock' });
  const costError = getCostError(cost);

  // STEP 1: Validation lang muna, hindi pa magse-save
  const handleValidate = () => {
    if (isSaving) return;

    if (!isEdit) {
      if (!name.trim()) { showToast('Ingredient name is required.', 'error'); return; }
      if (!stock) { showToast('Stock quantity is required.', 'error'); return; }
      if (parseFloat(finalizedStock) < 0) { showToast('Stock quantity cannot be negative.', 'error'); return; }
    } else {
      if (!stock) { showToast('Added quantity is required.', 'error'); return; }
      if (addedQty <= 0) { showToast('Added quantity must be greater than 0.', 'error'); return; }
    }
    // Ang "Minimum Safety Stock" ay hindi na dapat i-validate/i-send dito
    // kapag Restock (isEdit) — ang field na ito ay tanggal na sa Restock
    // modal, doon na lang dapat sa "Ayusin ang Detalye" babaguhin ito.
    if (!isEdit) {
      if (!min) { showToast('Minimum safety stock is required.', 'error'); return; }
      if (minError) { showToast(minError, 'error'); return; }
    }

    if (qtyError) { showToast(qtyError, 'error'); return; }
    if (costError) { showToast(costError, 'error'); return; }

    const newStock = isEdit ? +(ingredient.stock + addedQty).toFixed(4) : addedQty;
    const dataToSave = isEdit
      ? { added_qty: addedQty, total_cost: cost ? parseFloat(cost) : 0 }
      : { name: name.trim(), unit, stock_quantity: newStock, minimum_stock: parseFloat(min), cost_per_unit: cost ? parseFloat(cost) / addedQty : 0, category: 'Raw Material' };

    // STEP 2: Ilabas ang Confirm Modal imbes na i-save agad
    setConfirmPayload({
      dataToSave,
      addedQty,
      note: isEdit ? 'Restocked item' : 'Initial stock entry',
      itemName: isEdit ? ingredient.name : name.trim(),
      itemUnit: isEdit ? ingredient.unit : unit,
      totalCost: cost ? parseFloat(cost) : 0
    });
  };

  // STEP 3: Ito ang totoong magse-save kapag nag-click ng "Oo, Sigurado Ako"
  const executeSave = async () => {
    if (!confirmPayload) return;
    setIsSaving(true);
    try {
      await onSave(confirmPayload.dataToSave, confirmPayload.addedQty, confirmPayload.note);
      setConfirmPayload(null);
      onClose(); 
    } catch (err) {
      showToast(err.message || 'Failed to save ingredient', 'error');
      setConfirmPayload(null); // I-close ang confirmation kung nagka-error
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen} onClose={() => !isSaving && onClose()}
        title={isEdit ? `Restock — ${ingredient?.name}` : 'Add New Raw Ingredient'}
        subtitle={isEdit ? `Unit: ${ingredient?.unit} · Kasalukuyang Stock: ${ingredient?.stock}` : 'I-record ang mga bagong biling sako o bultong sangkap.'}
        size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" disabled={isSaving} onClick={onClose}>Kanselahin</Button>
            <Button variant="primary" disabled={isSaving} onClick={handleValidate}>
              {isEdit ? 'Update Stock' : 'Save Ingredient'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Ingredient Name" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wash Sugar" />
              <div>
                <Select label="Unit" required value={unit} onChange={e => setUnit(e.target.value)}>
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
          )}
          
          {isEdit && (
            <div className="grid grid-cols-2 gap-3">
               <div className="flex flex-col gap-1">
                 <span className="text-[11px] font-bold uppercase text-brand-400">Ingredient Name</span>
                 <div className="px-3 py-2 bg-brand-50 border rounded-lg text-sm font-bold text-brand-800">{ingredient?.name}</div>
               </div>
               <div className="flex flex-col gap-1">
                 <span className="text-[11px] font-bold uppercase text-brand-400">Unit</span>
                 <div className="px-3 py-2 bg-brand-50 border rounded-lg text-sm font-bold text-brand-800">{ingredient?.unit}</div>
               </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                label={isEdit ? `Dami na Idadagdag` : 'Initial Stock Quantity'}
                required type="text" inputMode="decimal"
                value={stock}
                onChange={e => setStock(sanitizeQtyText(e.target.value))}
                onBlur={() => setStock(current => parseFractionInput(current))}
                placeholder="hal. 0.25 o 1/4" min="0"
              />
              {qtyError && <p className="text-[11px] text-red-600 mt-1 font-medium">{qtyError}</p>}
            </div>
            {!isEdit && (
              <div>
                <Input
                  label="Minimum Safety Stock"
                  required type="text" inputMode="decimal"
                  value={min} onChange={e => setMin(sanitizeNumericText(e.target.value))} min="0"
                />
                {minError && <p className="text-[11px] text-red-600 mt-1 font-medium">{minError}</p>}
              </div>
            )}
            {isEdit && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase text-brand-400">Minimum Safety Stock</span>
                <div className="px-3 py-2 bg-brand-50 border rounded-lg text-sm font-bold text-brand-800">{ingredient?.min} {ingredient?.unit}</div>
                <span className="text-[10px] text-brand-400">I-edit ito sa "Ayusin ang Detalye" (✎), hindi dito sa Restock.</span>
              </div>
            )}
            <div className="col-span-2">
              <Input
                label="Total Halaga / Resibo"
                type="text" inputMode="decimal"
                value={formatPesoLive(cost)}
                onChange={e => setCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))}
                placeholder="₱0.00" min="0"
              />
              {costError && <p className="text-[11px] text-red-600 mt-1 font-medium">{costError}</p>}
            </div>
          </div>

          {isEdit && <RestockHistoryPanel itemName={ingredient?.name} />}
        </div>
      </Modal>

      {/* ANG BAGONG "MATANDA-FRIENDLY" CONFIRMATION */}
      <ConfirmModal
        isOpen={!!confirmPayload}
        onClose={() => !isSaving && setConfirmPayload(null)}
        onConfirm={executeSave}
        title="Kumpirmahin ang Restock"
        message={`Sigurado ka bang idadagdag ang ${confirmPayload?.addedQty} ${confirmPayload?.itemUnit} sa ${confirmPayload?.itemName}${confirmPayload?.totalCost > 0 ? ` na may kabuuang halaga na ₱${confirmPayload?.totalCost.toFixed(2)}` : ''}?`}
        confirmLabel={isSaving ? 'Sinasave...' : 'Oo, Sigurado Ako'}
        variant="primary"
      />
    </>
  );
}

// ─── EDIT DETAILS MODAL ───────────────────────────────────────
// Para maitama kapag may typo sa pangalan/unit/minimum stock ng
// isang ingredient. Hindi ito nagdadagdag ng stock — pang-correction
// lang. Gumagamit ng PUT /ingredients/:id (updateIngredient).
function EditDetailsModal({ isOpen, onClose, item, onSave }) {
  const { show: showToast } = useToast();
  // Walang useEffect dito — naga-reset na ang state via `key` sa parent (remount)
  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'kg');
  const [min, setMin] = useState(String(item?.min ?? ''));
  const [cost, setCost] = useState(String(item?.costPerUnit ?? ''));
  const [isSaving, setIsSaving] = useState(false);

  const minError = getQtyError(min, { max: MAX_QTY, label: 'Minimum safety stock' });
  const costError = getCostError(cost);

  const handleSave = async () => {
    if (isSaving) return;
    if (!name.trim()) { showToast('Ingredient name is required.', 'error'); return; }
    if (minError) { showToast(minError, 'error'); return; }
    if (costError) { showToast(costError, 'error'); return; }

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        unit,
        minimum_stock: parseFloat(min) || 0,
        cost_per_unit: cost ? parseFloat(cost) : 0,
      });
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to update ingredient', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!item) return null;

  return (
    <Modal
      isOpen={isOpen} onClose={() => !isSaving && onClose()}
      title={`Ayusin ang Detalye — ${item?.name}`}
      subtitle="Para sa pagtatama ng maling type sa pangalan, unit, o minimum stock. Hindi ito nagdadagdag ng stock."
      size="md"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" disabled={isSaving} onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={isSaving} onClick={handleSave}>
            {isSaving ? 'Sinasave...' : 'I-save ang Ayos'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Ingredient Name" required value={name} onChange={e => setName(e.target.value)} />
          <Select label="Unit" required value={unit} onChange={e => setUnit(e.target.value)}>
            {STOCK_UNIT_CATEGORIES.map(cat => (
              <optgroup key={cat.label} label={cat.label}>
                {cat.units.map(u => <option key={u} value={u}>{u}</option>)}
              </optgroup>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Input label="Minimum Safety Stock" type="text" inputMode="decimal" value={min} onChange={e => setMin(sanitizeNumericText(e.target.value))} />
            {minError && <p className="text-[11px] text-red-600 mt-1 font-medium">{minError}</p>}
          </div>
          <div>
            <Input
              label="Cost per Unit"
              type="text" inputMode="decimal"
              value={formatPesoLive(cost)}
              onChange={e => setCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))}
              placeholder="₱0.00"
            />
            {costError && <p className="text-[11px] text-red-600 mt-1 font-medium">{costError}</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}