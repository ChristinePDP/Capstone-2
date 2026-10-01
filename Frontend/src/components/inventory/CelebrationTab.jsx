import { useState, useRef, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Search, Pencil, Wallet, Tag, Package, RefreshCw, Check, ShoppingCart, ChevronDown } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useToast, Button, Modal, Input, Select, Table, Tr, Td, Pagination, Badge, Card, LevelBar, ConfirmModal, TableSkeleton, CardSkeleton } from '../../components/ui/index';
import { ingStatus } from '../../utils/inventoryHelpers';
import { sanitizeNumericText, sanitizeQtyText, parseFractionInput, formatPesoLive, parseFormattedPeso, getQtyError, getCostError, MAX_QTY } from '../../utils/numberGuards';
import { STOCK_UNIT_CATEGORIES } from '../../utils/unitUtils';
import { RestockHistoryPanel } from './InventoryHistoryModal';
import { useIsCompact } from '../../hooks/useIsCompact';

const PER_PAGE = 10;

const MATERIAL_VIEWS = [
  { key: 'celebration', label: 'Celebration Material', category: 'Celebration Material' },
  { key: 'product',     label: 'Product Material',     category: 'Product Material' },
];

// The material type is stored in the database (column: material_type,
// 'celebration' | 'product'). We simply read it here - no more guessing
// from the linked product, so the two tabs can never get mixed up.
function getMaterialViewKey(material) {
  const type = material?.materialType ?? material?.material_type;
  return type === 'product' ? 'product' : 'celebration';
}

export default function CelebrationTab() {
  const context = useApp() || {};
  const { addMaterial, updateMaterial, deleteMaterial, restockMaterial } = context;
  const materials = useMemo(() => context.materials || [], [context.materials]);
  const pendingFulfillment = context.pendingMaterialFulfillment || [];
  const allProducts = context.products || [];
  // Celebration Materials ay naka-link sa Celebration Material products
  // (hal. tarpaulin/balloons na binebenta bilang add-on). Product
  // Materials naman ay para sa packaging ng REGULAR products (hal. mga
  // boxes ng cakes/pastries) — kaya iba dapat ang pinagkukunan ng
  // name-suggestions sa datalist, hindi dapat sila dependent sa
  // Celebration Material products.
  const celebrationProducts = allProducts.filter(product => product.category === 'Celebration Material');
  const regularProducts = allProducts.filter(product => product.category !== 'Celebration Material');
  const productsById = useMemo(
    () => Object.fromEntries(allProducts.map(p => [p.id, p])),
    [allProducts]
  );
  const isLoading = !!context.loading;

  const { show: showToast } = useToast();
  const [containerRef, isCompact] = useIsCompact();
  const [materialView, setMaterialView] = useState(() => localStorage.getItem('inv_material_view') || 'celebration');
  const [page, setPage]             = useState(1);
  const [search, setSearch]         = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editMat, setEditMat]       = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const isDeletingRef = useRef(false);

  const currentEditMat = materials.find(m => m.id === editMat?.id) || editMat;
  const activeView = MATERIAL_VIEWS.find(v => v.key === materialView) || MATERIAL_VIEWS[0];

  const handleViewChange = (key) => {
    setMaterialView(key);
    localStorage.setItem('inv_material_view', key);
    setPage(1);
  };

  const materialsInView = useMemo(
    () => materials.filter(m => getMaterialViewKey(m) === materialView),
    [materials, materialView]
  );

  const filtered = materialsInView.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || ingStatus(m.stock, m.min).label === statusFilter;
    return matchesSearch && matchesStatus;
  });
  const paged = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  // Total per material type — shown as a small count beside each view tab.
  const viewCounts = useMemo(() => {
    const counts = { celebration: 0, product: 0 };
    materials.forEach(m => { counts[getMaterialViewKey(m)] += 1; });
    return counts;
  }, [materials]);

  // Counts shown in the status dropdown (for the material type currently
  // in view). Uses the same ingStatus() as the table's Status column and the
  // filter, so the numbers always match what you get after picking an option.
  const statusCounts = materialsInView.reduce((acc, m) => {
    const label = ingStatus(m.stock, m.min).label;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const handleSave = async (payload) => {
    if (payload.isNew) {
      await addMaterial(payload.newData);
      showToast('Celebration / Product material added.');
      return;
    }

    if (payload.detailsPayload && updateMaterial) {
      await updateMaterial(currentEditMat.id, payload.detailsPayload);
    }
    if (payload.restockPayload && restockMaterial) {
      await restockMaterial(currentEditMat.id, payload.restockPayload);
    }

    if (payload.detailsPayload && payload.restockPayload) {
      showToast(`Details updated and +${payload.addedQty} ${currentEditMat.unit} added to ${currentEditMat.name}.`);
    } else if (payload.restockPayload) {
      showToast(`+${payload.addedQty} ${currentEditMat.unit} added to ${currentEditMat.name}.`);
    } else if (payload.detailsPayload) {
      showToast('Material details updated.');
    }
  };

  const handleDelete = async () => {
    if (isDeletingRef.current || !deleteTarget) return;
    isDeletingRef.current = true; 
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
      {pendingFulfillment.length > 0 && (
        <div className="border border-red-200 bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-50 border-b border-red-200">
            <ShoppingCart size={14} className="text-red-600 shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wider text-red-700 flex-1">Pending Material Fulfillment</p>
            <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">{pendingFulfillment.length} items</span>
          </div>
          <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
            {pendingFulfillment.map((item, index) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="text-sm font-semibold text-gray-800">{index + 1}. {item.name}</span>
                <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-100">+{item.neededToRestock} {item.unit}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-brand-100 gap-3">
          <div>
            <h3 className="font-bold text-brand-800">Celebration/Product Materials</h3>
            <p className="text-xs text-brand-400 mt-0.5">
              {materialView === 'celebration'
                ? 'Manage party add-ons like balloons and tarpaulins.'
                : 'Manage packaging materials used for your products, like boxes.'}
            </p>
          </div>
          <Button variant="dark" onClick={() => { setEditMat(null); setModalOpen(true); }} className="w-full sm:w-auto justify-center">
            <Plus size={14} /> Add New {activeView.label}
          </Button>
        </div>

        <div className="flex gap-6 border-b-2 border-brand-100 px-4 mt-3">
          {MATERIAL_VIEWS.map(view => (
            <button
              key={view.key}
              type="button"
              onClick={() => handleViewChange(view.key)}
              className={`pb-2.5 text-sm font-bold border-b-2 transition-all -mb-0.5 flex items-center gap-2 ${
                materialView === view.key
                  ? 'border-brand-800 text-brand-900'
                  : 'border-transparent text-brand-400 hover:text-brand-600'
              }`}
            >
              {view.label}
              <span className="text-[11px] font-bold text-brand-600 bg-brand-100 px-2 py-0.5 rounded-full">{viewCounts[view.key]}</span>
            </button>
          ))}
        </div>

        <div className="px-4 py-3 border-b border-brand-100 bg-brand-50/40">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative max-w-xs w-full">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-300" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search material..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none focus:border-brand-400 bg-white"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-1.5 text-sm border border-brand-200 rounded-lg outline-none focus:border-brand-400 bg-white font-semibold text-brand-700 cursor-pointer w-full sm:w-auto"
            >
              <option value="all">All Status ({materialsInView.length})</option>
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
                          <Button size="sm" variant="secondary" onClick={() => { setEditMat(mat); setModalOpen(true); }}>Add Stock / Edit</Button>
                          <Button size="sm" variant="danger" onClick={() => setDeleteTarget(mat)}>Delete</Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <Table columns={[
                  { label: 'Item Name' },
                  { label: 'Available Stock' },
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
                            <Button size="sm" variant="secondary" onClick={() => { setEditMat(mat); setModalOpen(true); }}>Add Stock / Edit</Button>
                            <Button size="sm" variant="danger" onClick={() => setDeleteTarget(mat)}>Delete</Button>
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </Table>
              )}

              {!paged.length && (
                <div className="text-center py-10 text-brand-400 font-medium bg-white border border-dashed border-brand-200 rounded-xl">
                  {(search || statusFilter !== 'all')
                    ? 'No matching materials found.'
                    : `No ${activeView.label.toLowerCase()} recorded yet.`}
                </div>
              )}
            </>
          )}
        </div>

        {filtered.length > PER_PAGE && (
           <div className="p-3 border-t border-brand-100">
             <Pagination page={page} count={filtered.length} perPage={PER_PAGE} total={` ${activeView.label.toLowerCase()}`} onChange={setPage} />
           </div>
        )}
      </Card>

      <MaterialModal
        key={currentEditMat?.id ?? `new-${materialView}`}
        isOpen={modalOpen}
        material={currentEditMat}
        celebrationProducts={celebrationProducts}
        regularProducts={regularProducts}
        productsById={productsById}
        defaultView={materialView}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
      />

      <ConfirmModal
        isOpen={!!deleteTarget} onClose={() => !isDeletingRef.current && setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete Material" message={`Delete "${deleteTarget?.name}"?`}
        confirmLabel={isDeleting ? 'Deleting...' : 'Delete'} variant="danger"
      />
    </div>
  );
}

// Custom-styled na autocomplete para sa Material Name (Celebration
// Material lang) — pinalitan ang native <datalist>, dahil hindi
// ma-cocontrol ng CSS ang itsura nito (browser default lang laging
// lumalabas, hindi tugma sa theme). Ito ang nagbibigay ng product-link
// (productId) kapag pumili ang user ng existing product sa listahan.
//
// IMPORTANT: naka-render ang dropdown panel sa pamamagitan ng React
// Portal (diretso sa document.body), HINDI sa loob ng normal na DOM
// tree ng modal. Dahil ang Modal body ay may sarili nitong
// overflow-y-auto (scrollable container), kapag "absolute" lang ang
// ginamit, na-cclip/nahihiwa ang dropdown sa gilid ng modal — lalo na
// kapag naka-scroll o malapit sa dulo. Sa portal, "fixed" position ang
// gamit base sa AKTWAL na coordinates ng input field
// (getBoundingClientRect), kaya laging naka-anchor ito nang tama kahit
// saan pa sa loob ng modal, at hindi na naaapektuhan ng overflow/z-index
// ng anumang ancestor.
function ProductLinkedNameField({ label = 'Material Name', value, onChange, products = [], placeholder, required = true }) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [coords, setCoords] = useState(null);
  const fieldRef = useRef(null);   // bumabalot sa Input — ginagamit para ma-measure ang position
  const dropdownRef = useRef(null); // ang portal-rendered dropdown panel mismo

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q ? products.filter(p => p.name.toLowerCase().includes(q)) : products;
    return list.slice(0, 8);
  }, [products, value]);

  const updateCoords = () => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
  };

  // I-recompute ang position habang bukas (kasama ang pag-scroll ng
  // modal body mismo — `true` sa 3rd arg ng addEventListener para
  // ma-capture ang scroll ng ANUMANG naka-nest na scrollable ancestor,
  // hindi lang ng window).
  useEffect(() => {
    if (!isOpen) return;
    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      const clickedField = fieldRef.current?.contains(e.target);
      const clickedDropdown = dropdownRef.current?.contains(e.target);
      if (!clickedField && !clickedDropdown) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const selectProduct = (product) => {
    onChange(product.name, product.id);
    setIsOpen(false);
    setHighlight(-1);
  };

  const handleKeyDown = (e) => {
    if (!isOpen || !filtered.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => (h + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => (h <= 0 ? filtered.length - 1 : h - 1));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      selectProduct(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={fieldRef}>
      <Input
        label={label}
        required={required}
        value={value}
        autoComplete="off"
        onChange={e => { onChange(e.target.value, null); setIsOpen(true); setHighlight(-1); }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
      {products.length > 0 && (
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-[38px] text-brand-400"
        />
      )}

      {isOpen && filtered.length > 0 && coords && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 9999 }}
          className="max-h-52 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-sm"
        >
          {filtered.map((product, idx) => (
            <button
              key={product.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onMouseEnter={() => setHighlight(idx)}
              onClick={() => selectProduct(product)}
              className={`w-full text-left px-3 py-1.5 text-sm ${
                idx === highlight ? 'bg-blue-600 text-white' : 'bg-white text-gray-900'
              }`}
            >
              {product.name}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}

function MaterialModal({ isOpen, onClose, material, celebrationProducts = [], regularProducts = [], productsById = {}, defaultView = 'celebration', onSave }) {
  const { show: showToast } = useToast();

  const [name, setName] = useState(material?.name ?? '');
  const [unit, setUnit] = useState(material?.unit ?? 'pcs');
  const [stock, setStock] = useState('');
  const [min, setMin] = useState(material?.min ?? '');
  const [cost, setCost] = useState(''); 
  const [expiry, setExpiry] = useState(''); // New: expiration date input
  const [productId, setProductId] = useState(material?.productId || material?.product_id || '');

  // The material type is fixed: for a new material it comes from the tab the
  // modal was opened in (defaultView); for an existing one it comes from the
  // saved material_type. The user no longer picks or changes it.
  const materialType = material?.id ? getMaterialViewKey(material) : defaultView;

  // Name-suggestion source depende sa uri: Celebration Materials ay
  // naka-link sa Celebration Material products, samantalang Product
  // Materials ay para sa packaging ng regular products (hindi dapat
  // dependent sa listahan ng Celebration Material products).
  const products = materialType === 'product' ? regularProducts : celebrationProducts;

  const [detailsCost, setDetailsCost] = useState(String(material?.costPerUnit ?? ''));
  const [editingDetails, setEditingDetails] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState(null);

  const isEdit = !!material?.id;

  const finalizedStock = parseFractionInput(stock);
  const addedQty = parseFloat(finalizedStock) || 0;
  const qtyError = stock ? getQtyError(finalizedStock, { max: MAX_QTY, label: isEdit ? 'Quantity to add' : 'Initial stock' }) : '';
  const minError = getQtyError(min, { max: MAX_QTY, label: 'Minimum safety stock' });
  const costError = getCostError(cost);
  const detailsCostError = getCostError(detailsCost);

  const isDetailsModified = isEdit && (
    name.trim() !== (material?.name ?? '').trim() ||
    unit !== (material?.unit ?? 'pcs') ||
    String(min) !== String(material?.min ?? '') ||
    String(detailsCost) !== String(material?.costPerUnit ?? '')
    || productId !== (material?.productId || material?.product_id || '')
  );

  const handleDetailsHeaderClick = () => {
    if (!editingDetails) {
      setEditingDetails(true);
    } else {
      if (isDetailsModified) {
        if (!name.trim()) { showToast('Material name is required.', 'error'); return; }
        if (minError) { showToast(minError, 'error'); return; }
        if (detailsCostError) { showToast(detailsCostError, 'error'); return; }
        
        setEditingDetails(false);
      } else {
        setEditingDetails(false);
      }
    }
  };

  const handleCancelDetails = () => {
    setName(material?.name ?? '');
    setUnit(material?.unit ?? 'pcs');
    setMin(material?.min ?? '');
    setDetailsCost(String(material?.costPerUnit ?? ''));
    setProductId(material?.productId || material?.product_id || '');
    setEditingDetails(false);
  };

  const handleValidate = () => {
    if (isSaving) return;

    if (!isEdit) {
      if (!name.trim()) { showToast('Material name is required.', 'error'); return; }
      if (!stock) { showToast('Initial stock is required.', 'error'); return; }
      if (parseFloat(finalizedStock) < 0) { showToast('Stock quantity cannot be negative.', 'error'); return; }
      if (!min) { showToast('Minimum safety stock is required.', 'error'); return; }
      if (minError) { showToast(minError, 'error'); return; }
      if (qtyError) { showToast(qtyError, 'error'); return; }
      if (!cost) { showToast('Total cost is required.', 'error'); return; }
      if (costError) { showToast(costError, 'error'); return; }

      setConfirmPayload({
        isNew: true,
        newData: { 
          name: name.trim(), 
          product_id: productId || null,
          unit, 
          stock_quantity: addedQty, 
          minimum_stock: parseFloat(min), 
          cost_per_unit: cost ? parseFloat(cost) / addedQty : 0, 
          material_type: defaultView, // 'celebration' | 'product' - taken from the active tab
          expiration_date: expiry || null // New field
        },
        addedQty,
        itemName: name.trim(),
        itemUnit: unit,
        totalCost: cost ? parseFloat(cost) : 0,
      });
      return;
    }

    if (isDetailsModified || editingDetails) {
      if (!name.trim()) { showToast('Material name is required.', 'error'); return; }
      if (minError) { showToast(minError, 'error'); return; }
      if (detailsCostError) { showToast(detailsCostError, 'error'); return; }
    }

    if (stock) {
      if (addedQty <= 0) { showToast('Added quantity must be greater than 0.', 'error'); return; }
      if (qtyError) { showToast(qtyError, 'error'); return; }
      if (!cost) { showToast('Total cost is required when adding stock.', 'error'); return; }
      if (costError) { showToast(costError, 'error'); return; }
    }

    if (!isDetailsModified && !stock) {
      showToast('Nothing was changed or added. Edit the details or enter a quantity to add.', 'error');
      return;
    }

    const detailsPayload = isDetailsModified || editingDetails
      ? {
          name: name.trim(),
          product_id: productId || null,
          unit,
          minimum_stock: parseFloat(min) || 0,
          cost_per_unit: detailsCost ? parseFloat(detailsCost) : 0,
        }
      : null;
      
    // New field on the restock payload
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
      setExpiry(''); // 👈 Reset form
      onClose();
    } catch (err) {
      showToast(err.message || 'Failed to save', 'error');
      setConfirmPayload(null);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmTitle = confirmPayload?.isNew
    ? 'Confirm New Material'
    : confirmPayload?.detailsPayload && confirmPayload?.restockPayload
      ? 'Confirm Changes'
      : confirmPayload?.restockPayload
        ? 'Confirm Add Stock'
        : 'Confirm Edit';

  const confirmMessage = confirmPayload?.detailsPayload && confirmPayload?.restockPayload
    ? `This will save the new details for "${confirmPayload.itemName}" AND add ${confirmPayload.addedQty} ${confirmPayload.itemUnit}${confirmPayload.totalCost > 0 ? ` (₱${confirmPayload.totalCost.toFixed(2)})` : ''}. Are you sure?`
    : confirmPayload?.restockPayload
      ? `Add ${confirmPayload?.addedQty} ${confirmPayload?.itemUnit} to ${confirmPayload?.itemName}${confirmPayload?.totalCost > 0 ? ` for a total cost of ₱${confirmPayload?.totalCost.toFixed(2)}` : ''}?`
      : `Save the new details for "${confirmPayload?.itemName}"?`;

  return (
    <>
      <Modal isOpen={isOpen} onClose={() => !isSaving && onClose()} title={isEdit ? `Manage Stock — ${material?.name}` : `Add New ${MATERIAL_VIEWS.find(v => v.key === defaultView)?.label ?? 'Material'}`}
        subtitle={isEdit ? `Unit: ${material?.unit}` : `Record a new batch of ${MATERIAL_VIEWS.find(v => v.key === defaultView)?.label?.toLowerCase() ?? 'material'}.`}
        size="lg"
        footer={
          <div className="flex gap-3 justify-end">
            <Button variant="secondary" disabled={isSaving} onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={isSaving} onClick={handleValidate}>
              {isEdit ? 'Save Changes' : 'Save Material'}
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
                <p className="text-[10px] font-bold uppercase tracking-wide text-brand-400">Total Cost of Current Stock</p>
                <p className="text-lg font-black text-brand-800 leading-tight">
                  ₱{((material?.stock || 0) * (material?.costPerUnit || 0)).toFixed(2)}
                  <span className="text-xs font-semibold text-brand-400 ml-1.5">({material?.stock} {material?.unit})</span>
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
                  <div>
                    {materialType === 'celebration' ? (
                      <ProductLinkedNameField
                        value={name}
                        onChange={(nextName, linkedId) => {
                          setName(nextName);
                          setProductId(linkedId ?? '');
                        }}
                        products={products}
                        placeholder="e.g. Tarpaulin (2x3 ft)"
                      />
                    ) : (
                      <Input label="Material Name" required value={name} onChange={e => {
                        setName(e.target.value);
                        setProductId('');
                      }} placeholder="e.g. Small Box (6x6 in)" />
                    )}
                  </div>
                  <div>
                    <Select label="Unit of Measurement" required value={unit} onChange={e => setUnit(e.target.value)}>
                      {STOCK_UNIT_CATEGORIES.map(cat => (
                        <optgroup key={cat.label} label={cat.label}>
                          {cat.units.map(u => <option key={u} value={u}>{u}</option>)}
                        </optgroup>
                      ))}
                    </Select>
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
                    <Input label="Initial Stock Quantity" required type="text" inputMode="decimal" suffix={unit} value={stock} onChange={e => setStock(sanitizeQtyText(e.target.value))} onBlur={() => setStock(current => parseFractionInput(current))} placeholder="e.g. 0.5 or 1/2" />
                    {qtyError && <p className="text-[11px] text-red-600 mt-1 font-medium">{qtyError}</p>}
                  </div>
                  <div>
                    <Input label="Minimum Safety Stock" required type="text" inputMode="decimal" suffix={unit} value={min} onChange={e => setMin(sanitizeNumericText(e.target.value))} placeholder="e.g. 10" />
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
                    <Input label="Total Amount / Receipt" required type="text" inputMode="decimal" value={formatPesoLive(cost)} onChange={e => setCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))} placeholder="₱0.00" />
                    {costError && <p className="text-[11px] text-red-600 mt-1 font-medium">{costError}</p>}
                    {!costError && cost && addedQty > 0 && (
                      <p className="text-[11px] text-brand-400 mt-1 font-medium">≈ ₱{(parseFloat(cost) / addedQty).toFixed(2)} per {unit} ({addedQty} {unit})</p>
                    )}
                  </div>
                  <div>
                    {/* Expiration date input for a new material */}
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
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-500">Material Details</span>
                  
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
                      <div className="p-2.5 bg-white rounded-lg border border-brand-100 min-w-0 col-span-2">
                        <span className="block text-[10px] font-bold uppercase text-brand-400">Material Type</span>
                        <span className="text-sm font-bold text-brand-800 block">
                          {MATERIAL_VIEWS.find(v => v.key === materialType)?.label}
                        </span>
                      </div>
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
                      <div className="p-2.5 bg-white rounded-lg border border-brand-100 min-w-0 col-span-2">
                        <span className="block text-[10px] font-bold uppercase text-brand-400">Material Type</span>
                        <span className="text-sm font-bold text-brand-800 block">
                          {MATERIAL_VIEWS.find(v => v.key === materialType)?.label}
                        </span>
                      </div>
                      <div>
                        {materialType === 'celebration' ? (
                          <ProductLinkedNameField
                            label="Name"
                            value={name}
                            onChange={(nextName, linkedId) => {
                              setName(nextName);
                              setProductId(linkedId ?? '');
                            }}
                            products={products}
                          />
                        ) : (
                          <Input label="Name" required value={name} onChange={e => {
                            setName(e.target.value);
                            setProductId('');
                          }} />
                        )}
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
                  <span className="text-[11px] font-bold uppercase tracking-wider text-brand-800">Add Stock / Quantity</span>
                </div>

                <div className="space-y-3">
                  <div>
                    <Input
                      label="Quantity to Add"
                      type="text" 
                      inputMode="decimal"
                      suffix={material?.unit}
                      value={stock} 
                      onChange={e => setStock(sanitizeQtyText(e.target.value))}
                      onBlur={() => setStock(current => parseFractionInput(current))}
                      placeholder="e.g. 0.5 or 1/2"
                    />
                    {qtyError && <p className="text-[11px] text-red-600 mt-1 font-medium">{qtyError}</p>}
                  </div>

                  <div>
                    <Input 
                      label="Total Amount / Receipt" 
                      type="text" 
                      inputMode="decimal" 
                      value={formatPesoLive(cost)} 
                      onChange={e => setCost(sanitizeNumericText(parseFormattedPeso(e.target.value)))} 
                      placeholder="₱0.00" 
                    />
                    {costError && <p className="text-[11px] text-red-600 mt-1 font-medium">{costError}</p>}
                    {!costError && cost && addedQty > 0 && (
                      <p className="text-[11px] text-brand-400 mt-1 font-medium">≈ ₱{(parseFloat(cost) / addedQty).toFixed(2)} per {material?.unit} ({addedQty} {material?.unit})</p>
                    )}
                  </div>

                  <div>
                    {/* Expiration date input for a restock */}
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

          {isEdit && <RestockHistoryPanel itemName={material?.name} itemType="material" />}
        </div>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmPayload}
        onClose={() => !isSaving && setConfirmPayload(null)}
        onConfirm={executeSave}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={isSaving ? 'Saving...' : 'Yes, I\'m Sure'}
        variant="primary"
      />
    </>
  );
}