import { useState, useMemo } from 'react';
import { AlertTriangle, Search, Filter, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Textarea, Table, Tr, Td, Pagination, Badge, Card } from '../../components/ui';

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
    wasteLogs = [], 
    ingredients = [], 
    products = [], 
    materials = [] 
  } = useApp() || {};

  const { show: showToast } = useToast();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');

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

  const filteredLogs = useMemo(() => {
    return wasteLogs.filter(log => {
      const matchesSearch = log.item?.toLowerCase().includes(search.toLowerCase()) || 
                            log.reason?.toLowerCase().includes(search.toLowerCase()) ||
                            (log.notes && log.notes.toLowerCase().includes(search.toLowerCase()));
      const matchesType = filterType === 'All' || log.type === filterType;
      return matchesSearch && matchesType;
    });
  }, [wasteLogs, search, filterType]);

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
    setModalOpen(true);
  };

  const handleLog = async () => {
    // FIX: required-field validation now runs BEFORE the stock-sufficiency
    // check (per logType). Previously the stock check ran first and, when
    // no item was selected, `selectedItemStock` defaulted to 0 — so any
    // positive qty always tripped "Hindi sapat ang stock!" instead of the
    // intended "Mangyaring punan..." missing-field message.
    let finalItem = '';
    let rawQty = 0;
    let computedCost = 0;
    let finalUnit = '';
    let selectedItemStock = 0;

    if (logType === 'ingredient') {
      if (!ingName || !ingQty) {
        showToast('Mangyaring punan ang pangalan at dami ng sangkap.', 'error');
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
        showToast('Mangyaring piliin ang produkto at dami.', 'error');
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
        showToast('Mangyaring piliin ang materyales at dami.', 'error');
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
      showToast(`Hindi sapat ang stock! Mayroon ka na lamang ${selectedItemStock} na natitira para dito.`, 'error');
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

    try {
      if (logWaste) {
        await logWaste(backendPayload);
        showToast('Matagumpay na nairehistro ang waste record.', 'success');
      }
      setModalOpen(false);
    } catch (err) {
      showToast(err.message || 'May naganap na error sa pag-save.', 'error');
    }
  };

  const totalCostFiltered = useMemo(() => {
    return filteredLogs.reduce((acc, curr) => acc + (curr.cost || 0), 0);
  }, [filteredLogs]);

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
            <p className="text-xs text-brand-400 mt-0.5">I-bawas sa kasalukuyang imbentaryo ang mga sira, expired, o hindi nabentang supply.</p>
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
          </div>
        </div>

        {/* SEARCH & FILTER SECTION */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 border-b border-brand-100 bg-brand-50/40 min-w-0">
          <div className="relative w-full sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
            <input 
              type="text" 
              placeholder="Maghanap ng waste log..." 
              value={search} 
              onChange={e => { setSearch(e.target.value); setPage(1); }} 
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none focus:border-brand-400 bg-white" 
            />
          </div>
          
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={14} className="text-brand-400 shrink-0" />
            <select className="flex-1 sm:flex-none text-xs border border-brand-200 rounded-lg px-2 py-1.5 bg-white font-medium text-brand-700 outline-none focus:border-brand-400" value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}>
              <option value="All">Lahat ng Kategorya</option>
              <option value="ingredient">Raw Ingredient</option>
              <option value="product">Finished Product</option>
              <option value="material">Celebration Material</option>
            </select>
          </div>
          
          {/* TOTAL LOSS STAT - Malinis at naka-align */}
           <div className="sm:ml-auto flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 bg-white px-3 py-1.5 rounded-lg border border-brand-100 shadow-sm w-full sm:w-auto min-w-0">
             <span className="text-[11px] font-bold text-brand-400 uppercase tracking-wider leading-tight">Tantiya ng Lugi:</span>
             <span className="text-[15px] font-black text-red-600 whitespace-nowrap leading-tight sm:ml-auto">₱{totalCostFiltered.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* ─── RESPONSIVE SPLIT VIEWS ─── */}
        <div className="px-4 pb-4 mt-4">
          
          {/* 📱 MOBILE CARD LAYOUT (Malinis, hindi siksik) */}
          <div className="block md:hidden space-y-4">
            {pagedLogs.map(log => (
              <div key={log.id} className="w-full min-w-0 p-4 bg-white border border-brand-100 rounded-xl shadow-sm flex flex-col gap-3">
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
                    <span className="text-brand-400 block mb-0.5 font-medium">Dami:</span>
                    <span className="font-bold text-brand-700">{log.qty}</span>
                  </div>
                  <div>
                    <span className="text-brand-400 block mb-0.5 font-medium">Lugi:</span>
                    <span className="font-bold text-red-600">₱{log.cost?.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex items-end justify-between gap-3 pt-1 min-w-0">
                  <div className="flex-1 min-w-0">
                    <span className="inline-block max-w-full break-words text-[10px] bg-red-50 text-red-700 px-2 py-0.5 rounded font-bold mb-1 border border-red-100">
                      {log.reason}
                    </span>
                    <p className="text-[11px] text-brand-500 line-clamp-2 leading-snug break-words">
                      <span className="font-semibold text-brand-600">Tala:</span> {log.notes || '—'}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 💻 DESKTOP TABLE LAYOUT */}
          <div className="hidden md:block overflow-x-auto">
            <Table columns={[
              { label: 'Petsa at Oras' },
              { label: 'Kategorya' },
              { label: 'Aytem / Pangalan' },
              { label: 'Dami' },
              { label: 'Halaga ng Lugi (₱)' },
              { label: 'Dahilan' },
              { label: 'Tala' },
              { label: 'Aksyon', align: 'right' }
            ]}>
              {pagedLogs.map(log => (
                <Tr key={log.id}>
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

          {!filteredLogs.length && (
            <div className="text-center text-brand-400 py-12 font-medium bg-white border border-dashed border-brand-200 rounded-xl mt-2">
              No waste records found.
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
        onClose={() => setModalOpen(false)} 
        title={`Mag-ulat ng ${logType === 'ingredient' ? 'Sira / Expired na Sangkap' : logType === 'product' ? 'Hindi Nabentang Produkto' : 'Nasirang Dekorasyon/Materyales'}`}
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={handleLog}>Confirm Log</Button>
          </div>
        }
      >
        {logType === 'ingredient' && (
          <div className="space-y-4">
            <Select label="Pumili ng Sangkap" required value={ingName} onChange={e => {
              const matched = ingredients.find(i => i.name === e.target.value);
              setIngName(e.target.value);
              if (matched) setIngUnit(matched.unit);
            }}>
              <option value="">— Piliin ang sangkap —</option>
              {ingredients.map(i => (
                <option key={i.id} value={i.name}>{i.name} (Mayroon pa: {i.stock} {i.unit})</option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Dami ng Itatapon" required type="number" value={ingQty} onChange={e => setIngQty(e.target.value)} min="0" step="any" />
              <Select label="Dahilan" required value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.ingredient.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <Textarea label="Karagdagang Detalye" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Expired shelf life, amag..." rows={2} />
          </div>
        )}

        {logType === 'material' && (
          <div className="space-y-4">
            <Select label="Pumili ng Materyales" required value={matName} onChange={e => {
              const matched = materials.find(m => m.name === e.target.value);
              setMatName(e.target.value);
              if (matched) setMatUnit(matched.unit);
            }}>
              <option value="">— Piliin ang materyales —</option>
              {materials.map(m => (
                <option key={m.id} value={m.name}>{m.name} (Mayroon pa: {m.stock} {m.unit})</option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantity Lost" required type="number" value={matQty} onChange={e => setMatQty(e.target.value)} min="0" />
              <Select label="Dahilan" required value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.material.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <Textarea label="Karagdagang Detalye" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Napunit habang hinahanda..." rows={2} />
          </div>
        )}

        {logType === 'product' && (
          <div className="space-y-4">
            <Select label="Select Product" required value={productName} onChange={e => {
              setProductName(e.target.value); setProductQty(''); setProductUnit('pcs');
            }}>
              <option value="">— Piliin ang product —</option>
              {products.filter(p => p.stock > 0).map(p => (
                <option key={p.id} value={p.name}>{p.name} (Current Stock: {p.stock} pcs)</option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantity" required type="number" value={productQty} onChange={e => setProductQty(e.target.value)} max={products.find(p => p.name === productName)?.stock || ''} />
              <Select label="Reason" required value={reason} onChange={e => setReason(e.target.value)}>
                {REASONS.product.map(r => <option key={r}>{r}</option>)}
              </Select>
            </div>
            <Textarea label="Additional Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. 5 ensaymada left unsold..." rows={2} />
          </div>
        )}
      </Modal>

    </div>
  );
}