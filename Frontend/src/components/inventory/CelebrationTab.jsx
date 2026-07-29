import { useState, useRef } from 'react';
import { Plus, Search, Pencil } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Table, Tr, Td, Pagination, Badge, Card, LevelBar, ConfirmModal } from '../../components/ui';
import { ingStatus } from '../../utils/inventoryHelpers';
import { sanitizeNumericText, sanitizeQtyText, parseFractionInput, formatWithCommas, formatPesoLive, parseFormattedPeso, getQtyError, getCostError, MAX_QTY } from '../../utils/numberGuards';
import { STOCK_UNIT_CATEGORIES, UNIT_CONVERSION_HINTS } from '../../utils/unitUtils';
import { RestockHistoryPanel } from './InventoryHistoryModal';

const PER_PAGE = 10;

export default function CelebrationTab() {
  const context = useApp() || {};
  const { addMaterial, updateMaterial, deleteMaterial, restockMaterial } = context;
  const materials = context.materials || [];
  const isLoading = !!context.loading;

  const { show: showToast } = useToast();
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editMat, setEditMat]       = useState(null);
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

  const [detailsTarget, setDetailsTarget] = useState(null); // typo/name correction

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleSave = async (data, addedQty = 0, note = '') => {
    if (editMat?.id) {
      await restockMaterial(editMat.id, data);
      showToast(`+${addedQty} ${editMat.unit} na-add sa ${editMat.name}.`);
    } else {
      await addMaterial(data);
      showToast('Celebration material added.');
    }
    void note;
  };

  const handleDelete = async () => {
    // Guard: kung may ongoing delete na, huwag na ulitin (double-click / double-tap).
    if (isDeletingRef.current || !deleteTarget) return;
    isDeletingRef.current = true; // instant, hindi naka-batch — dito nagaganap ang tunay na proteksyon
    setIsDeleting(true);
    try {
      if (deleteMaterial) await deleteMaterial(deleteTarget.id);
      showToast(`${deleteTarget.name} deleted.`, 'warning');
    } catch (err) {
      showToast(err.message || 'Failed to delete material', 'error');
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
            <h3 className=" font-bold text-brand-800">Celebration Materials</h3>
            <p className="text-xs text-brand-400 mt-0.5">Mag-manage ng Printed Balloons, Tarpaulin, at iba pang party add-ons.</p>
          </div>
          <Button variant="dark" onClick={() => { setEditMat(null); setModalOpen(true); }} className="w-full sm:w-auto justify-center">
            <Plus size={14} /> Add New Material
          </Button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/40">
          <div className="relative max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search material..."
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none focus:border-brand-400 bg-white"
            />
          </div>
        </div>

        {/* ─── RESPONSIVE CONTAINER ─── */}
        <div className="px-4 pb-4 mt-4">
          {/* LOADING STATE — habang kinukuha pa ang data mula sa backend.
              Para hindi agad lumabas ang "Walang naka-record" kahit hindi
              pa talaga tapos ang fetch. */}
          {isLoading && (
            <div className="text-center py-10 text-brand-400 font-medium bg-white border border-dashed border-brand-200 rounded-xl animate-pulse">
              Naglo-load ng celebration materials...
            </div>
          )}

          {!isLoading && (
            <>
              {/* MOBILE CARDS VIEW */}
              <div className="block md:hidden space-y-3">
                {paged.map(mat => {
                  const st = ingStatus(mat.stock, mat.min);
                  return (
                    <div key={mat.id} className="p-4 bg-white border border-brand-100 rounded-xl shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-bold text-brand-800 text-sm">{mat.name}</h4>
                          <p className="text-xs text-brand-500 mt-0.5">
                            Stock: <span className="font-bold text-brand-700">{mat.stock} {mat.unit}</span>
                          </p>
                        </div>
                        <Badge variant={st.cls}>{st.label}</Badge>
                      </div>
                      <div className="my-3">
                        <LevelBar stock={mat.stock} min={mat.min} />
                      </div>
                      <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-brand-50">
                        <Button size="sm" variant="ghost" onClick={() => setDetailsTarget(mat)}><Pencil size={13} /> Edit</Button>
                        <Button size="sm" variant="secondary" onClick={() => { setEditMat(mat); setModalOpen(true); }}>Add Stock</Button>
                        <Button size="sm" variant="danger" onClick={() => setDeleteTarget(mat)}>Delete</Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP TABLE VIEW */}
              <div className="hidden md:block">
                <Table columns={[
                  { label: 'Item Name' },
                  { label: 'Current Stock' },
                  { label: 'Stock Level' },
                  { label: 'Status' },
                  { label: 'Actions', align: 'right' },
                ]}>
                  {paged.map(mat => {
                    const st = ingStatus(mat.stock, mat.min);
                    return (
                      <Tr key={mat.id}>
                        <Td><strong>{mat.name}</strong></Td>
                        <Td><strong>{mat.stock}</strong> {mat.unit}</Td>
                        <Td><LevelBar stock={mat.stock} min={mat.min} /></Td>
                        <Td><Badge variant={st.cls}>{st.label}</Badge></Td>
                        <Td align="right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="ghost" title="Ayusin ang pangalan/unit" onClick={() => setDetailsTarget(mat)}><Pencil size={14} /></Button>
                            <Button size="sm" variant="secondary" onClick={() => { setEditMat(mat); setModalOpen(true); }}>Add Stock</Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteTarget(mat)}>Delete</Button>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </Table>
              </div>

              {!paged.length && (
                <div className="text-center py-10 text-brand-400 font-medium bg-white border border-dashed border-brand-200 rounded-xl">
                  {search ? 'Walang nahanap na material.' : 'Walang naka-record na celebration materials.'}
                </div>
              )}
            </>
          )}
        </div>

        {filtered.length > PER_PAGE && (
           <div className="p-3 border-t border-brand-100">
             <Pagination page={page} count={filtered.length} perPage={PER_PAGE} total="materials" onChange={setPage} />
           </div>
        )}
      </Card>

      <MaterialModal
        key={editMat?.id ?? 'new'}   // remount kada bagong item / bagong "add" — dito nagre-reset ang state
        isOpen={modalOpen}
        material={editMat}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />

      <EditDetailsModal
        key={detailsTarget?.id ?? 'none'}  // remount din dito para automatic mag-reset
        isOpen={!!detailsTarget}
        onClose={() => setDetailsTarget(null)}
        item={detailsTarget}
        onSave={async (payload) => {
          if (updateMaterial) await updateMaterial(detailsTarget.id, payload);
          showToast('Naitama ang detalye ng material.');
        }}
      />

      <ConfirmModal
        isOpen={!!deleteTarget} onClose={() => !isDeletingRef.current && setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Material" message={`I-delete ang "${deleteTarget?.name}"?`}
        confirmLabel={isDeleting ? 'Dinedelete...' : 'Delete'} variant="danger"
      />
    </div>
  );
}

function MaterialModal({ isOpen, onClose, material, onSave }) {
  const { show: showToast } = useToast();
  
  const [name, setName] = useState(material?.name ?? '');
  const [unit, setUnit] = useState(material?.unit ?? 'pcs');
  const [stock, setStock] = useState('');
  const [min, setMin] = useState(material?.min ?? '');
  const [cost, setCost] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState(null);

  const isEdit = !!material?.id;

  const finalizedStock = parseFractionInput(stock);
  const addedQty = parseFloat(finalizedStock) || 0;
  const qtyError = getQtyError(finalizedStock, { max: MAX_QTY, label: isEdit ? 'Dami na idadagdag' : 'Initial stock' });
  const minError = getQtyError(min, { max: MAX_QTY, label: 'Minimum safety stock' });
  const costError = getCostError(cost);

  const handleValidate = () => {
    if (isSaving) return;

    if (!isEdit) {
      if (!name.trim()) { showToast('Material name is required.', 'error'); return; }
      if (!stock) { showToast('Initial stock is required.', 'error'); return; }
      if (parseFloat(finalizedStock) < 0) { showToast('Stock quantity cannot be negative.', 'error'); return; }
    } else {
      if (!stock) { showToast('Added quantity is required.', 'error'); return; }
      if (addedQty <= 0) { showToast('Added quantity must be greater than 0.', 'error'); return; }
    }

    // Ang "Minimum Stock Level" ay hindi na dapat i-validate/i-send dito
    // kapag Restock/Add Stock (isEdit) — tanggal na ang field na ito sa
    // Restock modal, doon na lang dapat sa "Ayusin ang Detalye" babaguhin.
    if (!isEdit) {
      if (!min) { showToast('Minimum safety stock is required.', 'error'); return; }
      if (minError) { showToast(minError, 'error'); return; }
    }
    if (qtyError) { showToast(qtyError, 'error'); return; }
    if (costError) { showToast(costError, 'error'); return; }

    const newStock = isEdit ? +(material.stock + addedQty).toFixed(4) : addedQty;
    const dataToSave = isEdit
      ? { added_qty: addedQty, total_cost: cost ? parseFloat(cost) : 0 }
      : { name: name.trim(), unit, stock_quantity: newStock, minimum_stock: parseFloat(min), cost_per_unit: cost ? parseFloat(cost) / addedQty : 0, category: 'Celebration Material' };

    setConfirmPayload({
      dataToSave,
      addedQty,
      note: isEdit ? 'Stock added' : 'Initial stock',
      itemName: isEdit ? material.name : name.trim(),
      itemUnit: isEdit ? material.unit : unit,
      totalCost: cost ? parseFloat(cost) : 0
    });
  };

  const executeSave = async () => {
    if (!confirmPayload) return;
    setIsSaving(true);
    try {
      await onSave(confirmPayload.dataToSave, confirmPayload.addedQty, confirmPayload.note);
      setConfirmPayload(null);
      onClose(); 
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
      setConfirmPayload(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={() => !isSaving && onClose()} title={isEdit ? `Add Stock — ${material?.name}` : 'Add New Celebration Material'} size="md"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" disabled={isSaving} onClick={onClose}>Kanselahin</Button>
            <Button variant="primary" disabled={isSaving} onClick={handleValidate}>
              {isEdit ? 'Add Stock' : 'Save Material'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <Input label="Item Name" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tarpaulin (2x3 ft)" />
              <div>
                <Select label="Unit" required value={unit} onChange={e => setUnit(e.target.value)}>
                  {STOCK_UNIT_CATEGORIES.map(cat => (
                    <optgroup key={cat.label} label={cat.label}>
                      {cat.units.map(u => <option key={u} value={u}>{u}</option>)}
                    </optgroup>
                  ))}
                </Select>
              </div>
            </div>
          )}
          
          {isEdit && (
            <div className="grid grid-cols-2 gap-3">
               <div className="flex flex-col gap-1">
                 <span className="text-[11px] font-bold uppercase text-brand-400">Item Name</span>
                 <div className="px-3 py-2 bg-brand-50 border rounded-lg text-sm font-bold text-brand-800">{material?.name}</div>
               </div>
               <div className="flex flex-col gap-1">
                 <span className="text-[11px] font-bold uppercase text-brand-400">Unit</span>
                 <div className="px-3 py-2 bg-brand-50 border rounded-lg text-sm font-bold text-brand-800">{material?.unit}</div>
               </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                label={isEdit ? `Quantity na Idadagdag` : 'Initial Stock Quantity'}
                required type="text" inputMode="decimal"
                value={stock} onChange={e => setStock(sanitizeQtyText(e.target.value))}
                onBlur={() => setStock(current => parseFractionInput(current))}
                placeholder="hal. 0.5 o 1/2" min="0"
              />
              {qtyError && <p className="text-[11px] text-red-600 mt-1 font-medium">{qtyError}</p>}
            </div>
            {!isEdit && (
              <div>
                <Input label="Minimum Stock Level" required type="text" inputMode="decimal" value={min} onChange={e => setMin(sanitizeNumericText(e.target.value))} min="0" />
                {minError && <p className="text-[11px] text-red-600 mt-1 font-medium">{minError}</p>}
              </div>
            )}
            {isEdit && (
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-bold uppercase text-brand-400">Minimum Stock Level</span>
                <div className="px-3 py-2 bg-brand-50 border rounded-lg text-sm font-bold text-brand-800">{material?.min} {material?.unit}</div>
                <span className="text-[10px] text-brand-400">I-edit ito sa "Ayusin ang Detalye" (✎), hindi dito sa Restock.</span>
              </div>
            )}
            <div className="col-span-2">
              <Input label="Total Cost" type="text" inputMode="decimal" value={formatPesoLive(cost)} onChange={e => setCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))} placeholder="₱0.00" min="0" />
              {costError && <p className="text-[11px] text-red-600 mt-1 font-medium">{costError}</p>}
            </div>
          </div>

          {isEdit && <RestockHistoryPanel itemName={material?.name} />}
        </div>
      </Modal>

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
// isang material. Hindi ito nagdadagdag ng stock — pang-correction
// lang. Gumagamit ng PUT /materials/:id (updateMaterial).
function EditDetailsModal({ isOpen, onClose, item, onSave }) {
  const { show: showToast } = useToast();
  // Walang useEffect dito — naga-reset na ang state via `key` sa parent (remount)
  const [name, setName] = useState(item?.name ?? '');
  const [unit, setUnit] = useState(item?.unit ?? 'pcs');
  const [min, setMin] = useState(String(item?.min ?? ''));
  const [cost, setCost] = useState(String(item?.costPerUnit ?? ''));
  const [isSaving, setIsSaving] = useState(false);

  const minError = getQtyError(min, { max: MAX_QTY, label: 'Minimum safety stock' });
  const costError = getCostError(cost);

  const handleSave = async () => {
    if (isSaving) return;
    if (!name.trim()) { showToast('Material name is required.', 'error'); return; }
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
      showToast(err.message || 'Failed to update material', 'error');
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
          <Input label="Item Name" required value={name} onChange={e => setName(e.target.value)} />
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
            <Input label="Minimum Stock Level" type="text" inputMode="decimal" value={min} onChange={e => setMin(sanitizeNumericText(e.target.value))} />
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