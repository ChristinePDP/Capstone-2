import { useState, useMemo, useRef } from 'react';
import { AlertTriangle, Search, Filter, Plus, RotateCcw, ListChecks, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Textarea, Table, Tr, Td, Pagination, Badge, Card, ConfirmModal } from '../../components/ui';
import { sanitizeNumericText, getQtyError, MAX_QTY } from '../../utils/numberGuards';

const PER_PAGE = 10;

const REASONS = {
  ingredient: ['Spoiled', 'Expiring Soon', 'Spilled/Wasted', 'Pest Damage', 'Other'],
  product: ['Unsold', 'Damaged', 'Expired', 'Quality Defect', 'Other'],
  material: ['Popped/Butas', 'Damaged', 'Misprinted', 'Lost', 'Other']
};

// HELPER: Para maging local at malinis ang format ng petsa
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

  const { show: showToast } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterDate, setFilterDate] = useState('All');

  // Void (cancel/reverse a mistaken log) — hindi totoong delete, may
  // audit trail pa rin. Bulk-select pattern ito: mag-check ka ng mga
  // row, tapos isang "Void Selected" button lang sa itaas ng table —
  // hindi na paulit-ulit na button sa bawat gilid ng row (redundant).
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showBulkVoidConfirm, setShowBulkVoidConfirm] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);
  const isVoidingRef = useRef(false);

  // Progressive disclosure: hindi laging nakikita ang checkboxes.
  // Kailangan mo munang pindutin ang "Select to Void" bago lumabas ang
  // mga checkbox — malinaw na "pinto" papasok sa void mode, hindi basta
  // nakalatag na parang default na bahagi ng table.
  const [selectionMode, setSelectionMode] = useState(false);

  const enterSelectionMode = () => setSelectionMode(true);
  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  // Modal forms management
  const [modalOpen, setModalOpen] = useState(false);
  const [logType, setLogType] = useState('ingredient');

  // Form Fields
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

  const handleOpenLogModal = (type) => {
    setLogType(type);
    setReason(REASONS[type][0]);
    setNotes('');
    setIngName(''); setIngQty(''); setIngUnit('kg');
    setProductName(''); setProductQty(''); setProductUnit('pcs');
    setMatName(''); setMatQty(''); setMatUnit('pcs');
    setIsSaving(false);
    setModalOpen(true);
  };

  const handleLog = async () => {
    // Guard: hindi papayagan ang double-submit habang naka-save pa
    // (nag-iiwas sa dobleng bawas ng stock kapag pinindot ng dalawang beses).
    if (isSaving) return;

    // FIX: required-field validation now runs BEFORE the stock-sufficiency
    // check (per logType). Previously the stock check ran first and, when
    // no item was selected, `selectedItemStock` defaulted to 0 — so any
    // positive qty always tripped "Not enough stock!" instead of the
    // intended "Please fill in..." missing-field message.
    let finalItem = '';
    let rawQty = 0;
    let computedCost = 0;
    let finalUnit = '';
    let selectedItemStock = 0;

    if (logType === 'ingredient') {
      if (!ingName || !ingQty) {
        showToast('Please fill in the ingredient name and quantity.', 'error');
        return;
      }
      const match = ingredients.find(i => i.name === ingName);
      selectedItemStock = match ? match.stock : 0;
      finalItem = ingName;
      rawQty = parseFloat(ingQty);
      finalUnit = match?.unit || ingUnit;
      computedCost = (match?.costPerUnit || 0) * rawQty;
    } else if (logType === 'product') {
      if (!productName || !productQty) {
        showToast('Please select the product and quantity.', 'error');
        return;
      }
      const match = products.find(p => p.name === productName);
      selectedItemStock = match ? match.stock : 0;
      finalItem = productName;
      rawQty = parseInt(productQty, 10);
      finalUnit = productUnit;
      const matchCost = match?.estimatedCost || 45;
      computedCost = matchCost * rawQty;
    } else if (logType === 'material') {
      if (!matName || !matQty) {
        showToast('Please select the material and quantity.', 'error');
        return;
      }
      const match = materials.find(m => m.name === matName);
      selectedItemStock = match ? match.stock : 0;
      finalItem = matName;
      rawQty = parseFloat(matQty);
      finalUnit = match?.unit || matUnit;
      computedCost = (match?.costPerUnit || 0) * rawQty;
    }

    if (rawQty > selectedItemStock) {
      showToast(`Not enough stock! Only ${selectedItemStock} left for this item.`, 'error');
      return;
    }

    // Overflow / typo guard — kahit sapat sa stock, i-double check pa rin
    // kung baka may extra zero na naidagdag nang hindi sinasadya.
    const qtyOverflowError = getQtyError(rawQty, { max: MAX_QTY, label: 'Quantity' });
    if (qtyOverflowError) {
      showToast(qtyOverflowError, 'error');
      return;
    }

    const backendPayload = {
      waste_type: logType,
      item_name: finalItem,
      quantity: rawQty,
      unit: finalUnit ? String(finalUnit) : (logType === 'ingredient' ? 'kg' : 'pcs'),
      cost: computedCost,
      reason: reason,
      notes: notes.trim()
    };

    setIsSaving(true);
    try {
      if (logWaste) {
        await logWaste(backendPayload);
        showToast('Waste record logged successfully.', 'success');
      }
      setModalOpen(false);
    } catch (err) {
      showToast(err.message || 'Something went wrong while saving.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

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
    isVoidingRef.current = true; // instant, hindi naka-batch — protection vs. premature modal close
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
        {/* HEADER SECTION - Same structure as RecipeTab */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-brand-100 gap-3">
          <div>
            <h3 className="font-bold text-brand-800 flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-500" />
              Waste Log
            </h3>
            <p className="text-xs text-brand-400 mt-0.5">Log spoiled, expired, or unsold items to deduct them from current stock.</p>
          </div>


          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleOpenLogModal('ingredient')}
              className="w-full sm:w-auto justify-center text-xs"
            >
              <Plus size={13} className="mr-1" /> Spoiled Ingredient
            </Button>
            <Button
              variant="dark"
              size="sm"
              onClick={() => handleOpenLogModal('product')}
              className="w-full sm:w-auto justify-center text-xs"
            >
              <Plus size={13} className="mr-1" /> Unsold Product
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenLogModal('material')}
              className="w-full sm:w-auto justify-center text-xs"
            >
              <Plus size={13} className="mr-1" /> Damaged Material
            </Button>
            {!selectionMode && (
              <Button
                variant="ghost"
                size="sm"
                onClick={enterSelectionMode}
                className="w-full sm:w-auto justify-center text-xs border border-brand-200"
              >
                <ListChecks size={13} className="mr-1" /> Select to Void
              </Button>
            )}
          </div>
        </div>

        {/* SEARCH & FILTER SECTION */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-b border-brand-100 bg-brand-50/40 min-w-0">
          <div className="relative w-full sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
            <input 
              type="text" 
              placeholder="Search waste log..." 
              value={search} 
              onChange={e => { setSearch(e.target.value); setPage(1); }} 
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none focus:border-brand-400 bg-white" 
            />
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={14} className="text-brand-400 shrink-0" />
            <select className="flex-1 sm:flex-none text-xs border border-brand-200 rounded-lg px-2 py-1.5 bg-white font-medium text-brand-700 outline-none focus:border-brand-400" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
              <option value="All">All Categories</option>
              <option value="ingredient">Raw Ingredient</option>
              <option value="product">Finished Product</option>
              <option value="material">Celebration Material</option>
            </select>
            <select className="flex-1 sm:flex-none text-xs border border-brand-200 rounded-lg px-2 py-1.5 bg-white font-medium text-brand-700 outline-none focus:border-brand-400" value={filterDate} onChange={e => { setFilterDate(e.target.value); setPage(1); }}>
              <option value="All">All Time</option>
              <option value="Today">Today</option>
              <option value="This Week">This Week</option>
              <option value="This Month">This Month</option>
            </select>
          </div>
          
          {/* TOTAL LOSS STAT */}
           <div className="sm:ml-auto flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-white px-3 py-1.5 rounded-lg border border-brand-100 shadow-sm w-full sm:w-auto min-w-0">
             <span className="text-[11px] font-bold text-brand-400 uppercase tracking-wider leading-tight">Estimated Loss:</span>
             <span className="text-[15px] font-black text-red-600 whitespace-nowrap leading-tight sm:ml-auto">₱{totalCostFiltered.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* SELECTION MODE BANNER — lumalabas lang kapag pumasok sa void
            mode via "Select to Void" button. Malinaw na nagsasabi kung
            anong nangyayari, at may "Cancel" para makalabas anumang oras
            kahit wala pang na-che-check. */}
        {selectionMode && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 border-b border-amber-200">
            <span className="text-xs font-bold text-amber-800">
              {selectedIds.size > 0
                ? `${selectedIds.size} record${selectedIds.size > 1 ? 's' : ''} selected — tap a row's checkbox to void`
                : 'Selecting records to void — tap the checkboxes on the rows you want to void'}
            </span>
            <div className="flex gap-2 shrink-0">
              {selectedIds.size > 0 && (
                <Button size="sm" variant="danger" onClick={() => setShowBulkVoidConfirm(true)}>
                  <RotateCcw size={13} className="mr-1" /> Void Selected
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={exitSelectionMode}>
                <X size={13} className="mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ─── RESPONSIVE SPLIT VIEWS ─── */}
        <div className="px-4 pb-4 mt-4">
          
          {/* 📱 MOBILE CARD LAYOUT */}
          <div className="block md:hidden space-y-4">
            {pagedLogs.map(log => (
              <div key={log.id} className={`w-full min-w-0 p-4 bg-white border rounded-xl shadow-sm flex flex-col gap-3 ${selectionMode && selectedIds.has(log.id) ? 'border-amber-400 ring-1 ring-amber-300' : 'border-brand-100'}`}>
                <div className="flex items-start gap-3">
                  {selectionMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(log.id)}
                      onChange={() => toggleSelect(log.id)}
                      className="mt-1 shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0 flex flex-col gap-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2 min-w-0">
                      <div className="min-w-0 flex-1 w-full">
                        <h4 className="w-full font-bold text-brand-900 text-sm leading-tight break-all">{log.item}</h4>
                        <p className="text-[11px] text-brand-400 mt-1">{formatLocal(log.dt)}</p>
                      </div>
                      <Badge variant={log.type === 'product' ? 'warning' : 'default'} className="shrink-0 self-start text-[10px]">
                        {log.type}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-brand-50 p-2.5 rounded-lg border border-brand-100/50 min-w-0">
                      <div>
                        <span className="text-brand-400 block mb-0.5 font-medium">Qty:</span>
                        <span className="font-bold text-brand-700">{log.qty}</span>
                      </div>
                      <div>
                        <span className="text-brand-400 block mb-0.5 font-medium">Loss:</span>
                        <span className="font-bold text-red-600">₱{log.cost?.toFixed(2)}</span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <span className="inline-block max-w-full break-words text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded font-bold mb-1 border border-red-100">
                        {log.reason}
                      </span>
                      <p className="text-[11px] text-brand-500 line-clamp-2 leading-snug break-words">
                        <span className="font-semibold text-brand-600">Notes:</span> {log.notes || '—'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 💻 DESKTOP TABLE LAYOUT */}
          <div className="hidden md:block overflow-x-auto">
            <Table columns={[
              ...(selectionMode ? [{
                label: (
                  <input
                    type="checkbox"
                    checked={allPagedSelected}
                    onChange={toggleSelectAllOnPage}
                    title="Select all on this page"
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
              {pagedLogs.map(log => (
                <Tr key={log.id} className={selectionMode && selectedIds.has(log.id) ? 'bg-amber-50' : ''}>
                  {selectionMode && (
                    <Td>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(log.id)}
                        onChange={() => toggleSelect(log.id)}
                      />
                    </Td>
                  )}
                  <Td className="text-xs text-brand-500 font-medium whitespace-nowrap">{formatLocal(log.dt)}</Td>
                  <Td>
                    <Badge variant={log.type === 'product' ? 'warning' : 'default'}>
                      {log.type}
                    </Badge>
                  </Td>
                  <Td className="font-bold text-brand-900">{log.item}</Td>
                  <Td className="font-medium text-brand-700">{log.qty}</Td>
                  <Td className="font-semibold text-red-600">₱{log.cost?.toFixed(2)}</Td>
                  <Td><span className="inline-block text-[11px] uppercase tracking-wider bg-red-50 border border-red-100 text-red-700 px-2 py-0.5 rounded font-bold">{log.reason}</span></Td>
                  <Td className="text-xs text-brand-500 max-w-xs truncate" title={log.notes}>{log.notes || '—'}</Td>
                </Tr>
              ))}
            </Table>
          </div>

          {!filteredLogs.length && !loading && (
            <div className="text-center text-brand-400 py-12 font-medium bg-white border border-dashed border-brand-200 rounded-xl mt-2">
              No waste records found.
            </div>
          )}

          {!!loading && (
            <div className="text-center text-brand-400 py-12 font-medium bg-white border border-dashed border-brand-200 rounded-xl mt-2 animate-pulse">
              Naglo-load ng waste log...
            </div>
          )}
        </div>

        {/* PAGINATION CONTROLS */}
        {filteredLogs.length > 0 && (
          <div className="p-3 border-t border-brand-100 bg-white">
            <Pagination page={page} count={filteredLogs.length} perPage={PER_PAGE} total="logs" onChange={setPage} />
          </div>
        )}
      </Card>

      {/* Creation Modal Form */}
      <Modal 
        isOpen={modalOpen} 
        onClose={() => !isSaving && setModalOpen(false)} 
        title={`Log ${logType === 'ingredient' ? 'Spoiled / Expired Ingredient' : logType === 'product' ? 'Unsold Product' : 'Damaged Material'}`}
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" disabled={isSaving} onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="danger" disabled={isSaving} onClick={handleLog}>{isSaving ? 'Saving...' : 'Confirm Log'}</Button>
          </div>
        }
      >
        {logType === 'ingredient' && (
          <div className="space-y-4">
            <Select label="Select Ingredient" required value={ingName} onChange={e => {
              const matched = ingredients.find(i => i.name === e.target.value);
              setIngName(e.target.value);
              if (matched) setIngUnit(matched.unit);
            }}>
              <option value="">— Select an ingredient —</option>
              {ingredients.map(i => (
                <option key={i.id} value={i.name}>{i.name} (In stock: {i.stock} {i.unit})</option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantity Lost" required type="text" inputMode="decimal" value={ingQty} onChange={e => setIngQty(sanitizeNumericText(e.target.value))} min="0" />
              <Select label="Reason" required value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.ingredient.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <Textarea label="Additional Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Expired shelf life, may amag na..." rows={2} />
          </div>
        )}

        {logType === 'material' && (
          <div className="space-y-4">
            <Select label="Select Material" required value={matName} onChange={e => {
              const matched = materials.find(m => m.name === e.target.value);
              setMatName(e.target.value);
              if (matched) setMatUnit(matched.unit);
            }}>
              <option value="">— Select a material —</option>
              {materials.map(m => (
                <option key={m.id} value={m.name}>{m.name} (In stock: {m.stock} {m.unit})</option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantity Lost" required type="text" inputMode="decimal" value={matQty} onChange={e => setMatQty(sanitizeNumericText(e.target.value))} min="0" />
              <Select label="Reason" required value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.material.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <Textarea label="Additional Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Napunit while preparing..." rows={2} />
          </div>
        )}

        {logType === 'product' && (
          <div className="space-y-4">
            <Select label="Select Product" required value={productName} onChange={e => {
              setProductName(e.target.value); setProductQty(''); setProductUnit('pcs');
            }}>
              <option value="">— Select a product —</option>
              {products.filter(p => p.stock > 0).map(p => (
                <option key={p.id} value={p.name}>{p.name} (Current Stock: {p.stock} pcs)</option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantity" required type="text" inputMode="numeric" value={productQty} onChange={e => setProductQty(sanitizeNumericText(e.target.value))} placeholder="0" />
              <Select label="Reason" required value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.product.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <Textarea label="Additional Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. 5 ensaymada left unsold..." rows={2} />
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={showBulkVoidConfirm}
        onClose={() => !isVoidingRef.current && setShowBulkVoidConfirm(false)}
        onConfirm={handleBulkVoid}
        title="Void Waste Records"
        message={
          selectedLogs.length === 1
            ? `Void "${selectedLogs[0]?.item}" (${selectedLogs[0]?.qty})? Stock will be restored — this doesn't permanently delete the record, it stays for the audit trail.`
            : `Void ${selectedLogs.length} selected records? Stock will be restored for each — walang totoong delete, mananatili sila para sa audit trail.`
        }
        confirmLabel={isVoiding ? 'Voiding...' : 'Void'}
        variant="danger"
      />

    </div>
  );
}