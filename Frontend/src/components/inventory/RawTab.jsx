import { useState, useEffect } from 'react'; // Idagdag ang useEffect
import { Plus, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Table, Tr, Td, Pagination, Badge, Card, LevelBar, ConfirmModal } from '../../components/ui';
import { ingStatus } from '../../utils/inventoryHelpers';

const PER_PAGE = 10;

// ─── MOCK DATA FALLBACKS ───
const MOCK_INGREDIENTS = [
  { id: 'i1', name: 'All-Purpose Flour', stock: 15, min: 20, unit: 'kg', costPerUnit: 60 },
  { id: 'i2', name: 'White Sugar', stock: 0, min: 10, unit: 'kg', costPerUnit: 85 },
  { id: 'i3', name: 'Fresh Milk', stock: 25, min: 12, unit: 'Liters', costPerUnit: 90 },
];

export default function IngredientsTab() {
  const context = useApp() || {};
  const { addIngredient, updateIngredient, deleteIngredient, restockIngredient } = context;
  const ingredients = context.ingredients && context.ingredients.length > 0 ? context.ingredients : MOCK_INGREDIENTS;

  const { show: showToast } = useToast();
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editIng, setEditIng]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = ingredients.filter(ing =>
    ing.name.toLowerCase().includes(search.toLowerCase())
  );
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const handleSave = async (data, addedQty = 0, note = '') => {
    try {
      if (editIng?.id) {
        if (restockIngredient) await restockIngredient(editIng.id, data);
        showToast(`+${addedQty} ${editIng.unit} na-add sa ${editIng.name}.`);
      } else {
        if (addIngredient) await addIngredient(data);
        showToast('Raw ingredient added successfully.');
      }
      setModalOpen(false); // Sasarado lang kapag successful ang save
    } catch (err) {
      showToast(err.message || 'Failed to save ingredient', 'error'); // Sasaluhin ang API error
      throw err; // I-throw pabalik para hindi mag-onClose sa modal
    }
  };

  const handleDelete = async () => {
    try {
      if (deleteIngredient) await deleteIngredient(deleteTarget.id);
      showToast(`${deleteTarget.name} removed from ingredients.`, 'warning');
      setDeleteTarget(null);
    } catch (err) {
      showToast(err.message || 'Failed to delete ingredient', 'error');
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
                  <div className="flex justify-end gap-2 pt-2 border-t border-brand-50">
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
        </div>

        {filtered.length > PER_PAGE && (
           <div className="p-3 border-t border-brand-100">
             <Pagination page={page} count={filtered.length} perPage={PER_PAGE} total="ingredients" onChange={setPage} />
           </div>
        )}
      </Card>

      <IngredientModal isOpen={modalOpen} onClose={() => setModalOpen(false)} ingredient={editIng} onSave={handleSave} />
      
      <ConfirmModal
        isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Ingredient" message={`I-delete ang "${deleteTarget?.name}" sa listahan?`}
        confirmLabel="Delete" variant="danger"
      />
    </div>
  );
}

function IngredientModal({ isOpen, onClose, ingredient, onSave }) {
  const { show: showToast } = useToast();
  const [name, setName]   = useState('');
  const [unit, setUnit]   = useState('kg');
  const [stock, setStock] = useState('');
  const [min, setMin]     = useState(ingredient?.min ?? '');
  const [cost, setCost]   = useState('');

  const isEdit = !!ingredient?.id;

  // ✅ TAMANG PAG-SYNC NG STATE KAPAG BINUKSAN ANG MODAL
  useEffect(() => {
    if (isOpen) {
      setName(ingredient?.name ?? '');
      setUnit(ingredient?.unit ?? 'kg');
      setStock('');
      setMin(ingredient?.min ?? '');
      setCost('');
    }
  }, [isOpen, ingredient]);

  const addedQty = parseFloat(stock) || 0;

  const handleSave = async () => {
    // ─── ACTIVE FRONTEND ERROR VALIDATIONS ───
    if (!isEdit) {
      if (!name.trim()) {
        showToast('Ingredient name is required.', 'error');
        return;
      }
      if (!stock) {
        showToast('Stock quantity is required.', 'error');
        return;
      }
      if (parseFloat(stock) < 0) {
        showToast('Stock quantity cannot be negative.', 'error');
        return;
      }
    } else {
      if (!stock) {
        showToast('Added quantity is required.', 'error');
        return;
      }
      if (addedQty <= 0) {
        showToast('Added quantity must be greater than 0.', 'error');
        return;
      }
    }

    if (!min) {
      showToast('Minimum safety stock is required.', 'error');
      return;
    }

    const newStock = isEdit ? +(ingredient.stock + addedQty).toFixed(4) : addedQty;
    
    const dataToSave = isEdit 
      ? {
          added_qty: addedQty,
          minimum_stock: parseFloat(min),
          total_cost: cost ? parseFloat(cost) : 0,
        }
      : {
          name: name.trim(),
          unit,
          stock_quantity: newStock,
          minimum_stock: parseFloat(min),
          cost_per_unit: cost ? parseFloat(cost) / addedQty : 0,
          category: 'Raw Material',
        };

    try {
      await onSave(dataToSave, addedQty, isEdit ? 'Restocked item' : 'Initial stock entry');
      onClose(); // Isasara lang ang modal kapag matagumpay ang save!
    } catch (err) {
      return err;
      // Hindi isasara ang modal kapag may error upang maitama ng user ang inputs
    }
  };

  return (
    <Modal
      isOpen={isOpen} onClose={onClose}
      title={isEdit ? `Restock — ${ingredient?.name}` : 'Add New Raw Ingredient'}
      subtitle={isEdit ? `Unit: ${ingredient?.unit} · Kasalukuyang Stock: ${ingredient?.stock}` : 'I-record ang mga bagong biling sako o bultong sangkap.'}
      size="md"
      footer={
        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {/* Button is ALWAYS enabled now to trigger proper error toast messages */}
          <Button variant="primary" onClick={handleSave}>
            {isEdit ? 'Update Stock' : 'Save Ingredient'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!isEdit && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="Ingredient Name" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Wash Sugar" />
            <Select label="Unit" required value={unit} onChange={e => setUnit(e.target.value)}>
              {['kg', 'grams', 'Liters', 'ml', 'pcs', 'boxes'].map(u => <option key={u} value={u}>{u}</option>)}
            </Select>
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
          <Input label={isEdit ? `Dami na Idadagdag` : 'Kasalukuyang Stock (Qty)'} required type="number" value={stock} onChange={e => setStock(e.target.value)} min="0" />
          <Input label="Minimum Safety Stock" required type="number" value={min} onChange={e => setMin(e.target.value)} min="0" />
          <Input label="Total Halaga / Resibo (₱)" type="number" value={cost} onChange={e => setCost(e.target.value)} min="0" step="0.01" />
        </div>
      </div>
    </Modal>
  );
}