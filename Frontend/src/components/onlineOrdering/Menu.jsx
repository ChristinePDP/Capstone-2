// src/components/onlineOrdering/Menu.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Minus, X, ShoppingBag, ShoppingCart, ChevronDown, Loader2, Expand, ArrowUp, Package, ChevronRight, Search } from 'lucide-react';
import Header from '../onlineOrdering/Header';
import Footer from '../onlineOrdering/Footer';

// ─────────────────────────────────────────────────────────────
// Builds "Product A (Option, Option) + Product B" text for a bundle —
// same logic as the admin Promo Bundles card.
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Bundle Image Grid
// ─────────────────────────────────────────────────────────────
function BundleMenuImage({ products = [], customImageUrl }) {
  if (customImageUrl) {
    return <img src={customImageUrl} alt="Bundle" className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105 group-hover:blur-[3px] group-hover:brightness-[0.55]" />;
  }

  if (products.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#F5EFEB] transition-all duration-300 group-hover:scale-105 group-hover:blur-[3px] group-hover:brightness-[0.55]">
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
    <div className="relative w-full h-full flex transition-all duration-300 group-hover:scale-105 group-hover:blur-[3px] group-hover:brightness-[0.55]">
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
// Bundle Stepper Modal (NEW)
// ─────────────────────────────────────────────────────────────
function BundleModal({ bundle, onClose, onAddToCart }) {
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
      [currentProduct.id]: {
        ...(prev[currentProduct.id] || {}),
        [label]: value
      }
    }));
  };

  const handleImageChange = (file) => {
    setBundleImages(prev => ({
      ...prev,
      [currentProduct.id]: file
    }));
  };

  const handleNext = () => {
    if (hasFields) {
      const missingFields = currentProduct.order_slip_fields.filter(
        field => !bundleAnswers[currentProduct.id]?.[field.label] || bundleAnswers[currentProduct.id][field.label].trim() === ''
      );
      if (missingFields.length > 0) {
        alert(`Mangyaring sagutan ang lahat ng fields para sa ${currentProduct.name}.`);
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
                if (field.type === 'Select') {
                  return (
                    <div key={index} className="flex flex-col w-full">
                      <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{field.label}</label>
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
                      <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{field.label}</label>
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
                    <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{field.label}</label>
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
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleImageChange(e.target.files?.[0] || null)}
                        className="hidden"
                      />
                    </label>
                  ) : (
                    <div className="flex items-center justify-between w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 pl-3 rounded-xl">
                      <span className="text-xs text-[#4A3B36] truncate min-w-0 flex-1">{bundleImages[currentProduct.id].name}</span>
                      <button
                        type="button"
                        onClick={() => handleImageChange(null)}
                        aria-label="Remove file"
                        className="ml-3 w-6 h-6 rounded-full bg-white text-[#8A7264] flex items-center justify-center shrink-0 hover:bg-[#EAE4E0] hover:text-[#3B1F0A] transition-colors"
                      >
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
            {isLastStep ? 'Add Bundle to Cart' : 'Next Item'}
            {!isLastStep && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}


// ─────────────────────────────────────────────────────────────
// Normal Product Modal (Preserved)
// ─────────────────────────────────────────────────────────────
function ProductModal({ product, onClose, onAddToCart }) {
  const [slipAnswers, setSlipAnswers] = useState({});
  const [imageFile, setImageFile] = useState(null);
  
  const [selectedPriceOptions, setSelectedPriceOptions] = useState({});

  if (!product) return null;

  const hasFields = product.order_slip_fields && product.order_slip_fields.length > 0;
  const isVariable = product.pricing_mode === 'variable' && product.price_groups && product.price_groups.length > 0;

  let resolvedPrice = product.price;
  let allGroupsSelected = true;
  let missingCombo = false;

  if (isVariable) {
    allGroupsSelected = product.price_groups.every(g => selectedPriceOptions[g.name]);
    
    if (allGroupsSelected) {
      const match = product.price_matrix.find(entry => {
        return Object.entries(entry.combo).every(([k, v]) => selectedPriceOptions[k] === v);
      });
      if (match) {
        resolvedPrice = match.price;
      } else {
        missingCombo = true;
      }
    }
  }

  const handleAnswerChange = (label, value) => {
    setSlipAnswers(prev => ({
      ...prev,
      [label]: value
    }));
  };

  const handleAdd = () => {
    if (isVariable) {
      if (!allGroupsSelected) {
        alert(`Please select all options: ${product.price_groups.map(g => g.name).join(', ')}`);
        return;
      }
      if (missingCombo) {
        alert("This specific combination is currently unavailable.");
        return;
      }
    }

    if (hasFields) {
      const missingFields = product.order_slip_fields.filter(field => !slipAnswers[field.label] || slipAnswers[field.label].trim() === '');
      if (missingFields.length > 0) {
        alert(`Mangyaring sagutan ang: ${missingFields.map(f => f.label).join(', ')}`);
        return;
      }
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
                {product.price_groups.map((group, index) => (
                  <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                    <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{group.name} *</label>
                    <select
                      className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] transition-colors"
                      value={selectedPriceOptions[group.name] || ''}
                      onChange={e => setSelectedPriceOptions(prev => ({ ...prev, [group.name]: e.target.value }))}
                    >
                      <option value="" disabled>Select {group.name}...</option>
                      {group.options.map((opt, i) => (
                        <option key={i} value={opt}>{opt}</option>
                      ))}
                    </select>
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
                  if (field.type === 'Select') {
                    return (
                      <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                        <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{field.label}</label>
                        <select className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] transition-colors" onChange={e => handleAnswerChange(field.label, e.target.value)} defaultValue="">
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
                      <div key={index} className="flex flex-col w-full basis-full">
                        <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{field.label}</label>
                        <textarea placeholder={`Enter ${field.label}...`} className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] resize-none transition-colors" rows={3} onChange={e => handleAnswerChange(field.label, e.target.value)} />
                      </div>
                    );
                  }
                  return (
                    <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                      <label className="text-xs font-semibold text-[#8A7264] mb-1.5">{field.label}</label>
                      <input type={field.type === 'Number' ? 'number' : 'text'} placeholder={`Enter ${field.label}...`} className="w-full border border-[#EAE4E0] bg-white p-3 rounded-xl text-sm focus:outline-none focus:border-[#5A453C] transition-colors" onChange={e => handleAnswerChange(field.label, e.target.value)} />
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

function ImagePreviewModal({ product, onClose }) {
  if (!product) return null;
  return (
    <div className="fixed inset-0 bg-[#1F1108]/80 backdrop-blur-md z-[5000] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200" onClick={onClose}>
      <div className="relative w-full max-w-2xl flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-4 -right-2 sm:-top-3 sm:-right-3 w-9 h-9 rounded-full bg-white text-[#3B1F0A] flex items-center justify-center shadow-lg hover:bg-[#F5EFEB] active:scale-95 transition-all z-10"><X size={18} /></button>
        <div className="p-2 sm:p-3 bg-gradient-to-br from-[#EFE0C8] via-[#FCFAF9] to-[#DDC3A0] rounded-[22px] shadow-2xl w-full">
          <div className="rounded-2xl border border-[#3B1F0A]/25 p-1">
            <img src={product.image_url} alt={product.name} className="w-full max-h-[65vh] sm:max-h-[70vh] object-contain rounded-[14px] bg-[#F5EFEB]" />
          </div>
        </div>
        <div className="mt-4 text-center px-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#DCCBBA]">{product.category}</span>
          <h3 className="text-lg sm:text-xl font-serif text-white mt-1">{product.name}</h3>
        </div>
      </div>
    </div>
  );
}

// I-de-derive ang order_type ng isang BUNDLE base sa mga products na talagang
// laman nito — hindi na basta i-hahardcode sa 'Pick-up Today'. Parehong
// priority rule ang ginagamit dito gaya sa Checkout.jsx: kapag may kahit
// isang product sa loob ng bundle na 'Pre-order' (e.g. customize cake na may
// lead time), dapat 'Pre-order' na rin ang buong bundle — kahit may ibang
// kasamang product na 'Pick-up Today' o 'Both'.
function resolveBundleOrderType(products = []) {
  if (products.some(p => p.order_type === 'Pre-order')) return 'Pre-order';
  if (products.some(p => p.order_type === 'Pick-up Today')) return 'Pick-up Today';
  return 'Both';
}

// ─────────────────────────────────────────────────────────────
// Quantity tracking helpers — dating "stock" lang (stock_quantity) ang
// may limit-checking dito, kaya Pre-order products ay hindi na-a-apply
// ang limit kahit may daily_limit na sila. Ngayon, parehong daily_limit
// (Pre-order slots) at stock_quantity (Pick-up Today produced stock) ay
// tinitignan gamit ang parehong priority rule: kung may laman (di null,
// > 0) ang daily_limit, ITO ang babasahin kahit may laman din ang
// stock_quantity; kung wala, babalik sa stock_quantity. Bundles ay hindi
// tracked dito dahil hiwalay ang stock-checking nila per component.
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

export default function Menu({ cart, setCart }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [categories, setCategories] = useState(['Package', 'Cake', 'Pastry', 'Celebration Material']);
  const [toast, setToast] = useState(null); // { message }
  const toastTimerRef = useRef(null);
  const productListRef = useRef(null);

  const showToast = (message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message });
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

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

  useEffect(() => {
    const fetchProductsAndBundles = async () => {
      try {
        setIsLoading(true);

        const [productsRes, bundlesRes] = await Promise.all([
          fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products`),
          fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products/bundles`).catch(() => null)
        ]);

        let allProducts = [];
        if (productsRes && productsRes.ok) {
          const json = await productsRes.json();
          if (json.success) {
            allProducts = json.data.map(p => ({
              ...p,
              order_slip_fields: p.order_slip_fields || [],
              pricing_mode: p.pricing_mode || 'fixed',
              price_groups: p.price_groups || [],
              price_matrix: p.price_matrix || []
            }));
          }
        }

        let bundlesData = [];
        if (bundlesRes && bundlesRes.ok) {
           const bJson = await bundlesRes.json();
           bundlesData = bJson.data || [];
        }

        if (bundlesData.length > 0) {
          setCategories(prev => prev.includes('Promo Bundle') ? prev : ['Promo Bundle', ...prev]);

          // Gaya ng sa admin Promo Bundles page: ipakita lang ang mga bundle na
          // active AT nasa loob ng promo date range nito (kung meron man).
          const activeBundles = bundlesData
            .filter(b => b.is_active && b.is_within_date_range !== false)
            .map(b => {
             const fallbackImage = b.products && b.products.length > 0 ? (b.products[0].image_url || b.products[0].image) : null;
             const bundleProducts = (b.product_ids || []).map(id => allProducts.find(p => p.id === id)).filter(Boolean);

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

          setProducts([...activeBundles, ...allProducts]);
        } else {
          setProducts(allProducts);
        }

      } catch (error) {
        console.error("Failed to fetch products or bundles:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchProductsAndBundles();
  }, []);

  const addToCart = (item) => {
    setCart(prev => {
      const currentSlipStr = JSON.stringify(item.order_slip_details);
      const currentOptionsStr = JSON.stringify(item.selected_price_options);
      
      const idx = prev.findIndex(i => 
        i.id === item.id && 
        JSON.stringify(i.order_slip_details) === currentSlipStr &&
        JSON.stringify(i.selected_price_options) === currentOptionsStr
      );

      const currentQtyInCart = prev.filter(i => i.id === item.id).reduce((s, i) => s + i.qty, 0);

      if (isQuantityTracked(item)) {
        const limit = getQuantityLimit(item);
        if (currentQtyInCart + item.qty > limit) {
          showToast(`Sorry, hanggang ${limit} na lang ang available para sa ${item.name}.`);
          return prev;
        }
      }

      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + item.qty, inspiration_image: item.inspiration_image || next[idx].inspiration_image };
        return next;
      }
      return [...prev, item];
    });
  };

  const changeQty = (index, delta) => setCart(prev => {
    const newCart = [...prev];
    const item = newCart[index];
    const newQty = item.qty + delta;

    if (isQuantityTracked(item) && delta > 0) {
      const currentQtyInCart = prev.filter(i => i.id === item.id).reduce((s, i) => s + i.qty, 0);
      const limit = getQuantityLimit(item);
      if (currentQtyInCart + delta > limit) {
        showToast(`Limit reached: ${limit} na lang ang available para sa ${item.name}.`);
        return prev;
      }
    }

    if (newQty <= 0) return prev.filter((_, i) => i !== index);
    newCart[index] = { ...item, qty: newQty };
    return newCart;
  });

  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  useEffect(() => {
    if (cartCount === 0) setIsMobileCartOpen(false);
  }, [cartCount]);

  const isSearching = (searchQuery || '').trim().length > 0;
  
  const displayItems = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return products;
    return products.filter(p => p.name.toLowerCase().includes(q));
  }, [products, searchQuery]);

  const renderProductGrid = () => {
    const categoriesToRender = activeTab === 'All' 
      ? ['All', ...categories].filter(c => c !== 'All') 
      : [activeTab];

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
      const catProducts = displayItems
        .filter(p => p.category === cat)
        .slice()
        .sort((a, b) => {
          const aSoldOut = isQuantityTracked(a) && getQuantityLimit(a) <= 0;
          const bSoldOut = isQuantityTracked(b) && getQuantityLimit(b) <= 0;
          if (aSoldOut === bSoldOut) return 0;
          return aSoldOut ? 1 : -1;
        });
        
      if (catProducts.length === 0) return null;

      return (
        <div key={cat} className="mb-8">
          <div className="flex items-center justify-between mb-4 border-b border-[#EAE4E0] pb-2.5">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-[#8A7264] font-bold">{cat}</h3>
            <span className="text-[11px] text-[#B7A99F]">{catProducts.length} items</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-4">
            {catProducts.map(p => {
              const isStockTracked = isQuantityTracked(p);
              const currentStock = getQuantityLimit(p);
              const isSoldOut = isStockTracked && currentStock <= 0;

              const isVariable = p.pricing_mode === 'variable' && p.price_matrix?.length > 0;
              const minPrice = isVariable ? Math.min(...p.price_matrix.map(m => m.price)) : p.price;

              return (
                <div key={p.id} className="bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden flex flex-col group shadow-sm relative">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#F5EFEB] shrink-0">
                    
                    {p.type === 'bundle' ? (
                       <BundleMenuImage products={p.products} customImageUrl={p.custom_image_url} />
                    ) : (
                       <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105 group-hover:blur-[3px] group-hover:brightness-[0.55]" />
                    )}

                    {isStockTracked && (
                      <div className={`absolute top-2 left-2 px-2.5 py-1 rounded-md shadow-sm border border-white/20 z-10 backdrop-blur-sm ${isSoldOut ? 'bg-red-500/90 text-white' : 'bg-white/90 text-[#3B1F0A]'}`}>
                        <span className="text-[10px] font-bold uppercase tracking-wider">
                          {isSoldOut ? 'Sold Out' : `${currentStock} Available`}
                        </span>
                      </div>
                    )}

                    {p.type === 'bundle' && p.discount_percent > 0 && (
                      <div className="absolute top-2 right-2 z-10">
                        <span className="text-[10px] font-bold bg-[#3B1F0A] text-white px-2 py-1 rounded-full shadow-sm">
                          -{p.discount_percent}%
                        </span>
                      </div>
                    )}

                    {p.type === 'bundle' && p.event_tag && (
                      <div className="absolute bottom-2 left-2 z-10">
                        <span className="text-[10px] font-bold uppercase tracking-widest bg-white/90 text-[#3B1F0A] px-2.5 py-1 rounded-full shadow-sm backdrop-blur-sm">
                          {p.event_tag}
                        </span>
                      </div>
                    )}

                    {(p.image_url || p.custom_image_url) && (
                      <button type="button" onClick={() => setPreviewImage(p)} aria-label={`See full image of ${p.name}`} className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer z-20">
                        <span className="flex items-center gap-1.5 text-white text-[10px] sm:text-[11px] font-semibold uppercase tracking-wide bg-[#1F1108]/40 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/30"><Expand size={12} /> See this image</span>
                      </button>
                    )}
                  </div>
                  <div className="p-3 sm:p-4 lg:p-3 flex flex-col flex-1">
                    <span className="font-mono text-[8px] sm:text-[9px] uppercase tracking-[0.15em] text-[#B7A99F] mb-1">{p.category}</span>
                    <div className="flex-1 mb-1.5 lg:mb-1.5">
                      <h3 className="font-bold text-xs sm:text-sm lg:text-xs text-[#3B1F0A] leading-snug line-clamp-2 min-h-[2rem] sm:min-h-[2.5rem] lg:min-h-[2.25rem]">{p.name}</h3>

                      {p.type === 'bundle' && (
                        <p
                          className="text-[10px] sm:text-[11px] text-[#8A7264] truncate mt-0.5"
                          title={getBundleDescription(p)}
                        >
                          {getBundleDescription(p)}
                        </p>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm lg:text-xs font-bold text-[#5A453C] mb-2 lg:mb-2">
                       {p.type === 'bundle' && p.discount_percent > 0 && p.original_price > 0 && (
                         <span className="text-[10px] sm:text-[11px] text-[#B7A99F] line-through font-normal mr-1.5">
                           ₱{p.original_price.toLocaleString()}
                         </span>
                       )}
                       {isVariable ? 'Starting at ' : ''}₱{Number(minPrice).toLocaleString()}
                    </p>

                    <button
                      onClick={() => {
                        if (isSoldOut) return;
                        // Para sa bundles, i-check kung may any custom fields sa mga products
                        // Laging idadaan sa modal kapag bundle para makita nila ang Stepper
                        const needsModal = p.type === 'bundle' || isVariable || (p.order_slip_fields && p.order_slip_fields.length > 0) || p.allow_file_upload;
                        
                        needsModal ? setModal(p) : addToCart({ ...p, qty: 1, order_slip_details: null, selected_price_options: null });
                      }}
                      disabled={isSoldOut}
                      className={`w-full py-2 sm:py-2.5 lg:py-2 rounded-full text-[11px] sm:text-xs font-semibold transition-colors ${
                        isSoldOut 
                          ? 'bg-[#EAE4E0] text-[#8A7264] cursor-not-allowed' 
                          : 'bg-[#3B1F0A] text-white hover:bg-[#2A1608]'
                      }`}
                    >
                      {isSoldOut ? 'Out of Stock' : (isVariable || p.type === 'bundle' ? 'Select Options' : 'Add to Cart')}
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
    <div className="bg-[#FCFAF9] min-h-screen flex flex-col relative">
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[6000] flex items-center gap-2.5 bg-[#3B1F0A] text-white text-xs sm:text-sm font-semibold px-4 sm:px-5 py-3 rounded-xl shadow-lg max-w-[92vw] sm:max-w-md animate-in fade-in slide-in-from-top-4 duration-200">
          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
          <span className="leading-snug">{toast.message}</span>
        </div>
      )}

      <Header page="menu" />

      <div className="flex-1 w-full max-w-[1440px] mx-auto flex flex-col lg:flex-row gap-8 lg:gap-10 px-4 sm:px-8 py-4 lg:py-4 lg:pl-[140px] xl:pl-[160px]">
        
        <div className="relative flex-1 flex flex-col lg:h-[calc(100vh-112px)] min-h-0 lg:border-l lg:border-[#EAE4E0] lg:pl-6">
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
                  {['All', ...categories].map(cat => (
                    <button 
                      key={cat} 
                      onClick={() => setActiveTab(cat)}
                      className={`shrink-0 pb-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                        activeTab === cat 
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

          <div ref={productListRef} onScroll={checkScrollPosition} className="flex-1 lg:overflow-y-auto scrollbar-thin pr-0 lg:pr-2 pb-10">
            {isLoading ? (
               <div className="flex justify-center items-center h-40"><Loader2 className="animate-spin text-[#8A7264]" size={32} /></div>
            ) : (
              renderProductGrid()
            )}
          </div>

          {showBackToTop && (
            <button
              onClick={handleBackToTop}
              aria-label="Back to top"
              className="hidden lg:flex absolute bottom-6 right-8 z-30 w-11 h-11 rounded-full bg-[#3B1F0A] text-white items-center justify-center shadow-lg hover:bg-[#2A1608] active:scale-95 transition-all"
            >
              <ArrowUp size={20} />
            </button>
          )}
        </div>

        <div className="hidden lg:flex flex-col w-full lg:w-[360px] shrink-0 bg-white rounded-3xl border border-[#EAE4E0] shadow-sm lg:max-h-[calc(100vh-112px)] overflow-hidden">
          <div className="p-6 pb-4 flex items-center justify-between shrink-0 border-b border-[#F1EBE6]">
            <div className="flex items-center gap-2.5">
              <div className="w-6 h-6 rounded-full bg-[#4A3B36] text-white flex items-center justify-center shrink-0"><ShoppingCart size={16} /></div>
              <h3 className="text-lg font-serif text-[#3B1F0A]">Your Cart</h3>
            </div>
            {cartCount > 0 && <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#8A7264] bg-[#F5EFEB] px-2.5 py-1 rounded-full">{cartCount} item{cartCount > 1 ? 's' : ''}</span>}
          </div>

          {cart.length === 0 ? (
            <div className="p-6 overflow-y-auto">
              <p className="text-sm text-[#B7A99F]">Your cart is empty. Add something from the menu to get started.</p>
            </div>
          ) : (
            <>
              <div className="px-6 py-4 flex-1 overflow-y-auto flex flex-col gap-4">
                {cart.map((item, i) => (
                  <div key={i} className="flex justify-between items-start gap-3 pb-4 border-b border-[#F1EBE6] last:border-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-sm text-[#3B1F0A] line-clamp-2 leading-snug">{item.name}</p>
                      
                      {item.selected_price_options && Object.entries(item.selected_price_options).map(([key, val]) => (
                        <p key={`opt-${key}`} className="text-[11px] text-[#B7A99F] mt-0.5 leading-snug">{key}: {val}</p>
                      ))}

                      {item.type === 'bundle' && item.order_slip_details ? (
                         // Kapag bundle, nakagrupo per product ID ang slip details
                         Object.entries(item.order_slip_details).map(([prodId, answers]) => {
                           const pName = item.products?.find(p => p.id === prodId)?.name || 'Item';
                           return Object.entries(answers).map(([key, val]) => (
                             <p key={`slip-${prodId}-${key}`} className="text-[11px] text-[#B7A99F] mt-0.5 leading-snug">
                               <span className="font-semibold text-[#8A7264]">{pName}</span> - {key}: {val}
                             </p>
                           ));
                         })
                      ) : (
                        item.order_slip_details && Object.entries(item.order_slip_details).map(([key, val]) => (
                          <p key={`slip-${key}`} className="text-[11px] text-[#B7A99F] mt-0.5 leading-snug">{key}: {val}</p>
                        ))
                      )}

                      {item.inspiration_image && (
                         <p className="text-[11px] font-semibold text-[#8A7264] mt-0.5">
                           {item.type === 'bundle'
                             ? `Image Attached (${Object.values(item.inspiration_image).filter(Boolean).length})`
                             : 'Image Attached'}
                         </p>
                      )}
                      
                      <div className="flex items-center gap-2 mt-2.5">
                        <button onClick={() => changeQty(i, -1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Minus size={11} /></button>
                        <span className="font-mono text-xs w-4 text-center">{item.qty}</span>
                        <button onClick={() => changeQty(i, 1)} className="w-6 h-6 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]"><Plus size={11} /></button>
                      </div>
                    </div>
                    <span className="font-bold text-sm text-[#5A453C] shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
                  </div>
                ))}
              </div>

              <div className="px-6 pt-4 pb-6 shrink-0 border-t border-[#F1EBE6] bg-white">
                <div className="flex items-center justify-between mb-5">
                  <span className="text-sm font-semibold text-[#5A453C]">Subtotal</span>
                  <span className="font-serif text-xl text-[#3B1F0A]">₱{cartTotal.toLocaleString()}</span>
                </div>
                <button onClick={() => navigate('/onlineOrdering/checkout')} className="w-full bg-[#3B1F0A] text-white py-3.5 rounded-full text-sm font-semibold hover:bg-[#2A1608] transition-colors">Proceed to Checkout</button>
              </div>
            </>
          )}
        </div>
      </div>

      {cartCount > 0 && !isMobileCartOpen && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#EAE4E0] p-4 z-40 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <div className="flex gap-3">
            <button onClick={() => setIsMobileCartOpen(true)} className="flex items-center justify-center gap-2 px-5 bg-[#F5EFEB] text-[#3B1F0A] rounded-xl font-semibold shadow-sm shrink-0">
              <div className="relative">
                <ShoppingBag size={18} />
                <span className="absolute -top-1.5 -right-2.5 bg-[#3B1F0A] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">{cartCount}</span>
              </div>
            </button>
            <button onClick={() => navigate('/onlineOrdering/checkout')} className="flex-1 bg-[#3B1F0A] text-white py-3.5 rounded-xl text-sm font-semibold shadow-sm flex items-center justify-between px-5">
              <span>Checkout</span>
              <span>₱{cartTotal.toLocaleString()}</span>
            </button>
          </div>
        </div>
      )}

      {isMobileCartOpen && (
        <div className="lg:hidden fixed inset-0 z-[3000] flex justify-center items-end bg-[#1F1108]/60 transition-opacity">
          <div className="bg-white w-full rounded-t-3xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-full duration-300">
            <div className="p-5 flex items-center justify-between border-b border-[#EAE4E0]">
              <div>
                <h3 className="text-lg font-serif text-[#3B1F0A]">Your Cart</h3>
                <p className="text-xs text-[#8A7264] mt-0.5">{cartCount} item{cartCount > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setIsMobileCartOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#EAE4E0] transition-colors shrink-0"><X size={20} /></button>
            </div>

            <div className="overflow-y-auto p-5 flex flex-col gap-4">
              {cart.map((item, i) => (
                <div key={i} className="flex justify-between items-start gap-3 pb-4 border-b border-[#F1EBE6] last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-[#3B1F0A] truncate">{item.name}</p>
                    
                    {item.selected_price_options && Object.entries(item.selected_price_options).map(([key, val]) => (
                      <p key={`mob-opt-${key}`} className="text-[11px] text-[#B7A99F] mt-1 leading-snug">{key}: {val}</p>
                    ))}

                    {item.type === 'bundle' && item.order_slip_details ? (
                       Object.entries(item.order_slip_details).map(([prodId, answers]) => {
                         const pName = item.products?.find(p => p.id === prodId)?.name || 'Item';
                         return Object.entries(answers).map(([key, val]) => (
                           <p key={`mob-slip-${prodId}-${key}`} className="text-[11px] text-[#B7A99F] mt-1 leading-snug">
                             <span className="font-semibold text-[#8A7264]">{pName}</span> - {key}: {val}
                           </p>
                         ));
                       })
                    ) : (
                      item.order_slip_details && Object.entries(item.order_slip_details).map(([key, val]) => (
                        <p key={`mob-slip-${key}`} className="text-[11px] text-[#B7A99F] mt-1 leading-snug">{key}: {val}</p>
                      ))
                    )}

                    {item.inspiration_image && (
                       <p className="text-[11px] font-semibold text-[#8A7264] mt-1">
                         {item.type === 'bundle'
                           ? `Image Attached (${Object.values(item.inspiration_image).filter(Boolean).length})`
                           : 'Image Attached'}
                       </p>
                    )}

                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => changeQty(i, -1)} className="w-8 h-8 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] active:bg-[#EAE4E0]"><Minus size={14} /></button>
                      <span className="font-mono text-sm w-6 text-center">{item.qty}</span>
                      <button onClick={() => changeQty(i, 1)} className="w-8 h-8 rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] active:bg-[#EAE4E0]"><Plus size={14} /></button>
                    </div>
                  </div>
                  <span className="font-bold text-sm text-[#5A453C] shrink-0 mt-0.5">₱{(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
            </div>

            <div className="p-5 border-t border-[#EAE4E0] bg-[#FCFAF9]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-[#5A453C]">Subtotal</span>
                <span className="font-serif text-xl text-[#3B1F0A]">₱{cartTotal.toLocaleString()}</span>
              </div>
              <button onClick={() => { setIsMobileCartOpen(false); navigate('/onlineOrdering/checkout'); }} className="w-full bg-[#3B1F0A] text-white py-3.5 rounded-xl text-sm font-semibold hover:bg-[#2A1608] active:scale-[0.98] transition-all">Proceed to Checkout</button>
            </div>
          </div>
        </div>
      )}

      {showBackToTop && (
        <button
          onClick={handleBackToTop}
          aria-label="Back to top"
          className={`lg:hidden fixed right-4 sm:right-6 z-30 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#3B1F0A] text-white flex items-center justify-center shadow-lg hover:bg-[#2A1608] active:scale-95 transition-all ${
            cartCount > 0 && !isMobileCartOpen ? 'bottom-24' : 'bottom-6'
          }`}
        >
          <ArrowUp size={20} />
        </button>
      )}

      {/* RENDER MODAL BASED ON TYPE */}
      {modal && modal.type === 'bundle' ? (
        <BundleModal bundle={modal} onClose={() => setModal(null)} onAddToCart={addToCart} />
      ) : modal ? (
        <ProductModal product={modal} onClose={() => setModal(null)} onAddToCart={addToCart} />
      ) : null}

      {previewImage && <ImagePreviewModal product={previewImage} onClose={() => setPreviewImage(null)} />}
      {cartCount > 0 && <div className="lg:hidden h-24"></div>}
      <Footer />
    </div>
  );
}