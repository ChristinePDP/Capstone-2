import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, X, Package, Plus, ChevronRight, ArrowUp } from 'lucide-react';

const BASE_CATEGORIES = ['All', 'Pastry', 'Cake', 'Package', 'Celebration Material'];

// ─────────────────────────────────────────────────────────────
// Same dynamic bundle logic ginagamit ng customer-facing Menu.jsx —
// kinokopya dito para may Promo Bundle rin ang POS: fetch mula sa
// product_bundle table (parehong endpoint, `/online-ordering/products/bundles`),
// i-explode bawat bundle sa mga component product niya, at gawan ng sariling
// "Promo Bundle" category kapag may active bundles.
// ─────────────────────────────────────────────────────────────

// Builds "Product A (Option, Option) + Product B" text for a bundle — same
// logic as the admin Promo Bundles card at ang customer Menu.jsx.
function getBundleDescription(bundle) {
  const products = bundle.products || [];
  const bundleOptions = bundle.bundle_options || {};
  if (products.length === 0) return '';

  return products.map(p => {
    const opts = bundleOptions[p.id];
    if (opts && Object.keys(opts).length > 0) {
      const optionStrings = Object.values(opts).join(', ');
      return `${p.name} (${optionStrings})`;
    }
    return p.name;
  }).join(' + ');
}

// I-de-derive ang order_type ng isang BUNDLE base sa mga products na talagang
// laman nito — kapag may kahit isang 'Pre-order' na product sa loob, dapat
// 'Pre-order' na rin ang buong bundle kahit may ibang 'Pick-up Today'/'Both'.
function resolveBundleOrderType(products = []) {
  if (products.some(p => p.order_type === 'Pre-order')) return 'Pre-order';
  if (products.some(p => p.order_type === 'Pick-up Today')) return 'Pick-up Today';
  return 'Both';
}

// Bundle Image Grid — parehong component gaya ng sa Menu.jsx
function BundleMenuImage({ products = [], customImageUrl }) {
  if (customImageUrl) {
    return <img src={customImageUrl} alt="Bundle" className="w-full h-full object-cover transition-transform group-hover:scale-105" />;
  }

  if (products.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#F5EFEB]">
        <Package size={28} className="text-[#DED4CC]" />
      </div>
    );
  }

  const MAX_IMAGE_SLOTS = 3;
  const showCountTile = products.length > MAX_IMAGE_SLOTS;
  const imageSlots = showCountTile ? products.slice(0, MAX_IMAGE_SLOTS - 1) : products;
  const extraCount = products.length - imageSlots.length;
  const segmentCount = imageSlots.length + (showCountTile ? 1 : 0);

  return (
    <div className="relative w-full h-full flex transition-transform group-hover:scale-105">
      {imageSlots.map((p, idx) => {
        const img = p.image_url || p.image;
        return (
          <div key={p.id ?? idx} className="flex-1 h-full relative overflow-hidden">
            {img ? (
              <img src={img} alt={p.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#F5EFEB] flex items-center justify-center">
                <Package size={22} className="text-[#DED4CC]" />
              </div>
            )}
          </div>
        );
      })}

      {showCountTile && (
        <div className="flex-1 h-full bg-[#3B1F0A] flex flex-col items-center justify-center text-white">
          <span className="text-lg font-extrabold leading-none">+{extraCount}</span>
          <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">more</span>
        </div>
      )}

      {Array.from({ length: segmentCount - 1 }).map((_, i) => (
        <div
          key={i}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-6 h-6 rounded-full bg-white shadow-md flex items-center justify-center"
          style={{ left: `${(100 / segmentCount) * (i + 1)}%` }}
        >
          <Plus size={13} className="text-[#3B1F0A]" strokeWidth={3} />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Quantity tracking helpers — parehong logic gaya ng sa customer-facing
// Menu.jsx. Dating order_type ('Pick-up Today'/'Both') lang ang tinitignan
// dito, kaya Pre-order products (na may daily_limit) ay walang badge, walang
// sold-out state, at hindi nasasama sa sorting. Ngayon parehong daily_limit
// (Pre-order slots) at stock_quantity (Pick-up Today produced stock) ang
// sinusuri: kung may laman (di null, > 0) ang daily_limit, ITO ang
// babasahin kahit may laman din ang stock_quantity; kung wala, babalik sa
// stock_quantity.
// ─────────────────────────────────────────────────────────────
function hasDailyLimitSet(item) {
  return item?.daily_limit !== null && item?.daily_limit !== undefined && Number(item.daily_limit) > 0;
}

function isQuantityTracked(item) {
  if (!item) return false;
  if (item.type === 'bundle') return item.is_tracked; 
  return hasDailyLimitSet(item) || (item.stock_quantity !== null && item.stock_quantity !== undefined);
}

function getQuantityLimit(item) {
  if (item.type === 'bundle') return item.available_stock;
  const basis = hasDailyLimitSet(item) ? item.daily_limit : item.stock_quantity;
  return item.available_stock ?? basis ?? 0;
}

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

// --- BUNDLE STEPPER MODAL ---
// Parehong stepper-per-component UX gaya ng Menu.jsx's BundleModal — dinadaan
// dito ang cashier sa bawat product na laman ng bundle para masagutan ang
// order slip fields nito bago ma-add sa cart bilang isang bundle line.
function PosBundleModal({ bundle, onClose, onAddToCart }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [bundleAnswers, setBundleAnswers] = useState({});
  const [bundleImages, setBundleImages] = useState({}); // { [productId]: File }
  const products = bundle.products || [];

  if (!bundle || products.length === 0) return null;

  const currentProduct = products[currentStep];
  const hasFields = currentProduct.order_slip_fields && currentProduct.order_slip_fields.length > 0;
  const allowsImageUpload = Boolean(currentProduct.allow_file_upload);
  const isLastStep = currentStep === products.length - 1;

  const handleAnswerChange = (label, value) => {
    setBundleAnswers(prev => ({
      ...prev,
      [currentProduct.id]: { ...(prev[currentProduct.id] || {}), [label]: value }
    }));
  };

  const handleImageChange = (file) => {
    setBundleImages(prev => ({ ...prev, [currentProduct.id]: file }));
  };

  const handleNext = () => {
    if (hasFields) {
      const missingFields = currentProduct.order_slip_fields.filter(field => {
        const isOptional = field.optional === true || field.isOptional === true || field.required === false;
        if (isOptional) return false;
        const answer = bundleAnswers[currentProduct.id]?.[field.label];
        return !answer || answer.trim() === '';
      });
      if (missingFields.length > 0) {
        alert(`Mangyaring sagutan ang lahat ng required fields para sa ${currentProduct.name}.`);
        return;
      }
    }

    if (!isLastStep) {
      setCurrentStep(prev => prev + 1);
    } else {
      const hasAnyImage = Object.values(bundleImages).some(Boolean);
      onAddToCart({
        ...bundle,
        qty: 1,
        price: bundle.price,
        selected_price_options: null,
        order_slip_details: bundleAnswers,
        inspiration_image: hasAnyImage ? bundleImages : null
      });
      onClose();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(prev => prev - 1);
  };

  return (
    <div className="fixed inset-0 bg-[#1F1108]/60 z-[4000] flex items-center justify-center p-4">
      <div className="bg-[#FCFAF9] w-full max-w-[420px] lg:max-w-[500px] rounded-2xl flex flex-col shadow-xl overflow-hidden">

        <div className="flex flex-col gap-2 p-5 bg-white border-b border-[#EAE4E0] shrink-0 z-10">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#B7A99F] block mb-1">Promo Bundle</span>
              <h2 className="text-xl font-serif text-[#3B1F0A] leading-tight truncate">{bundle.name}</h2>
              <p className="text-sm font-bold text-[#5A453C]">₱{Number(bundle.price).toLocaleString()}</p>
              <p className="text-xs text-[#8A7264] leading-snug mt-1">{getBundleDescription(bundle)}</p>
            </div>
            <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] transition-colors"><X size={18} /></button>
          </div>

          <div className="flex items-center gap-2 mt-2">
            {products.map((_, idx) => (
              <div key={idx} className={`h-1.5 flex-1 rounded-full ${idx <= currentStep ? 'bg-[#3B1F0A]' : 'bg-[#EAE4E0]'}`} />
            ))}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mt-1">
            Item {currentStep + 1} of {products.length}: <span className="text-[#3B1F0A]">{currentProduct.name}</span>
          </p>
        </div>

        <div className="p-5 flex-1 overflow-y-auto overscroll-contain scrollbar-thin max-h-[60vh]">
          {!hasFields && !allowsImageUpload ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Package size={32} className="text-[#DED4CC] mb-3" />
              <p className="text-sm font-semibold text-[#5A453C]">No customization needed for this item.</p>
              <p className="text-xs text-[#8A7264] mt-1">You can proceed to the next item.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {hasFields && currentProduct.order_slip_fields.map((field, index) => {
                const isOptional = field.optional === true || field.isOptional === true || field.required === false;
                const labelText = isOptional ? `${field.label} (Optional)` : `${field.label} *`;

                if (field.type === 'Select') {
                  return (
                    <div key={index} className="flex flex-col w-full">
                      <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{labelText}</label>
                      <select
                        className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] transition-colors"
                        value={bundleAnswers[currentProduct.id]?.[field.label] || ''}
                        onChange={e => handleAnswerChange(field.label, e.target.value)}
                      >
                        <option value="" disabled>Select {field.label}...</option>
                        {field.options?.map((opt, i) => (
                          <option key={i} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  );
                }
                if (field.type === 'Textarea') {
                  return (
                    <div key={index} className="flex flex-col w-full">
                      <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{labelText}</label>
                      <textarea
                        placeholder={`Enter ${field.label}...`}
                        className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] resize-none transition-colors"
                        rows={3}
                        value={bundleAnswers[currentProduct.id]?.[field.label] || ''}
                        onChange={e => handleAnswerChange(field.label, e.target.value)}
                      />
                    </div>
                  );
                }
                return (
                  <div key={index} className="flex flex-col w-full">
                    <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{labelText}</label>
                    <input
                      type={field.type === 'Number' ? 'number' : 'text'}
                      placeholder={`Enter ${field.label}...`}
                      className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] transition-colors"
                      value={bundleAnswers[currentProduct.id]?.[field.label] || ''}
                      onChange={e => handleAnswerChange(field.label, e.target.value)}
                    />
                  </div>
                );
              })}

              {allowsImageUpload && (
                <div className={hasFields ? 'border-t border-[#EAE4E0] pt-4' : ''}>
                  <label className="text-xs font-semibold text-[#8A7264] mb-1.5 block">Upload Reference Image (Optional)</label>

                  {!bundleImages[currentProduct.id] ? (
                    <label className="flex items-center w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 text-xs rounded-xl cursor-pointer focus-within:border-[#5A453C] transition-colors">
                      <span className="mr-3 py-1 px-3 rounded-lg border-0 text-[10px] font-bold uppercase bg-white text-[#4A3B36] shrink-0">Choose File</span>
                      <span className="text-[#8A7264] truncate">No file chosen</span>
                      <input type="file" accept="image/*" onChange={(e) => handleImageChange(e.target.files?.[0] || null)} className="hidden" />
                    </label>
                  ) : (
                    <div className="flex items-center justify-between w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 pl-3 rounded-xl">
                      <span className="text-xs text-[#4A3B36] truncate min-w-0 flex-1">{bundleImages[currentProduct.id].name}</span>
                      <button type="button" onClick={() => handleImageChange(null)} aria-label="Remove file" className="ml-3 w-6 h-6 rounded-full bg-white text-[#8A7264] flex items-center justify-center shrink-0 hover:bg-[#EAE4E0] hover:text-[#3B1F0A] transition-colors">
                        <X size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 p-5 border-t border-[#EAE4E0] bg-white shrink-0">
          <button
            onClick={currentStep === 0 ? onClose : handleBack}
            className="px-5 py-3 border border-[#DED4CC] rounded-xl text-xs font-bold text-[#5A453C] hover:bg-[#F5EFEB] transition-colors"
          >
            {currentStep === 0 ? 'Cancel' : 'Back'}
          </button>

          <button
            onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-colors shadow-sm bg-[#3B1F0A] text-white hover:bg-[#2A1608]"
          >
            {isLastStep ? 'Add Bundle to Order' : 'Next Item'}
            {!isLastStep && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PosMenu({ products, activeCategory, setActiveCategory, searchQuery, setSearchQuery, onAddToCart }) {
  const [modal, setModal] = useState(null);
  const [bundles, setBundles] = useState([]);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const productListRef = useRef(null);

  const BACK_TO_TOP_THRESHOLD = 400;

  const checkScrollPosition = () => {
    const windowScrollY = window.scrollY || document.documentElement.scrollTop;
    const listScrollY = productListRef.current ? productListRef.current.scrollTop : 0;
    setShowBackToTop(windowScrollY > BACK_TO_TOP_THRESHOLD || listScrollY > BACK_TO_TOP_THRESHOLD);
  };

  useEffect(() => {
    window.addEventListener('scroll', checkScrollPosition, { passive: true });
    return () => window.removeEventListener('scroll', checkScrollPosition);
  }, []);

  const handleBackToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    productListRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Fetch mula sa parehong public bundles endpoint na ginagamit ng
  // customer-facing Menu.jsx — para makita rin ng cashier ang mga
  // active Promo Bundle sa POS, kasama ang lahat ng laman nito.
  useEffect(() => {
    const fetchBundles = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products/bundles`);
        if (!res.ok) return;
        const json = await res.json();
        setBundles(Array.isArray(json.data) ? json.data : []);
      } catch (error) {
        console.error('[POS MENU] Failed to fetch bundles:', error);
      }
    };
    fetchBundles();
  }, []);

  // I-map ang raw bundle rows papunta sa parehong shape na ginagamit sa
  // product grid (type: 'bundle', products: [...]) — same transform gaya ng
  // Menu.jsx, gamit ang `products` prop (regular products, kasama ang
  // available_stock) para ma-resolve ang bundle components.
  const bundleItems = useMemo(() => {
    return bundles
      .filter(b => b.is_active && b.is_within_date_range !== false)
      .map(b => {
        const fallbackImage = b.products && b.products.length > 0 ? (b.products[0].image_url || b.products[0].image) : null;
        const bundleProducts = (b.product_ids || []).map(id => products.find(p => p.id === id)).filter(Boolean);

        const trackedComponents = bundleProducts.filter(p => hasDailyLimitSet(p) || (p.stock_quantity !== null && p.stock_quantity !== undefined));
        const isTracked = trackedComponents.length > 0;
        const bundleStock = isTracked
          ? Math.min(...trackedComponents.map(p => p.available_stock ?? (hasDailyLimitSet(p) ? p.daily_limit : p.stock_quantity) ?? 0))
          : 999;

        return {
          id: `bundle-${b.id}`,
          name: b.bundle_name,
          category: 'Promo Bundle',
          price: Number(b.bundle_price || b.discounted_price || 0),
          original_price: Number(b.original_total || 0),
          discount_percent: Number(b.discount_percent || 0),
          event_tag: b.event_tag || null,
          bundle_options: b.bundle_options || {},
          image_url: b.custom_image_url || fallbackImage,
          custom_image_url: b.custom_image_url,
          products: bundleProducts,
          order_type: resolveBundleOrderType(bundleProducts),
          pricing_mode: 'fixed',
          
          available_stock: Math.max(0, bundleStock),
          is_tracked: isTracked,
          
          type: 'bundle',
          bundleId: b.id,
          order_slip_fields: [],
          price_groups: [],
          price_matrix: []
        };
      });
  }, [bundles, products]);

  // Bundles ay hindi galing sa `/pos/products?search=` (hiwalay itong
  // endpoint), kaya i-filter na lang ito sa client side base sa searchQuery,
  // para tumugma sa filtering na ginagawa na ng backend sa regular products.
  const visibleBundleItems = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return bundleItems;
    return bundleItems.filter(b => b.name.toLowerCase().includes(q));
  }, [bundleItems, searchQuery]);

  const displayItems = useMemo(() => [...visibleBundleItems, ...products], [visibleBundleItems, products]);

  const categories = useMemo(() => {
    return bundleItems.length > 0
      ? ['All', 'Promo Bundle', ...BASE_CATEGORIES.slice(1)]
      : BASE_CATEGORIES;
  }, [bundleItems.length]);
  
  const renderProductGrid = () => {
    const categoriesToRender = activeCategory === 'All' 
      ? categories.filter(c => c !== 'All') 
      : [activeCategory];

    // Kapag naghahanap at walang tumugmang product sa kahit anong category,
    // ipakita ang isang centered empty-state message sa halip na blangkong grid.
    const hasAnyMatch = categoriesToRender.some(cat => displayItems.some(p => p.category === cat));
    if (isSearching && !hasAnyMatch) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-20 px-6">
          <div className="w-14 h-14 rounded-full bg-[#F5EFEB] flex items-center justify-center mb-4">
            <Search size={22} className="text-[#B7A99F]" />
          </div>
          <p className="text-sm font-semibold text-[#3B1F0A] mb-1">No products found</p>
          <p className="text-xs text-[#8A7264] max-w-xs">
            We couldn't find anything matching "{searchQuery.trim()}". Try a different keyword or check your spelling.
          </p>
        </div>
      );
    }

    return categoriesToRender.map(cat => {
      const catProducts = displayItems.filter(p => p.category === cat);
      if (catProducts.length === 0) return null;

      // --- BAGONG CODE PARA SA SORTING ---
      // Ihihiwalay natin at ilalagay sa dulo ang mga sold out
      const sortedCatProducts = [...catProducts].sort((a, b) => {
        const isSoldOutA = isQuantityTracked(a) && getQuantityLimit(a) <= 0;
        const isSoldOutB = isQuantityTracked(b) && getQuantityLimit(b) <= 0;
        
        if (isSoldOutA && !isSoldOutB) return 1;  // Ilagay si A sa huli
        if (!isSoldOutA && isSoldOutB) return -1; // Ilagay si B sa huli
        return 0; // Walang babaguhin sa pwesto kung parehas available o parehas sold out
      });
      // -----------------------------------

      return (
        <div key={cat} className="mb-8">
          <div className="flex items-center justify-between mb-4 border-b border-[#EAE4E0] pb-2.5">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-[#8A7264] font-bold">{cat}</h3>
            <span className="text-[11px] text-[#B7A99F]">{catProducts.length} items</span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-4">
            {sortedCatProducts.map(p => {
              const isBundle = p.type === 'bundle';
              const isStockTracked = isQuantityTracked(p);
              const currentStock = getQuantityLimit(p);
              const isSoldOut = isStockTracked && currentStock <= 0;
              
              const isVariable = p.pricing_mode === 'variable' && p.price_matrix?.length > 0;
              const minPrice = isVariable ? Math.min(...p.price_matrix.map(m => m.price)) : p.price;
              
              // Bundles laging dumadaan sa stepper modal para makita ang bawat
              // component product — parehong rule gaya ng Menu.jsx.
              const isCustomizable = isBundle || (p.order_slip_fields && p.order_slip_fields.length > 0) || p.allow_file_upload || isVariable;

              return (
                <div key={p.id} className="bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden flex flex-col group shadow-sm relative">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#F5EFEB] shrink-0">
                    {isBundle ? (
                      <BundleMenuImage products={p.products} customImageUrl={p.custom_image_url} />
                    ) : (
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                    )}

                    {isStockTracked && (
                      <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-md shadow-sm border border-white/20 z-10 backdrop-blur-sm ${isSoldOut ? 'bg-red-500/90 text-white' : 'bg-white/90 text-[#3B1F0A]'}`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {isSoldOut ? 'Sold Out' : `${currentStock} Available`}
                        </span>
                      </div>
                    )}

                    {isBundle && p.discount_percent > 0 && (
                      <div className="absolute top-2 right-2 z-10">
                        <span className="text-[10px] font-bold bg-[#3B1F0A] text-white px-2 py-1 rounded-full shadow-sm">
                          -{p.discount_percent}%
                        </span>
                      </div>
                    )}

                    {isBundle && p.event_tag && (
                      <div className="absolute bottom-2 left-2 z-10">
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-white/90 text-[#3B1F0A] px-2.5 py-1 rounded-full shadow-sm backdrop-blur-sm">
                          {p.event_tag}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="p-3 sm:p-4 lg:p-3 flex flex-col flex-1">
                    <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">{p.category}</span>
                    <div className="flex-1 mb-1.5 lg:mb-1.5 min-h-[2rem] sm:min-h-[2.5rem] lg:min-h-[2.25rem]">
                      <h3 className={`font-bold text-xs sm:text-sm lg:text-xs text-[#3B1F0A] leading-snug ${isBundle ? 'line-clamp-1' : 'line-clamp-2'}`}>{p.name}</h3>
                      {isBundle && (
                        <p className="text-[10px] sm:text-[11px] text-[#8A7264] truncate mt-0.5" title={getBundleDescription(p)}>
                          {getBundleDescription(p)}
                        </p>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm lg:text-xs font-bold text-[#5A453C] mb-2 lg:mb-2 truncate">
                      {isBundle && p.discount_percent > 0 && p.original_price > 0 && (
                        <span className="text-[10px] sm:text-[11px] text-[#B7A99F] line-through font-normal mr-1.5">
                          ₱{p.original_price.toLocaleString()}
                        </span>
                      )}
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

  // Kapag may laman ang search box, palawakin ito nang buo at itago muna ang
  // category pills row — babalik ito sa dati (naka-shrink ulit ang search,
  // babalik ang mga pills) kapag na-clear ang text (sa X button o pag-delete).
  const isSearching = (searchQuery || '').trim().length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 h-auto lg:h-full lg:overflow-hidden relative">
      <div className="shrink-0 pb-4">
        <div className="flex flex-col gap-3 mb-4">
          <div className={`relative w-full rounded-full transition-all ${isSearching ? 'shadow-[0_0_0_3px_rgba(59,31,10,0.08)]' : ''}`}>
            <Search className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${isSearching ? 'text-[#3B1F0A]' : 'text-[#B7A99F]'}`} size={17} />
            <input 
              type="text" 
              placeholder="Search product..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-10 py-3 bg-white border border-[#EAE4E0] rounded-full text-sm placeholder:text-[#B7A99F] focus:outline-none focus:border-[#3B1F0A] transition-colors"
            />
            {isSearching && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8A7264] hover:text-[#3B1F0A] hover:bg-[#F5EFEB] rounded-full p-1 transition-colors"
              >
                <X size={15} />
              </button>
            )}
          </div>
          
          <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSearching ? 'max-h-0 opacity-0' : 'max-h-12 opacity-100'}`}>
            <div className="flex gap-5 sm:gap-6 overflow-x-auto scrollbar-hide border-b border-[#EAE4E0] -mx-3 px-3 sm:mx-0 sm:px-0">
              {categories.map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 pb-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                    activeCategory === cat 
                      ? 'border-[#3B1F0A] text-[#3B1F0A]' 
                      : 'border-transparent text-[#8A7264] hover:text-[#3B1F0A]'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div ref={productListRef} onScroll={checkScrollPosition} className="flex-1 lg:overflow-y-auto scrollbar-thin pr-0 lg:pr-2 pb-10 relative">
        {renderProductGrid()}
      </div>

      {showBackToTop && (
        <button
          onClick={handleBackToTop}
          aria-label="Back to top"
          className="absolute bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-[#3B1F0A] text-white flex items-center justify-center shadow-lg hover:bg-[#2A1608] active:scale-95 transition-all"
        >
          <ArrowUp size={20} />
        </button>
      )}

      {modal && modal.type === 'bundle' ? (
        <PosBundleModal bundle={modal} onClose={() => setModal(null)} onAddToCart={onAddToCart} />
      ) : modal ? (
        <PosProductModal product={modal} onClose={() => setModal(null)} onAddToCart={onAddToCart} />
      ) : null}
    </div>
  );
}