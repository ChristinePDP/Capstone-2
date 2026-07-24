import { useState, useEffect } from 'react'; // Idagdag ang useEffect
import { Plus, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Table, Tr, Td, Pagination, Badge, Card, LevelBar, ConfirmModal } from '../../components/ui';
import { ingStatus } from '../../utils/inventoryHelpers';

const PER_PAGE = 10;

// ─── MOCK DATA FALLBACKS ───
const MOCK_MATERIALS = [
  { id: 'm1', name: 'Printed Balloons (Red)', stock: 120, min: 50, unit: 'pcs', costPerUnit: 5 },
  { id: 'm2', name: 'Tarpaulin Banner 3x4', stock: 3, min: 5, unit: 'pcs', costPerUnit: 150 },
  { id: 'm3', name: 'Cake Candles (Metallic)', stock: 12, min: 20, unit: 'packs', costPerUnit: 45 },
];

export default function CelebrationTab() {
  const context = useApp() || {};
  const { addMaterial, updateMaterial, deleteMaterial, restockMaterial } = context;
  const materials = context.materials && context.materials.length > 0 ? context.materials : MOCK_MATERIALS;

  const { show: showToast } = useToast();
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editMat, setEditMat]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = materials.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

// Sa CelebrationTab.jsx
// Sa CelebrationTab.jsx
const handleSave = async (data, addedQty = 0, note = '') => {
  try {
    if (editMat?.id) {
      // Dito dapat may AWAIT
      await restockMaterial(editMat.id, data); 
      showToast(`+${addedQty} ${editMat.unit} na-add sa ${editMat.name}.`);
    } else {
      // Dito dapat may AWAIT
      await addMaterial(data); 
      showToast('Celebration material added.');
    }
    // Isasara lang ang modal pagkatapos ng matagumpay na API call
    setModalOpen(false); 
  } catch (err) {
    showToast(err.message || 'Failed to save', 'error');
  }
};

const handleDelete = async () => {
  try {
    if (deleteMaterial) await deleteMaterial(deleteTarget.id);
    showToast(`${deleteTarget.name} deleted.`, 'warning');
  } catch (err) {
    showToast(err.message || 'Failed to delete material', 'error');
  } finally {
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
                  <div className="flex justify-end gap-2 pt-2 border-t border-brand-50">
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
        </div>

        {filtered.length > PER_PAGE && (
           <div className="p-3 border-t border-brand-100">
             <Pagination page={page} count={filtered.length} perPage={PER_PAGE} total="materials" onChange={setPage} />
           </div>
        )}
      </Card>

      <MaterialModal isOpen={modalOpen} onClose={() => setModalOpen(false)} material={editMat} onSave={handleSave} />
      
      <ConfirmModal
        isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Material" message={`I-delete ang "${deleteTarget?.name}"?`}
        confirmLabel="Delete" variant="danger"
      />
    </div>
  );
}

function MaterialModal({ isOpen, onClose, material, onSave }) {
  const { show: showToast } = useToast();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [stock, setStock] = useState('');
  const [min, setMin] = useState(material?.min ?? '');
  const [cost, setCost] = useState('');
  const isEdit = !!material?.id;

  useEffect(() => {
    if (isOpen) {
      setName(material?.name ?? '');
      setUnit(material?.unit ?? 'pcs');
      setStock('');
      setMin(material?.min ?? '');
      setCost('');
    }
  }, [isOpen, material]);

  const addedQty = parseFloat(stock) || 0;

  const handleSave = async () => { // Gawing ASYNC[cite: 9]
    if (!isEdit) {
      if (!name.trim()) { showToast('Material name is required.', 'error'); return; }
      if (!stock) { showToast('Initial stock is required.', 'error'); return; }
      if (parseFloat(stock) < 0) { showToast('Stock quantity cannot be negative.', 'error'); return; }
    } else {
      if (!stock) { showToast('Added quantity is required.', 'error'); return; }
      if (addedQty <= 0) { showToast('Added quantity must be greater than 0.', 'error'); return; }
    }

    if (!min) { showToast('Minimum safety stock is required.', 'error'); return; }

    const newStock = isEdit ? +(material.stock + addedQty).toFixed(4) : addedQty;

    const dataToSave = isEdit 
      ? { added_qty: addedQty, minimum_stock: parseFloat(min), total_cost: cost ? parseFloat(cost) : 0 }
      : { name: name.trim(), unit, stock_quantity: newStock, minimum_stock: parseFloat(min), cost_per_unit: cost ? parseFloat(cost) / addedQty : 0, category: 'Celebration Material' };

    // Dito dapat i-await ang onSave[cite: 9]
    await onSave(dataToSave, addedQty, isEdit ? 'Stock added' : 'Initial stock');
    
    // Isara lang ang modal pagkatapos mag-await[cite: 9]
    onClose();
    };

  return (
<Modal isOpen={isOpen} onClose={onClose} title={isEdit ? `Add Stock — ${material?.name}` : 'Add New Celebration Material'} size="md"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSave}>
            {isEdit ? 'Add Stock' : 'Save Material'}
          </Button>
        </div>
}
    >
      <div className="space-y-4">
        {!isEdit && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="Item Name" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Tarpaulin (2x3 ft)" />
            <Select label="Unit" required value={unit} onChange={e => setUnit(e.target.value)}>
              {['pcs', 'packs', 'sets', 'boxes'].map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
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
          <Input label={isEdit ? `Quantity na Idadagdag` : 'Initial Stock Quantity'} required type="number" value={stock} onChange={e => setStock(e.target.value)} min="0" />
          <Input label="Minimum Stock Level" required type="number" value={min} onChange={e => setMin(e.target.value)} min="0" />
          <Input label="Total Cost (₱)" type="number" value={cost} onChange={e => setCost(e.target.value)} min="0" step="0.01" />
        </div>
      </div>
    </Modal>
  );
}