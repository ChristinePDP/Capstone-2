import { useState, useMemo, useRef } from 'react';
import { AlertTriangle, Search, Filter, Plus, RotateCcw, ListChecks, X } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Textarea, Table, Tr, Td, Pagination, Badge, Card, ConfirmModal, TableSkeleton, CardSkeleton } from '../../components/ui/index';
import { sanitizeNumericText, getQtyError, MAX_QTY } from '../../utils/numberGuards';
import { useIsCompact } from '../../hooks/useIsCompact';

const PER_PAGE = 10;

const REASONS = {
  ingredient: ['Spoiled', 'Expiring Soon', 'Spilled/Wasted', 'Pest Damage', 'Other'],
  product: ['Unsold', 'Damaged', 'Expired', 'Quality Defect', 'Other'],
  material: ['Popped/Butas', 'Damaged', 'Misprinted', 'Lost', 'Other']
};

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
    if (isSaving) return;

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
              variant="secondary"
              size="sm"
              onClick={() => handleOpenLogModal('ingredient')}
              className="flex-1 sm:flex-none justify-center text-xs"
            >
              <Plus size={13} className="mr-1" /> Spoiled Ingredient
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenLogModal('product')}
              className="flex-1 sm:flex-none justify-center text-xs"
            >
              <Plus size={13} className="mr-1" /> Unsold Product
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleOpenLogModal('material')}
              className="flex-1 sm:flex-none justify-center text-xs"
            >
              <Plus size={13} className="mr-1" /> Damaged Material
            </Button>
            {!selectionMode && (
              <Button
                variant="danger"
                size="sm"
                onClick={enterSelectionMode}
                className="w-full sm:w-auto justify-center text-xs"
              >
                <ListChecks size={13} className="mr-1" /> Select to Void
              </Button>
            )}
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
                  <option value="ingredient">Raw Ingredient</option>
                  <option value="product">Finished Product</option>
                  <option value="material">Celebration Material</option>
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
                    <Badge variant={log.type === 'ingredient' ? 'warning' : log.type === 'product' ? 'info' : 'default'} className="capitalize shrink-0 text-[10px]">
                      {log.type}
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
              ...(selectionMode ? [{
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
                      <Badge variant={log.type === 'ingredient' ? 'warning' : log.type === 'product' ? 'info' : 'default'} className="capitalize">
                        {log.type}
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

          {!filteredLogs.length && !loading && (
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
        onClose={() => !isSaving && setModalOpen(false)} 
        title={`Log ${logType === 'ingredient' ? 'Spoiled Ingredient' : logType === 'product' ? 'Unsold Product' : 'Damaged Material'}`}
        footer={
          <div className="flex gap-2 justify-end w-full sm:w-auto">
            <Button variant="secondary" className="flex-1 sm:flex-none" disabled={isSaving} onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button className=" bg-amber-900 flex-1 sm:flex-none" disabled={isSaving} onClick={handleLog}>{isSaving ? 'Saving...' : 'Confirm Log'}</Button>
          </div>
        }
      >
        {logType === 'ingredient' && (
          <div className="space-y-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Quantity Lost" required type="text" inputMode="decimal" value={ingQty} onChange={e => setIngQty(sanitizeNumericText(e.target.value))} min="0" />
              <Select label="Reason" required value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.ingredient.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>
        )}

        {logType === 'material' && (
          <div className="space-y-3">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Quantity Lost" required type="text" inputMode="decimal" value={matQty} onChange={e => setMatQty(sanitizeNumericText(e.target.value))} min="0" />
              <Select label="Reason" required value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.material.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
          </div>
        )}

        {logType === 'product' && (
          <div className="space-y-3">
            <Select label="Select Product" required value={productName} onChange={e => {
              setProductName(e.target.value); setProductQty(''); setProductUnit('pcs');
            }}>
              <option value="">— Select a product —</option>
              {products.filter(p => p.stock > 0).map(p => (
                <option key={p.id} value={p.name}>{p.name} (Current Stock: {p.stock} pcs)</option>
              ))}
            </Select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Quantity" required type="text" inputMode="numeric" value={productQty} onChange={e => setProductQty(sanitizeNumericText(e.target.value))} placeholder="0" />
              <Select label="Reason" required value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.product.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <Textarea label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." rows={2} />
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
            ? `Void "${selectedLogs[0]?.item}" (${selectedLogs[0]?.qty})? Stock will be restored.`
            : `Void ${selectedLogs.length} selected records? Stock will be restored for each.`
        }
        confirmLabel={isVoiding ? 'Voiding...' : 'Void'}
        variant="danger"
      />
    </div>
  );
}