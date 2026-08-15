import { useState } from 'react';
import { Search, X } from 'lucide-react';

const CATEGORIES = ['All', 'Pastry', 'Cake', 'Package', 'Celebration Material'];

// --- ORDER SLIP / OPTIONS MODAL ---
function PosProductModal({ product, onClose, onAddToCart }) {
  const [slipAnswers, setSlipAnswers] = useState({});
  const [imageFile, setImageFile] = useState(null);
  const [selectedPriceOptions, setSelectedPriceOptions] = useState({});
  
  // BAGO: State para sa pag-track ng errors
  const [errors, setErrors] = useState({});

  if (!product) return null;

  const hasFields = product.order_slip_fields && product.order_slip_fields.length > 0;
  const isVariable = product.pricing_mode === 'variable' && product.price_matrix?.length > 0;
  const priceGroups = product.price_groups && product.price_groups.length > 0
    ? product.price_groups
    : (isVariable
        ? Object.keys(product.price_matrix[0]?.combo || {}).map(name => ({
            name,
            options: [...new Set(product.price_matrix.map(m => m.combo?.[name]).filter(Boolean))]
          }))
        : []);

  let resolvedPrice = product.price;
  let allGroupsSelected = true;
  let missingCombo = false;

  if (isVariable) {
    allGroupsSelected = priceGroups.every(g => selectedPriceOptions[g.name]);
    if (allGroupsSelected) {
      const match = product.price_matrix.find(entry =>
        Object.entries(entry.combo).every(([k, v]) => selectedPriceOptions[k] === v)
      );
      if (match) resolvedPrice = match.price;
      else missingCombo = true;
    }
  }

  const handleAnswerChange = (label, value) => {
    setSlipAnswers(prev => ({ ...prev, [label]: value }));
    // Aalisin ang error kapag nag-input na si user
    setErrors(prev => ({ ...prev, [label]: false }));
  };

  const handleAdd = () => {
    const newErrors = {};

    // 1. Validation para sa Product Options
    if (isVariable && !allGroupsSelected) {
      priceGroups.forEach(g => {
        if (!selectedPriceOptions[g.name]) {
          newErrors[g.name] = true;
        }
      });
    }

    if (isVariable && missingCombo) {
      return;
    }

    // 2. Validation para sa Customization Details
    if (hasFields) {
      product.order_slip_fields.forEach(field => {
        const isOptional = field.optional === true || field.isOptional === true || field.required === false;
        
        if (!isOptional) {
          const answer = slipAnswers[field.label];
          if (!answer || answer.trim() === '') {
            newErrors[field.label] = true;
          }
        }
      });
    }

    // 3. I-set ang errors kung meron, at pigilan ang pag-add
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onAddToCart({
      ...product,
      qty: 1,
      price: isVariable ? resolvedPrice : product.price,
      selected_price_options: isVariable ? selectedPriceOptions : null,
      order_slip_details: hasFields ? slipAnswers : null,
      inspiration_image: imageFile
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#1F1108]/60 z-[4000] flex items-center justify-center p-4">
      <div className="bg-[#FCFAF9] w-full max-w-[420px] lg:max-w-[620px] rounded-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">

        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 bg-white border-b border-[#EAE4E0] shrink-0 z-10">
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#B7A99F] block mb-1 truncate">{product.category}</span>
            <h2 className="text-xl sm:text-2xl font-serif text-[#3B1F0A] leading-tight mb-1.5 truncate">{product.name}</h2>
            <p className="text-sm font-bold text-[#5A453C]">
              {isVariable ? (allGroupsSelected && !missingCombo ? `₱${Number(resolvedPrice).toLocaleString()}` : 'Select options to see price') : `₱${Number(product.price).toLocaleString()}`}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] hover:text-[#3B1F0A] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 sm:p-6 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">

          {isVariable && (
            <div className="flex flex-col gap-4 mb-6">
              <p className="text-[11px] font-bold text-[#5A453C] uppercase tracking-wider">Product Options</p>
              <div className="flex flex-wrap gap-x-4 gap-y-4">
                {priceGroups.map((group, index) => (
                  <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                    <label className={`text-xs font-semibold mb-1.5 ${errors[group.name] ? 'text-red-500' : 'text-[#8A7264]'}`}>
                      {group.name} *
                    </label>
                    <select
                      className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none transition-colors ${errors[group.name] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`}
                      value={selectedPriceOptions[group.name] || ''}
                      onChange={e => {
                        setSelectedPriceOptions(prev => ({ ...prev, [group.name]: e.target.value }));
                        setErrors(prev => ({ ...prev, [group.name]: false }));
                      }}
                    >
                      <option value="" disabled>Select {group.name}...</option>
                      {group.options.map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                      ))}
                    </select>
                    {errors[group.name] && <span className="text-[10px] text-red-500 mt-1">This field is required</span>}
                  </div>
                ))}
              </div>
              {missingCombo && <p className="text-xs text-red-500 font-semibold mt-2">This combination is unavailable. Please try different options.</p>}
            </div>
          )}

          {hasFields && (
            <div className={`flex flex-col gap-4 mb-6 ${isVariable ? 'border-t border-[#EAE4E0] pt-6' : ''}`}>
              <p className="text-[11px] font-bold text-[#5A453C] uppercase tracking-wider">Customization Details</p>
              <div className="flex flex-wrap gap-x-4 gap-y-4">
                {product.order_slip_fields.map((field, index) => {
                  const isOptional = field.optional === true || field.isOptional === true || field.required === false;
                  const labelText = isOptional ? `${field.label} (Optional)` : `${field.label} *`;

                  if (field.type === 'Select') {
                    return (
                      <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                        <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>
                          {labelText}
                        </label>
                        <select 
                          className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} 
                          onChange={e => handleAnswerChange(field.label, e.target.value)} 
                          defaultValue=""
                        >
                          <option value="" disabled>Select {field.label}...</option>
                          {field.options?.map((opt, i) => (
                            <option key={i} value={opt}>{opt}</option>
                          ))}
                        </select>
                        {errors[field.label] && <span className="text-[10px] text-red-500 mt-1">This field is required</span>}
                      </div>
                    );
                  }
                  if (field.type === 'Textarea') {
                    return (
                      <div key={index} className="flex flex-col w-full basis-full">
                        <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>
                          {labelText}
                        </label>
                        <textarea 
                          placeholder={`Enter ${field.label}...`} 
                          className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none resize-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} 
                          rows={3} 
                          onChange={e => handleAnswerChange(field.label, e.target.value)} 
                        />
                        {errors[field.label] && <span className="text-[10px] text-red-500 mt-1">This field is required</span>}
                      </div>
                    );
                  }
                  return (
                    <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                      <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>
                        {labelText}
                      </label>
                      <input 
                        type={field.type === 'Number' ? 'number' : 'text'} 
                        placeholder={`Enter ${field.label}...`} 
                        className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} 
                        onChange={e => handleAnswerChange(field.label, e.target.value)} 
                      />
                      {errors[field.label] && <span className="text-[10px] text-red-500 mt-1">This field is required</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {product.allow_file_upload && (
            <div className={`mb-2 ${isVariable || hasFields ? 'border-t border-[#EAE4E0] pt-6' : ''}`}>
              <label className="text-xs font-semibold text-[#8A7264] mb-1.5 block">Upload Reference Image (Optional)</label>
              {!imageFile ? (
                <label className="flex items-center w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 text-xs rounded-xl cursor-pointer focus-within:border-[#5A453C] transition-colors">
                  <span className="mr-3 py-1 px-3 rounded-lg border-0 text-[10px] font-bold uppercase bg-white text-[#4A3B36] shrink-0">Choose File</span>
                  <span className="text-[#8A7264] truncate">No file chosen</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="flex items-center justify-between w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 pl-3 rounded-xl">
                  <span className="text-xs text-[#4A3B36] truncate min-w-0 flex-1">{imageFile.name}</span>
                  <button
                    type="button"
                    onClick={() => setImageFile(null)}
                    aria-label="Remove file"
                    className="ml-3 w-6 h-6 rounded-full bg-white text-[#8A7264] flex items-center justify-center shrink-0 hover:bg-[#EAE4E0] hover:text-[#3B1F0A] transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
            </div>
          )}

          <div className={`flex flex-col sm:flex-row-reverse gap-2 ${product.allow_file_upload || isVariable || hasFields ? 'mt-6 pt-6 border-t border-[#EAE4E0]' : ''}`}>
            <button
              onClick={handleAdd}
              disabled={isVariable && missingCombo}
              className={`flex-1 px-4 py-3 rounded-xl text-xs font-bold transition-colors shadow-sm ${isVariable && missingCombo ? 'bg-[#EAE4E0] text-[#8A7264] cursor-not-allowed' : 'bg-[#3B1F0A] text-white hover:bg-[#2A1608]'}`}
            >
              Add to Cart
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-[#DED4CC] rounded-xl text-xs font-bold text-[#5A453C] hover:bg-[#F5EFEB] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PosMenu({ products, activeCategory, setActiveCategory, searchQuery, setSearchQuery, onAddToCart }) {
  const [modal, setModal] = useState(null);
  
  const renderProductGrid = () => {
    const categoriesToRender = activeCategory === 'All' 
      ? CATEGORIES.filter(c => c !== 'All') 
      : [activeCategory];

    return categoriesToRender.map(cat => {
      const catProducts = products.filter(p => p.category === cat);
      if (catProducts.length === 0) return null;

      return (
        <div key={cat} className="mb-8">
          <div className="flex items-center justify-between mb-4 border-b border-[#EAE4E0] pb-2.5">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-[#8A7264] font-bold">{cat}</h3>
            <span className="text-[11px] text-[#B7A99F]">{catProducts.length} items</span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-4">
            {catProducts.map(p => {
              const isStockTracked = p.order_type === 'Pick-up Today' || p.order_type === 'Both';
              const currentStock = p.available_stock ?? p.stock_quantity ?? 0;
              const isSoldOut = isStockTracked && currentStock <= 0;
              
              const isVariable = p.pricing_mode === 'variable' && p.price_matrix?.length > 0;
              const minPrice = isVariable ? Math.min(...p.price_matrix.map(m => m.price)) : p.price;
              
              const isCustomizable = (p.order_slip_fields && p.order_slip_fields.length > 0) || p.allow_file_upload || isVariable;

              return (
                <div key={p.id} className="bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden flex flex-col group shadow-sm relative">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#F5EFEB] shrink-0">
                    <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    
                    {isStockTracked && (
                      <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-md shadow-sm border border-white/20 z-10 backdrop-blur-sm ${isSoldOut ? 'bg-red-500/90 text-white' : 'bg-white/90 text-[#3B1F0A]'}`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {isSoldOut ? 'Sold Out' : `${currentStock} Available`}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 sm:p-4 lg:p-3 flex flex-col flex-1">
                    <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">{p.category}</span>
                    <h3 className="font-bold text-xs sm:text-sm lg:text-xs text-[#3B1F0A] mb-1.5 lg:mb-1.5 leading-snug flex-1 line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] lg:min-h-[2.25rem]">{p.name}</h3>
                    <p className="text-xs sm:text-sm lg:text-xs font-bold text-[#5A453C] mb-2 lg:mb-2">
                      {isVariable ? 'Starting at ' : ''}₱{Number(minPrice).toLocaleString()}
                    </p>
                    <button
                      onClick={() => {
                        if (isSoldOut) return;
                        isCustomizable
                          ? setModal(p)
                          : onAddToCart({ ...p, qty: 1, order_slip_details: null, selected_price_options: null });
                      }}
                      disabled={isSoldOut}
                      className={`w-full py-2 sm:py-2.5 lg:py-2 rounded-full text-[11px] sm:text-xs font-semibold transition-colors ${
                        isSoldOut
                          ? 'bg-[#EAE4E0] text-[#8A7264] cursor-not-allowed'
                          : 'bg-[#3B1F0A] text-white hover:bg-[#2A1608]'
                      }`}
                    >
                      {isSoldOut ? 'Out of Stock' : (isCustomizable ? 'Select Options' : 'Add to Cart')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
      <div className="shrink-0 pb-4">
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A7264]" size={16} />
            <input 
              type="text" 
              placeholder="Search product..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-white border border-[#EAE4E0] rounded-full text-sm focus:outline-none focus:border-[#5A453C] transition-colors"
            />
          </div>
          
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {CATEGORIES.map(cat => (
              <button 
                key={cat} 
                onClick={() => setActiveCategory(cat)}
                className={`px-5 py-2.5 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat 
                    ? 'bg-[#3B1F0A] text-white shadow-sm' 
                    : 'bg-white border border-[#EAE4E0] text-[#8A7264] hover:bg-[#F5EFEB]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin pr-2 pb-10">
        {renderProductGrid()}
      </div>

      {modal && <PosProductModal product={modal} onClose={() => setModal(null)} onAddToCart={onAddToCart} />}
    </div>
  );
}