import { useState, useRef, useEffect, forwardRef } from 'react';
import { Upload, Trash2, Plus, X, Loader2 } from 'lucide-react';

const PRODUCT_CATEGORIES = ['Cake', 'Pastry', 'Package', 'Celebration Material'];

const BLANK_PRODUCT = {
  name: '',
  category: PRODUCT_CATEGORIES[0],
  orderType: 'Both',
  price: '',
  inclusion: '',
  image: '',
  dailyLimit: 0,
  allowFileUpload: false, 
  eventTags: [],
};

const FIELD_TYPES = ['Text', 'Textarea', 'Number', 'Select', 'Multi-select'];
const NEEDS_OPTIONS = ['Select', 'Multi-select'];

function Modal({ isOpen = true, onClose, title, children, footer, size = 'md' }) {
  if (!isOpen) return null;
  const sizeClass = size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-3xl' : 'max-w-lg';
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F1108]/60 backdrop-blur-sm p-4">
      <div className={`bg-[#FCFAF9] rounded-3xl shadow-2xl w-full ${sizeClass} max-h-[92vh] flex flex-col overflow-hidden border border-[#EAE4E0]`}>
        <div className="flex items-center justify-between px-7 py-5 border-b border-[#EAE4E0] bg-white shrink-0">
          <h2 className="text-xl font-serif font-bold text-[#3B1F0A]">{title}</h2>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 sm:px-8 py-6 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && <div className="px-7 py-4 border-t border-[#EAE4E0] bg-white shrink-0">{footer}</div>}
      </div>
    </div>
  );
}

function Button({ variant = 'secondary', size = 'md', className = '', children, ...props }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0';
  const sizes = { sm: 'text-xs px-3.5 py-2', md: 'text-xs px-4 py-2.5', lg: 'text-sm px-6 py-3.5' };
  const variants = {
    dark: 'bg-[#3B1F0A] text-white hover:bg-[#2A1608]',
    secondary: 'bg-white text-[#5A453C] border border-[#DED4CC] hover:bg-[#F5EFEB]',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

function Input({ label, required, className = '', ...props }) {
  return (
    <div className="w-full min-w-0">
      {label && <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">{label} {required && <span className="text-red-500">*</span>}</label>}
      <input className={`w-full border border-[#DED4CC] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#5A453C] bg-white transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`} {...props} />
    </div>
  );
}

function Select({ label, children, className = '', ...props }) {
  return (
    <div className="w-full min-w-0">
      {label && <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">{label}</label>}
      <select className={`w-full border border-[#DED4CC] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#5A453C] bg-white transition-colors ${className}`} {...props}>
        {children}
      </select>
    </div>
  );
}

function Textarea({ label, className = '', ...props }) {
  return (
    <div className="w-full min-w-0">
      {label && <label className="text-[10px] font-bold text-[#8A7264] mb-1.5 block uppercase tracking-wider">{label}</label>}
      <textarea className={`w-full border border-[#DED4CC] rounded-xl px-3.5 py-2.5 text-xs outline-none focus:border-[#5A453C] bg-white transition-colors resize-none ${className}`} {...props} />
    </div>
  );
}

const ProductDetailsForm = forwardRef(function ProductDetailsForm(
  { form, onChange, previewUrl, fileInputRef, onFileSelect, availableTags = [], className = '' },
  ref
) {
  return (
    <div ref={ref} className={`border border-[#EAE4E0] bg-white rounded-3xl p-5 shadow-sm w-full flex flex-col gap-4 min-w-0 ${className}`}>
      {/* 1. Product Image */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mb-1.5">Product Image</p>
        <div className="rounded-2xl overflow-hidden border border-[#DED4CC] bg-[#F5EFEB] flex items-center justify-center w-full aspect-square sm:h-[280px] shadow-sm">
          <img
              src={previewUrl || form.image || 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&q=80'}
              alt="product preview"
              className="w-full h-full object-cover"
              onError={e => { e.target.src = 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&q=80'; }}
          />
        </div>
        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={onFileSelect} />
      </div>

      {/* 2. Choose Image File & Product Name */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="w-full sm:w-auto shrink-0">
          <Button variant="secondary" size="md" className="w-full py-2.5 rounded-xl shadow-sm" onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} /> Choose Image File
          </Button>
        </div>
        <div className="flex-1 w-full">
          <Input label="Product Name" required value={form.name} onChange={e => onChange('name', e.target.value)} placeholder="e.g. Special Birthday Cake" />
        </div>
      </div>

      {/* 3. Category & Order Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select label="Category" value={form.category} onChange={e => onChange('category', e.target.value)}>
          {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Select label="Order Type" value={form.orderType} onChange={e => onChange('orderType', e.target.value)}>
          <option value="Pick-up Today">Pick-up Today</option>
          <option value="Pre-order">Pre-order</option>
          <option value="Both">Both</option>
        </Select>
      </div>

      {/* 4. Inclusion / Description */}
      <Textarea label="Inclusion / Description" value={form.inclusion} onChange={e => onChange('inclusion', e.target.value)} placeholder="e.g. 7x5 Themed Cake w/ Toppers" rows={2} />

      {/* 5. Events Tags */}
      <div className="pt-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mb-2 block">Events / Occasions Tags (Optional)</p>
        
        {availableTags.length === 0 ? (
          <div className="text-xs text-gray-400 italic bg-gray-50 p-3 rounded-xl border border-gray-100">
            No active events in the Event Manager.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {availableTags.map(tag => {
              const isSelected = form.eventTags?.includes(tag);
              const displayTag = tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    const newTags = isSelected 
                      ? form.eventTags.filter(t => t !== tag)
                      : [...(form.eventTags || []), tag];
                    onChange('eventTags', newTags);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
                    isSelected 
                      ? 'bg-[#3B1F0A] text-white border-[#3B1F0A] shadow-md' 
                      : 'bg-[#FCFAF9] text-[#8A7264] border-[#DED4CC] hover:bg-[#F5EFEB]'
                  }`}
                >
                  {displayTag}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-[10px] text-[#8A7264] mt-2 italic font-light">
          Leave blank for everyday products (e.g. pandesal) or let the AI automatically assign seasonal tags based on the product's name.
        </p>
      </div>
    </div>
  );
});

function MultiplePriceOptions({
  pricingMode, onPricingModeChange, price, onPriceChange, priceGroups,
  onAddPriceGroup, onUpdatePriceGroup, onRemovePriceGroup,
  generatedCombos, priceMatrix, onMatrixPriceChange, className = '', style,
}) {
  return (
    <div style={style} className={`border border-[#EAE4E0] bg-white rounded-3xl p-5 shadow-sm w-full flex flex-col ${className}`}>
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <input
          type="checkbox"
          id="variablePriceToggle"
          className="w-4 h-4 accent-[#3B1F0A] rounded cursor-pointer"
          checked={pricingMode === 'variable'}
          onChange={e => onPricingModeChange(e.target.checked ? 'variable' : 'fixed')}
        />
        <label htmlFor="variablePriceToggle" className="text-xs font-bold uppercase tracking-wider text-[#3B1F0A] cursor-pointer select-none">
          Multiple Price Options
        </label>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
      {pricingMode === 'fixed' ? (
        <Input label="Price" required type="number" min="0" value={price} onChange={e => onPriceChange(e.target.value)} placeholder="0" />
      ) : (
        <div className="flex flex-col flex-1 min-h-0 gap-4">
          <div className="shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mb-2">Price Groups (e.g. Size, Theme)</p>
            <div className="flex flex-col gap-2">
              {priceGroups.map(pg => (
                <div key={pg.id} className="flex flex-row items-center gap-2 w-full">
                  <input placeholder="Name (e.g. Size)" value={pg.name} onChange={e => onUpdatePriceGroup(pg.id, 'name', e.target.value)} className="flex-1 min-w-0 text-xs border border-[#DED4CC] rounded-xl px-3 py-2 outline-none focus:border-[#5A453C] bg-white" />
                  <input placeholder="Options (comma-separated)" value={pg.options} onChange={e => onUpdatePriceGroup(pg.id, 'options', e.target.value)} className="flex-[2] min-w-0 text-xs border border-[#DED4CC] rounded-xl px-3 py-2 outline-none focus:border-[#5A453C] bg-white" />
                  <button type="button" onClick={() => onRemovePriceGroup(pg.id)} className="text-red-500 p-2 shrink-0 flex items-center justify-center hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={onAddPriceGroup} className="mt-3 w-full border border-dashed border-[#DED4CC] rounded-xl py-2.5 text-xs font-bold text-[#5A453C] bg-white flex items-center justify-center gap-1.5 hover:bg-[#F5EFEB] transition-colors">
              <Plus size={14} /> Add Price Group
            </button>
          </div>

          {generatedCombos.length > 0 && (
            <div className="border-t border-[#EAE4E0] pt-4 flex flex-col flex-1 min-h-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mb-2 shrink-0">Price Matrix</p>
              <div className="flex flex-col gap-2 pr-1 overflow-y-auto scrollbar-thin flex-1 min-h-0">
                {generatedCombos.map((combo, idx) => {
                  const comboLabel = Object.values(combo).join(' / ');
                  const currentPrice = priceMatrix.find(p => JSON.stringify(p.combo) === JSON.stringify(combo))?.price || '';

                  return (
                    <div key={idx} className="flex items-center justify-between text-xs bg-white p-2.5 rounded-xl border border-[#DED4CC] gap-3">
                      <span className="font-semibold text-[#5A453C] truncate">{comboLabel}</span>
                      <div className="flex items-center gap-2 shrink-0 bg-[#FCFAF9] border border-[#DED4CC] rounded-xl px-3 py-1.5 focus-within:border-[#5A453C]">
                        <span className="font-bold text-[#8A7264] select-none">₱</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="0"
                          value={currentPrice}
                          onChange={e => onMatrixPriceChange(combo, e.target.value)}
                          className="w-16 outline-none text-[#3B1F0A] font-semibold text-right bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}

function getCartesianProduct(groups) {
  const validGroups = groups.filter(g => g.name.trim() && g.options.trim());
  if (validGroups.length === 0) return [];
  
  const parsedGroups = validGroups.map(g => ({
      name: g.name.trim(),
      options: g.options.split(',').map(o => o.trim()).filter(Boolean)
  })).filter(g => g.options.length > 0);

  if (parsedGroups.length === 0) return [];

  return parsedGroups.reduce((acc, currGroup) => {
      const newAcc = [];
      acc.forEach(combo => {
          currGroup.options.forEach(opt => {
              newAcc.push({ ...combo, [currGroup.name]: opt });
          });
      });
      return newAcc;
  }, [{}] ); 
}

export default function ProductModal({ isOpen = true, onClose, product, onSaveSuccess, onDelete }) {
  const initialFormState = product ? {
    name: product.name || '',
    category: product.category || PRODUCT_CATEGORIES[0],
    orderType: product.order_type || 'Both',
    price: product.price || '',
    inclusion: product.inclusion || '',
    image: product.image_url || '',
    dailyLimit: product.daily_limit || 0,
    allowFileUpload: product.allow_file_upload || false,
    eventTags: product.event_tags || []
  } : BLANK_PRODUCT;

  const [form, setForm] = useState(initialFormState);
  const [fields, setFields] = useState(product?.order_slip_fields || []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  
  const [exceptionDate, setExceptionDate] = useState('');
  const [exceptionSlots, setExceptionSlots] = useState(0);
  const [exceptions, setExceptions] = useState(product?.dateExceptions || []);
  
  const [pricingMode, setPricingMode] = useState(product?.pricing_mode || 'fixed');
  const [priceGroups, setPriceGroups] = useState(
    product?.price_groups?.map(g => ({ id: crypto.randomUUID(), name: g.name, options: g.options.join(', ') })) || []
  );
  const [priceMatrix, setPriceMatrix] = useState(product?.price_matrix || []);

  const [availableTags, setAvailableTags] = useState([]);

  const fileInputRef = useRef(null);
  const isEditing = !!product?.id;

  const detailsCardRef = useRef(null);
  const [detailsHeight, setDetailsHeight] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setForm(product ? {
        name: product.name || '',
        category: product.category || PRODUCT_CATEGORIES[0],
        orderType: product.order_type || 'Both',
        price: product.price || '',
        inclusion: product.inclusion || '',
        image: product.image_url || '',
        dailyLimit: product.daily_limit || 0,
        allowFileUpload: product.allow_file_upload || false,
        eventTags: product.event_tags || []
      } : BLANK_PRODUCT);
      
      setFields(product?.order_slip_fields || []);
      setPricingMode(product?.pricing_mode || 'fixed');
      setPriceGroups(product?.price_groups?.map(g => ({ id: crypto.randomUUID(), name: g.name, options: g.options.join(', ') })) || []);
      setPriceMatrix(product?.price_matrix || []);
      setExceptions(product?.dateExceptions || []);
      setPreviewUrl('');
      setSelectedFile(null);
    }
  }, [product, isOpen]);

  // Fetch Tags mula sa updated backend URL (/events)
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products/events?active=true`);
        const data = await response.json();
        if (data.success && data.data) {
          const fetchedTags = data.data.map(event => event.event_tag).filter(Boolean);
          setAvailableTags([...new Set(fetchedTags)]);
        }
      } catch (error) {
        console.error("Failed to fetch event tags:", error);
      }
    };
    if (isOpen) {
      fetchTags();
    }
  }, [isOpen]);

  useEffect(() => {
    const el = detailsCardRef.current;
    if (!el) return;
    const measure = () => setDetailsHeight(el.getBoundingClientRect().height);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  const handleChange = (field, val) => setForm(prev => ({ ...prev, [field]: val }));

  useEffect(() => {
    return () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const addField = () => setFields(prev => [...prev, { id: crypto.randomUUID(), label: '', type: 'Text', options: '' }]);
  const updateField = (id, key, value) => setFields(prev => prev.map(f => (f.id === id ? { ...f, [key]: value } : f)));
  const removeField = (id) => setFields(prev => prev.filter(f => f.id !== id));

  const addException = () => {
    if (!exceptionDate) return;
    setExceptions(prev => [...prev.filter(e => e.date !== exceptionDate), { date: exceptionDate, slots: Number(exceptionSlots) }]);
    setExceptionDate(''); setExceptionSlots(0);
  };
  const removeException = (date) => setExceptions(prev => prev.filter(e => e.date !== date));

  const addPriceGroup = () => setPriceGroups(prev => [...prev, { id: crypto.randomUUID(), name: '', options: '' }]);
  const updatePriceGroup = (id, key, value) => setPriceGroups(prev => prev.map(g => (g.id === id ? { ...g, [key]: value } : g)));
  const removePriceGroup = (id) => setPriceGroups(prev => prev.filter(g => g.id !== id));
  
  const handleMatrixPriceChange = (combo, value) => {
    setPriceMatrix(prev => {
        const comboKey = JSON.stringify(combo);
        const existingIdx = prev.findIndex(p => JSON.stringify(p.combo) === comboKey);
        if (existingIdx >= 0) {
            const next = [...prev];
            next[existingIdx].price = value;
            return next;
        }
        return [...prev, { combo, price: value }];
    });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    handleChange('image', ''); 
  };

  const handleSave = async () => {
    if (!form.name) {
        alert("Please fill in the Product Name.");
        return;
    }

    let finalPriceMatrix = [];
    let finalPriceGroups = [];
    let derivedBasePrice = Number(form.price);

    if (pricingMode === 'fixed') {
        if (form.price === '' || isNaN(Number(form.price)) || Number(form.price) < 0) {
            alert("Please set a valid positive Price for the product.");
            return;
        }
    }

    if (pricingMode === 'variable') {
        const combos = getCartesianProduct(priceGroups);
        if (combos.length === 0) {
            alert("Please add at least one Price Group with valid options.");
            return;
        }

        for (const combo of combos) {
            const match = priceMatrix.find(p => JSON.stringify(p.combo) === JSON.stringify(combo));
            if (!match || match.price === '' || isNaN(Number(match.price)) || Number(match.price) < 0) {
                alert(`Please set a valid positive price for combination: ${Object.values(combo).join(' / ')}`);
                return;
            }
            finalPriceMatrix.push({ combo, price: Number(match.price) });
        }

        finalPriceGroups = priceGroups.map(g => ({
            name: g.name.trim(),
            options: g.options.split(',').map(o => o.trim()).filter(Boolean)
        }));

        derivedBasePrice = Math.min(...finalPriceMatrix.map(m => m.price));
    }

    setIsSubmitting(true);
    let finalImageUrl = form.image; 

    try {
        if (selectedFile) {
            const formData = new FormData();
            formData.append('image', selectedFile);

            const uploadResponse = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products/upload-image`, {
                method: 'POST',
                body: formData,
            });
            const uploadData = await uploadResponse.json();

            if (uploadData.success) {
                finalImageUrl = uploadData.url; 
            } else {
                throw new Error(uploadData.message || 'Image upload failed.');
            }
        }

        const cleanFields = fields
        .filter(f => f.label.trim())
        .map(f => ({
            id: f.id,
            label: f.label.trim(),
            type: f.type,
            options: NEEDS_OPTIONS.includes(f.type) ? f.options.split(',').map(o => o.trim()).filter(Boolean) : [],
        }));

        const payload = {
            name: form.name,
            category: form.category,
            order_type: form.orderType, 
            price: derivedBasePrice, 
            inclusion: form.inclusion,
            image_url: finalImageUrl, 
            daily_limit: Number(form.dailyLimit), 
            allow_file_upload: form.allowFileUpload,
            order_slip_fields: cleanFields, 
            pricing_mode: pricingMode,
            price_groups: finalPriceGroups,
            price_matrix: finalPriceMatrix,
            event_tags: form.eventTags || [] 
        };

        const saveUrl = isEditing
            ? `${import.meta.env.VITE_API_URL}/online-ordering/products/${product.id}`
            : `${import.meta.env.VITE_API_URL}/online-ordering/products/add`;

        const response = await fetch(saveUrl, {
            method: isEditing ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.success) {
            alert('Product saved successfully!');
            if (onSaveSuccess) onSaveSuccess(data.data); 
            if (onClose) onClose();
        } else {
            throw new Error(data.message || 'Error saving product details.');
        }
    } catch (error) {
        console.error("Save Error:", error);
        alert(`Failed to save: ${error.message}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  const generatedCombos = pricingMode === 'variable' ? getCartesianProduct(priceGroups) : [];

  const handleDeleteClick = () => {
    if (!isEditing || !onDelete) return;
    if (window.confirm(`Are you sure you want to delete "${form.name}"? This cannot be undone.`)) {
      onDelete(product.id);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose || (() => window.history.back())} title={isEditing ? `Edit Product` : 'Add Product'} size="xl"
      footer={
        <div className="flex items-center justify-between w-full">
          {isEditing ? <Button variant="danger" onClick={handleDeleteClick} disabled={isSubmitting}>Delete Product</Button> : <div></div>}
          <div className="flex gap-3 ml-auto">
            <Button variant="secondary" onClick={onClose || (() => window.history.back())} disabled={isSubmitting}>Close</Button>
            <Button variant="dark" onClick={handleSave} disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 size={16} className="animate-spin" /> Saving Data...</> : "Save Changes"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="w-full flex flex-col gap-6 lg:gap-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
          <ProductDetailsForm
            ref={detailsCardRef}
            form={form}
            onChange={handleChange}
            previewUrl={previewUrl}
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            availableTags={availableTags} 
          />

          <MultiplePriceOptions
            style={detailsHeight ? { height: detailsHeight, maxHeight: detailsHeight } : undefined}
            pricingMode={pricingMode}
            onPricingModeChange={setPricingMode}
            price={form.price}
            onPriceChange={val => handleChange('price', val)}
            priceGroups={priceGroups}
            onAddPriceGroup={addPriceGroup}
            onUpdatePriceGroup={updatePriceGroup}
            onRemovePriceGroup={removePriceGroup}
            generatedCombos={generatedCombos}
            priceMatrix={priceMatrix}
            onMatrixPriceChange={handleMatrixPriceChange}
          />
        </div>

        <div className="border border-[#EAE4E0] bg-white rounded-3xl p-5 shadow-sm w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-[#3B1F0A]">Order Slip Fields</p>
            <div className="flex items-center gap-2.5 bg-[#F5EFEB] px-3.5 py-2 rounded-xl w-fit">
                <input type="checkbox" id="uploadToggle" className="w-4 h-4 accent-[#3B1F0A] rounded cursor-pointer" checked={form.allowFileUpload} onChange={e => handleChange('allowFileUpload', e.target.checked)} />
                <label htmlFor="uploadToggle" className="text-xs font-bold text-[#5A453C] cursor-pointer select-none">Allow Customer to Upload Reference Image</label>
            </div>
          </div>
          <p className="text-xs text-[#8A7264] mb-4">
            Questions customers answer when adding this product to their cart (e.g. Cake Message, Color Motif).
          </p>

          <div className="flex flex-col gap-2.5">
            {fields.map(field => (
              <div key={field.id} className="flex flex-col sm:flex-row items-center gap-2.5 w-full bg-[#FCFAF9] p-3 rounded-2xl border border-[#DED4CC]">
                <input value={field.label} onChange={e => updateField(field.id, 'label', e.target.value)} placeholder="Field Label (e.g. Cake Message)" className="w-full sm:flex-[1.5] min-w-0 text-xs border border-[#DED4CC] rounded-xl px-3 py-2 outline-none focus:border-[#5A453C] bg-white" />
                <select value={field.type} onChange={e => updateField(field.id, 'type', e.target.value)} className="w-full sm:flex-1 min-w-0 text-xs border border-[#DED4CC] rounded-xl px-3 py-2 outline-none focus:border-[#5A453C] bg-white">
                  {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input value={field.options} onChange={e => updateField(field.id, 'options', e.target.value)} placeholder={NEEDS_OPTIONS.includes(field.type) ? 'Comma-separated choices' : '—'} disabled={!NEEDS_OPTIONS.includes(field.type)} className="w-full sm:flex-[1.5] min-w-0 text-xs border border-[#DED4CC] rounded-xl px-3 py-2 outline-none focus:border-[#5A453C] disabled:bg-[#F5EFEB] bg-white" />
                <button type="button" onClick={() => removeField(field.id)} className="text-red-500 p-2 shrink-0 flex items-center justify-center hover:bg-red-50 rounded-xl transition-colors self-end sm:self-auto"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>

          <button type="button" onClick={addField} className="mt-4 w-full border border-dashed border-[#DED4CC] rounded-2xl py-2.5 text-xs font-bold text-[#5A453C] bg-white flex items-center justify-center gap-1.5 hover:bg-[#F5EFEB] transition-colors">
            <Plus size={14} /> Add Order Slip Field
          </button>
        </div>

        <div className="border border-[#EAE4E0] bg-white rounded-3xl p-5 shadow-sm w-full">
          <div className="flex items-center gap-3 mb-2">
            <input type="checkbox" id="limitToggle" className="w-4 h-4 accent-[#3B1F0A] rounded cursor-pointer" defaultChecked={form.dailyLimit > 0} />
            <label htmlFor="limitToggle" className="text-xs font-bold uppercase tracking-wider text-[#3B1F0A] select-none cursor-pointer">Pre-Order Limits</label>
          </div>
          <p className="text-xs text-[#8A7264] mb-4">
            Set maximum order capacities per day or assign custom date exceptions.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 lg:gap-6 items-start">
            <div className="min-w-0 bg-[#FCFAF9] p-4 rounded-2xl border border-[#DED4CC]">
              <Input label="Default Daily Capacity (Slots)" type="number" min="0" value={form.dailyLimit} onChange={e => handleChange('dailyLimit', e.target.value)} placeholder="0" />
            </div>

            <div className="min-w-0 bg-[#FCFAF9] p-4 rounded-2xl border border-[#DED4CC]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mb-1.5">Date Exceptions</p>
              <div className="flex flex-row items-center gap-2 mb-3 w-full">
                <input type="date" value={exceptionDate} onChange={e => setExceptionDate(e.target.value)} className="flex-1 min-w-0 text-xs border border-[#DED4CC] rounded-xl px-3 py-2 outline-none focus:border-[#5A453C] bg-white" />
                <input type="number" min="0" value={exceptionSlots} onChange={e => setExceptionSlots(e.target.value)} className="w-20 shrink-0 text-xs border border-[#DED4CC] rounded-xl px-3 py-2 outline-none focus:border-[#5A453C] bg-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" placeholder="Slots" />
              </div>
              <button onClick={addException} className="w-full border border-dashed border-[#DED4CC] rounded-xl py-2.5 text-xs font-bold text-[#5A453C] bg-white hover:bg-[#F5EFEB] transition-colors">
                + Add Date Exception
              </button>
              {exceptions.length > 0 && (
                <div className="mt-3 max-h-32 overflow-y-auto pr-1 scrollbar-thin flex flex-col gap-1.5">
                  {exceptions.map(ex => (
                    <div key={ex.date} className="flex items-center justify-between text-xs font-semibold text-[#3B1F0A] py-2 px-3 bg-white border border-[#DED4CC] rounded-xl">
                      <span>{ex.date}</span>
                      <span>{ex.slots} slots</span>
                      <button onClick={() => removeException(ex.date)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </Modal>
  );
}