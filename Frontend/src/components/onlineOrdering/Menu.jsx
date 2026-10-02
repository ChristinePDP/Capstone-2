// src/components/onlineOrdering/Menu.jsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Minus, X, ShoppingBag, ShoppingCart, ChevronDown, Loader2, Expand, ArrowUp, Package, ChevronRight, Search, LayoutGrid, Tag, Cake, Croissant, PartyPopper, Trash2, Pencil } from 'lucide-react';
import Footer from '../onlineOrdering/Footer';
import MultiImageField from '../shared/MultiImageField';
import CartSlipImages from '../shared/CartSlipImages';
import { isSlipAnswerEmpty, pruneEmptySlipAnswers, slipSignature } from '../shared/orderSlipUploads';

// Rate limiter: 5MB max para sa mga reference/inspiration image na iuupload
// ng customer, para hindi mabilis maubos ang Supabase Storage.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = '5MB';

// ─────────────────────────────────────────────────────────────
// Icon for each category tab (used on mobile where labels are hidden)
// ─────────────────────────────────────────────────────────────
const CATEGORY_ICONS = {
  'All': LayoutGrid,
  'Promo Bundle': Tag,
  'Package': Package,
  'Cake': Cake,
  'Pastry': Croissant,
  'Celebration Material': PartyPopper,
};
const getCategoryIcon = (cat) => CATEGORY_ICONS[cat] || Tag;

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

// Inclusion ng Package = ang mga produktong bumubuo rito (package_items),
// gaya ng description ng Bundle — hindi ito tina-type na field.
function getPackageInclusion(bundle, productList = []) {
  return (bundle.package_items || []).map(pi => {
    const name = pi.product?.name || pi.name
      || productList.find(p => String(p.id) === String(pi.product_id))?.name;
    if (!name) return null;
    const qty = Number(pi.quantity) || 1;
    return qty > 1 ? `${qty}x ${name}` : name;
  }).filter(Boolean).join(' + ');
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
// Cart Item Row
// ─────────────────────────────────────────────────────────────
function CartItemRow({
  item, index, changeQty, onRemove, expanded, onToggleExpand,
  imageSrc, attachedImageSrc, onPreviewImage, variant, openSwipeIndex, setOpenSwipeIndex, onReplaceImage, onUpdateSlip,
}) {
  const isMobile = variant === 'mobile';
  const swipeStartX = useRef(null);
  const replaceInputRef = useRef(null);

  const handlePointerDown = (e) => { swipeStartX.current = e.clientX; };
  const handlePointerMove = (e) => {
    if (swipeStartX.current === null) return;
    const delta = e.clientX - swipeStartX.current;
    if (delta < -40) setOpenSwipeIndex(index);
    else if (delta > 40) setOpenSwipeIndex(null);
  };
  const handlePointerUp = () => { swipeStartX.current = null; };

  const isMulti = item.type === 'bundle' || item.type === 'package';
  const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof File);
  const displayVal = (v) => (Array.isArray(v) ? v.join(', ') : (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')));

  const optionLines = item.selected_price_options
    ? Object.entries(item.selected_price_options).map(([key, val]) => ({ key: `opt-${key}`, label: key, value: displayVal(val) }))
    : [];

  const slipKeys = isPlainObject(item.order_slip_details) ? Object.keys(item.order_slip_details) : [];
  const includesText = isMulti && slipKeys.length > 0
    ? slipKeys.map(prodId => (item.products || item.package_components)?.find(p => String(p.id) === String(prodId))?.name || 'Item').join(', ')
    : null;
  const isCustomized = !isMulti && slipKeys.length > 0;

  const imageCount = isMulti && isPlainObject(item.inspiration_image)
    ? Object.values(item.inspiration_image).filter(Boolean).length
    : (item.inspiration_image ? 1 : 0);

  const qtyBtnSize = isMobile ? 'w-8 h-8' : 'w-6 h-6';
  const qtyIconSize = isMobile ? 14 : 11;

  const content = (
    <div className="bg-white">
      <button type="button" onClick={() => onToggleExpand(index)} className="w-full flex items-center gap-3 text-left">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt=""
            onClick={(e) => { e.stopPropagation(); onPreviewImage(imageSrc); }}
            className={`${isMobile ? 'w-12 h-12' : 'w-10 h-10'} rounded-lg object-cover shrink-0 border border-[#EAE4E0] cursor-zoom-in`}
          />
        ) : (
          <div className={`${isMobile ? 'w-12 h-12' : 'w-10 h-10'} rounded-lg bg-[#F5EFEB] border border-[#EAE4E0] shrink-0 flex items-center justify-center`}>
            <Package size={16} className="text-[#DED4CC]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-bold text-sm text-[#3B1F0A] truncate">{item.name}</p>
          {!expanded && <p className="text-[11px] text-[#8A7264] mt-0.5">Qty {item.qty}</p>}
        </div>
        <span className="font-bold text-sm text-[#5A453C] shrink-0">₱{(item.price * item.qty).toLocaleString()}</span>
        <ChevronDown size={16} className={`text-[#B7A99F] shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-2.5 pl-0">
          {optionLines.map(d => (
            <p key={d.key} className="text-[11px] text-[#B7A99F] mt-0.5 leading-snug">{d.label}: {d.value}</p>
          ))}

          {includesText ? (
            <p className="text-[11px] text-[#B7A99F] mt-0.5 leading-snug line-clamp-2">
              <span className="font-semibold text-[#8A7264]">Includes:</span>{' '}{includesText}
            </p>
          ) : (
            isCustomized && <p className="text-[11px] font-semibold text-[#8A7264] mt-0.5">Customized</p>
          )}

          {imageCount > 0 && (
            <p className="text-[11px] font-semibold text-[#8A7264] mt-0.5 flex items-center gap-2">
              <span>{isMulti ? `Image Attached (${imageCount})` : 'Image Attached'}</span>
              {attachedImageSrc && (
                <button type="button" onClick={() => onPreviewImage(attachedImageSrc)} className="underline underline-offset-2 font-normal normal-case text-[#5A453C]">
                  View
                </button>
              )}
              {!isMulti && onReplaceImage && (
                <>
                  <button
                    type="button"
                    onClick={() => replaceInputRef.current?.click()}
                    aria-label="Change picture"
                    title="Change picture"
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#DED4CC] text-[#5A453C] hover:bg-[#F5EFEB] transition-colors"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onReplaceImage(index, null)}
                    aria-label="Remove picture"
                    title="Remove picture"
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#DED4CC] text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={11} />
                  </button>
                  <input
                    ref={replaceInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onReplaceImage(index, file);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
            </p>
          )}

          <CartSlipImages
            item={item}
            className="mt-2"
            readOnly={!onUpdateSlip}
            onChange={(next) => onUpdateSlip?.(index, next)}
          />

          <div className="flex items-center justify-between mt-2.5">
            <div className="flex items-center gap-2">
              <button onClick={() => changeQty(index, -1)} className={`${qtyBtnSize} rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]`}><Minus size={qtyIconSize} /></button>
              <span className={`font-mono ${isMobile ? 'text-sm w-6' : 'text-xs w-4'} text-center`}>{item.qty}</span>
              <button onClick={() => changeQty(index, 1)} className={`${qtyBtnSize} rounded-full border border-[#DED4CC] flex items-center justify-center text-[#5A453C] hover:bg-[#EAE4E0]`}><Plus size={qtyIconSize} /></button>
            </div>
            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label="Remove item"
              title="Remove item"
              className="w-7 h-7 rounded-full flex items-center justify-center text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );

  if (!isMobile) {
    return <div className="pb-4 border-b border-[#F1EBE6] last:border-0 last:pb-0">{content}</div>;
  }

  return (
    <div className="border-b border-[#F1EBE6] last:border-0 pb-4 last:pb-0">
      <div className="grid overflow-hidden rounded-2xl">
        <div className="[grid-area:1/1] bg-red-500 rounded-2xl flex items-center justify-end">
          <button type="button" onClick={() => onRemove(index)} className="w-20 self-stretch flex flex-col items-center justify-center gap-1 text-white">
            <Trash2 size={18} />
            <span className="text-[9px] font-bold uppercase tracking-wide">Delete</span>
          </button>
        </div>
        <div
          className="[grid-area:1/1] bg-white transition-transform duration-200 ease-out touch-pan-y"
          style={{ transform: openSwipeIndex === index ? 'translateX(-80px)' : 'translateX(0)' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {content}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Bundle Stepper Modal
// ─────────────────────────────────────────────────────────────
function BundleModal({ bundle, onClose, onAddToCart, showToast }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [bundleAnswers, setBundleAnswers] = useState({});
  const [bundleImages, setBundleImages] = useState({});
  const [bundleImagePreviews, setBundleImagePreviews] = useState({});
  const [bundleImageErrors, setBundleImageErrors] = useState({});
  const [errors, setErrors] = useState({});
  const products = bundle.products || [];

  useEffect(() => {
    const urls = {};
    Object.entries(bundleImages).forEach(([productId, file]) => {
      if (file) urls[productId] = URL.createObjectURL(file);
    });
    setBundleImagePreviews(urls);
    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, [bundleImages]);

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
    setErrors(prev => ({ ...prev, [label]: false }));
  };

  const handleImageChange = (file) => {
    if (file && file.size > MAX_FILE_SIZE_BYTES) {
      setBundleImageErrors(prev => ({ ...prev, [currentProduct.id]: `File is too large. Maximum size is ${MAX_FILE_SIZE_LABEL}.` }));
      setBundleImages(prev => ({ ...prev, [currentProduct.id]: null }));
      return;
    }
    setBundleImageErrors(prev => ({ ...prev, [currentProduct.id]: '' }));
    setBundleImages(prev => ({ ...prev, [currentProduct.id]: file }));
  };

  const handleNext = () => {
    if (hasFields) {
      const newErrors = {};
      currentProduct.order_slip_fields.forEach(field => {
        const answer = bundleAnswers[currentProduct.id]?.[field.label];
        if (isSlipAnswerEmpty(field, answer)) {
          newErrors[field.label] = true;
        }
      });
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    }

    if (!isLastStep) {
      setErrors({});
      setCurrentStep(prev => prev + 1);
    } else {
      const hasAnyImage = Object.values(bundleImages).some(Boolean);
      onAddToCart({
        ...bundle,
        qty: 1,
        price: bundle.price,
        selected_price_options: null, 
        order_slip_details: pruneEmptySlipAnswers(bundleAnswers), 
        inspiration_image: hasAnyImage ? bundleImages : null 
      });
      onClose();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setErrors({});
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1F1108]/60 z-[4000] flex items-center justify-center p-4">
      <div className="bg-[#FCFAF9] w-full max-w-[420px] lg:max-w-[500px] max-h-[90vh] rounded-2xl flex flex-col shadow-xl overflow-hidden">
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

        <div className="p-5 flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin">
          {!hasFields && !allowsImageUpload ? (
             <div className="flex flex-col items-center justify-center py-10 text-center">
               <Package size={32} className="text-[#DED4CC] mb-3" />
               <p className="text-sm font-semibold text-[#5A453C]">No customization needed for this item.</p>
               <p className="text-xs text-[#8A7264] mt-1">You can proceed to the next item.</p>
             </div>
          ) : (
            <div className="flex flex-col gap-4">
              {hasFields && currentProduct.order_slip_fields.map((field, index) => {
                if (field.type === 'Multi-image') {
                  return (
                    <div key={index} className="flex flex-col w-full basis-full">
                      <MultiImageField
                        label={field.label}
                        value={bundleAnswers[currentProduct.id]?.[field.label] || []}
                        onChange={files => handleAnswerChange(field.label, files)}
                        max={field.maxImages}
                        error={!!errors[field.label]}
                      />
                    </div>
                  );
                }
                if (field.type === 'Select') {
                  return (
                    <div key={index} className="flex flex-col w-full">
                      <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>{field.label}</label>
                      <select 
                        className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} 
                        value={bundleAnswers[currentProduct.id]?.[field.label] || ''}
                        onChange={e => handleAnswerChange(field.label, e.target.value)}
                      >
                        <option value="" disabled>Select {field.label}...</option>
                        {field.options?.map((opt, i) => (
                          <option key={i} value={opt}>{opt}</option>
                        ))}
                      </select>
                      {errors[field.label] && <span className="text-[10px] text-red-500 mt-1 block">This field is required</span>}
                    </div>
                  );
                }
                if (field.type === 'Textarea') {
                  return (
                    <div key={index} className="flex flex-col w-full">
                      <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>{field.label}</label>
                      <textarea 
                        placeholder={`Enter ${field.label}...`} 
                        className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none resize-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} 
                        rows={3} 
                        value={bundleAnswers[currentProduct.id]?.[field.label] || ''}
                        onChange={e => handleAnswerChange(field.label, e.target.value)} 
                      />
                      {errors[field.label] && <span className="text-[10px] text-red-500 mt-1 block">This field is required</span>}
                    </div>
                  );
                }
                return (
                  <div key={index} className="flex flex-col w-full">
                    <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>{field.label}</label>
                    <input 
                      type={field.type === 'Number' ? 'number' : 'text'} 
                      placeholder={`Enter ${field.label}...`} 
                      className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} 
                      value={bundleAnswers[currentProduct.id]?.[field.label] || ''}
                      onChange={e => handleAnswerChange(field.label, e.target.value)} 
                    />
                    {errors[field.label] && <span className="text-[10px] text-red-500 mt-1 block">This field is required</span>}
                  </div>
                );
              })}

              {allowsImageUpload && (
                <div className={hasFields ? 'border-t border-[#EAE4E0] pt-4' : ''}>
                  <label className="text-xs font-semibold text-[#8A7264] mb-1 block">Upload Reference Image (Optional)</label>
                  <p className="text-[10px] text-[#B7A99F] mb-1.5">Max file size: 5MB</p>

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
                    <div className="flex items-center gap-2.5 w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 pl-2 rounded-xl">
                      {bundleImagePreviews[currentProduct.id] && (
                        <img
                          src={bundleImagePreviews[currentProduct.id]}
                          alt="Preview ng napiling reference image"
                          className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[#DED4CC]"
                        />
                      )}
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
                  {bundleImageErrors[currentProduct.id] && (
                    <span className="text-[10px] text-red-500 mt-1 block">{bundleImageErrors[currentProduct.id]}</span>
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
// Package Stepper Modal
// ─────────────────────────────────────────────────────────────
function PackageModal({ pkg, onClose, onAddToCart, showToast }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [packageAnswers, setPackageAnswers] = useState({});
  const [packageImages, setPackageImages] = useState({}); 
  const [packageImageErrors, setPackageImageErrors] = useState({}); 
  const [errors, setErrors] = useState({});
  const components = pkg.package_components || [];

  if (!pkg || components.length === 0) return null;

  const currentProduct = components[currentStep];
  const hasFields = currentProduct.order_slip_fields && currentProduct.order_slip_fields.length > 0;
  const allowsImageUpload = Boolean(currentProduct.allow_file_upload);
  const isLastStep = currentStep === components.length - 1;

  const handleAnswerChange = (label, value) => {
    setPackageAnswers(prev => ({
      ...prev,
      [currentProduct.id]: {
        ...(prev[currentProduct.id] || {}),
        [label]: value
      }
    }));
    setErrors(prev => ({
      ...prev,
      [label]: false
    }));
  };

  const handleImageChange = (file) => {
    if (file && file.size > MAX_FILE_SIZE_BYTES) {
      setPackageImageErrors(prev => ({ ...prev, [currentProduct.id]: `File is too large. Maximum size is ${MAX_FILE_SIZE_LABEL}.` }));
      setPackageImages(prev => ({ ...prev, [currentProduct.id]: null }));
      return;
    }
    setPackageImageErrors(prev => ({ ...prev, [currentProduct.id]: '' }));
    setPackageImages(prev => ({
      ...prev,
      [currentProduct.id]: file
    }));
  };

  const handleNext = () => {
    if (hasFields) {
      const newErrors = {};
      currentProduct.order_slip_fields.forEach(field => {
        const answer = packageAnswers[currentProduct.id]?.[field.label];
        if (isSlipAnswerEmpty(field, answer)) {
          newErrors[field.label] = true;
        }
      });
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    }

    if (!isLastStep) {
      setErrors({});
      setCurrentStep(prev => prev + 1);
    } else {
      const hasAnyImage = Object.values(packageImages).some(Boolean);
      onAddToCart({
        ...pkg,
        qty: 1,
        price: pkg.price,
        type: 'package',
        // Ang `pkg.id` ay may `package-` prefix (cart id) — ang totoong uuid ng
        // package ay nasa `pkg.packageId`. Dati, ang prefixed id ang naipapasa sa
        // backend kaya pumapalya ang pagbuo ng order pagkatapos ng bayad.
        packageId: pkg.packageId || pkg.id,
        products: components, 
        selected_price_options: null,
        order_slip_details: pruneEmptySlipAnswers(packageAnswers),
        inspiration_image: hasAnyImage ? packageImages : null
      });
      onClose();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setErrors({});
      setCurrentStep(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#1F1108]/60 z-[4000] flex items-center justify-center p-4">
      <div className="bg-[#FCFAF9] w-full max-w-[420px] lg:max-w-[500px] max-h-[90vh] rounded-2xl flex flex-col shadow-xl overflow-hidden">

        <div className="flex flex-col gap-2 p-5 bg-white border-b border-[#EAE4E0] shrink-0 z-10">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#B7A99F] block mb-1">Package</span>
              <h2 className="text-xl font-serif text-[#3B1F0A] leading-tight truncate">{pkg.name}</h2>
              <p className="text-sm font-bold text-[#5A453C]">₱{Number(pkg.price).toLocaleString()}</p>
              <p className="text-xs text-[#8A7264] leading-snug mt-1">{components.map(c => c.name).join(' + ')}</p>
            </div>
            <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] transition-colors"><X size={18} /></button>
          </div>

          <div className="flex items-center gap-2 mt-2">
            {components.map((_, idx) => (
              <div key={idx} className={`h-1.5 flex-1 rounded-full ${idx <= currentStep ? 'bg-[#3B1F0A]' : 'bg-[#EAE4E0]'}`} />
            ))}
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#8A7264] mt-1">
            Item {currentStep + 1} of {components.length}: <span className="text-[#3B1F0A]">{currentProduct.name}</span>
          </p>
        </div>

        <div className="p-5 flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin">
          {!hasFields && !allowsImageUpload ? (
             <div className="flex flex-col items-center justify-center py-10 text-center">
               <Package size={32} className="text-[#DED4CC] mb-3" />
               <p className="text-sm font-semibold text-[#5A453C]">No customization needed for this item.</p>
               <p className="text-xs text-[#8A7264] mt-1">You can proceed to the next item.</p>
             </div>
          ) : (
            <div className="flex flex-col gap-4">
              {hasFields && currentProduct.order_slip_fields.map((field, index) => {
                if (field.type === 'Multi-image') {
                  return (
                    <div key={index} className="flex flex-col w-full basis-full">
                      <MultiImageField
                        label={field.label}
                        value={packageAnswers[currentProduct.id]?.[field.label] || []}
                        onChange={files => handleAnswerChange(field.label, files)}
                        max={field.maxImages}
                        error={!!errors[field.label]}
                      />
                    </div>
                  );
                }
                if (field.type === 'Select') {
                  return (
                    <div key={index} className="flex flex-col w-full">
                      <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>{field.label}</label>
                      <select
                        className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`}
                        value={packageAnswers[currentProduct.id]?.[field.label] || ''}
                        onChange={e => handleAnswerChange(field.label, e.target.value)}
                      >
                        <option value="" disabled>Select {field.label}...</option>
                        {field.options?.map((opt, i) => (
                          <option key={i} value={opt}>{opt}</option>
                        ))}
                      </select>
                      {errors[field.label] && <span className="text-[10px] text-red-500 mt-1 block">This field is required</span>}
                    </div>
                  );
                }
                if (field.type === 'Textarea') {
                  return (
                    <div key={index} className="flex flex-col w-full">
                      <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>{field.label}</label>
                      <textarea
                        placeholder={`Enter ${field.label}...`}
                        className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none resize-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`}
                        rows={3}
                        value={packageAnswers[currentProduct.id]?.[field.label] || ''}
                        onChange={e => handleAnswerChange(field.label, e.target.value)}
                      />
                      {errors[field.label] && <span className="text-[10px] text-red-500 mt-1 block">This field is required</span>}
                    </div>
                  );
                }
                return (
                  <div key={index} className="flex flex-col w-full">
                    <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>{field.label}</label>
                    <input
                      type={field.type === 'Number' ? 'number' : 'text'}
                      placeholder={`Enter ${field.label}...`}
                      className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`}
                      value={packageAnswers[currentProduct.id]?.[field.label] || ''}
                      onChange={e => handleAnswerChange(field.label, e.target.value)}
                    />
                    {errors[field.label] && <span className="text-[10px] text-red-500 mt-1 block">This field is required</span>}
                  </div>
                );
              })}

              {allowsImageUpload && (
                <div className={hasFields ? 'border-t border-[#EAE4E0] pt-4' : ''}>
                  <label className="text-xs font-semibold text-[#8A7264] mb-1 block">Upload Reference Image (Optional)</label>
                  <p className="text-[10px] text-[#B7A99F] mb-1.5">Max file size: 5MB</p>

                  {!packageImages[currentProduct.id] ? (
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
                      <span className="text-xs text-[#4A3B36] truncate min-w-0 flex-1">{packageImages[currentProduct.id].name}</span>
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
                  {packageImageErrors[currentProduct.id] && (
                    <span className="text-[10px] text-red-500 mt-1 block">{packageImageErrors[currentProduct.id]}</span>
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
            {isLastStep ? 'Add Package to Cart' : 'Next Item'}
            {!isLastStep && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Normal Product Modal
// ─────────────────────────────────────────────────────────────
function ProductModal({ product, onClose, onAddToCart, showToast }) {
  const [slipAnswers, setSlipAnswers] = useState({});
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [imageError, setImageError] = useState('');
  
  const [selectedPriceOptions, setSelectedPriceOptions] = useState({});
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  if (!product) return null;

  const handleImagePick = (file) => {
    if (!file) {
      setImageFile(null);
      setImageError('');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setImageError(`File is too large. Maximum size is ${MAX_FILE_SIZE_LABEL}.`);
      setImageFile(null);
      return;
    }
    setImageError('');
    setImageFile(file);
  };

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
    setErrors(prev => ({
      ...prev,
      [label]: false
    }));
  };

  const handleAdd = () => {
    const newErrors = {};

    if (isVariable) {
      product.price_groups.forEach(g => {
        if (!selectedPriceOptions[g.name]) {
          newErrors[g.name] = true;
        }
      });
    }

    if (isVariable && !allGroupsSelected) {
      setErrors(newErrors);
      return;
    }

    if (isVariable && missingCombo) {
      return;
    }

    if (hasFields) {
      product.order_slip_fields.forEach(field => {
        const answer = slipAnswers[field.label];
        if (isSlipAnswerEmpty(field, answer)) {
          newErrors[field.label] = true;
        }
      });
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    onAddToCart({ 
      ...product, 
      qty: 1, 
      price: isVariable ? resolvedPrice : product.price,
      selected_price_options: isVariable ? selectedPriceOptions : null,
      order_slip_details: hasFields ? pruneEmptySlipAnswers(slipAnswers) : null,
      inspiration_image: imageFile 
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-[#1F1108]/60 z-[4000] flex items-center justify-center p-4">
      <div className="bg-[#FCFAF9] w-full max-w-[420px] lg:max-w-[620px] rounded-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden">

        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 bg-white border-b border-[#EAE4E0] shrink-0 z-10">
          <div className="flex-1 min-w-0">
            <h2 className="text-xl sm:text-2xl font-serif text-[#3B1F0A] leading-tight mb-1.5 truncate">{product.name}</h2>
            {product.inclusion && (
              <p className="text-xs text-[#8A7264] mb-1.5 leading-snug">{product.inclusion}</p>
            )}
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

        <div className="p-4 sm:p-6 flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin">
          {isVariable && (
            <div className="flex flex-col gap-4 mb-6">
              <p className="text-[11px] font-bold text-[#5A453C] uppercase tracking-wider">Product Options</p>
              <div className="flex flex-wrap gap-x-4 gap-y-4">
                {product.price_groups.map((group, index) => (
                  <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                    <label className={`text-xs font-semibold mb-1.5 ${errors[group.name] ? 'text-red-500' : 'text-[#8A7264]'}`}>{group.name} *</label>
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
                  if (field.type === 'Multi-image') {
                    return (
                      <div key={index} className="flex flex-col w-full basis-full">
                        <MultiImageField
                          label={field.label}
                          value={slipAnswers[field.label] || []}
                          onChange={files => handleAnswerChange(field.label, files)}
                          max={field.maxImages}
                          error={!!errors[field.label]}
                        />
                      </div>
                    );
                  }
                  if (field.type === 'Select') {
                    return (
                      <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                        <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>{field.label}</label>
                        <select className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} onChange={e => handleAnswerChange(field.label, e.target.value)} defaultValue="">
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
                        <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>{field.label}</label>
                        <textarea placeholder={`Enter ${field.label}...`} className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none resize-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} rows={3} onChange={e => handleAnswerChange(field.label, e.target.value)} />
                        {errors[field.label] && <span className="text-[10px] text-red-500 mt-1">This field is required</span>}
                      </div>
                    );
                  }
                  return (
                    <div key={index} className="flex flex-col flex-1 basis-[160px] min-w-[160px]">
                      <label className={`text-xs font-semibold mb-1.5 ${errors[field.label] ? 'text-red-500' : 'text-[#8A7264]'}`}>{field.label}</label>
                      <input type={field.type === 'Number' ? 'number' : 'text'} placeholder={`Enter ${field.label}...`} className={`w-full border bg-white p-3 rounded-xl text-sm focus:outline-none transition-colors ${errors[field.label] ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`} onChange={e => handleAnswerChange(field.label, e.target.value)} />
                      {errors[field.label] && <span className="text-[10px] text-red-500 mt-1">This field is required</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {product.allow_file_upload && (
            <div className={`mb-2 ${isVariable || hasFields ? 'border-t border-[#EAE4E0] pt-6' : ''}`}>
              <label className="text-xs font-semibold text-[#8A7264] mb-1 block">Upload Reference Image (Optional)</label>
              <p className="text-[10px] text-[#B7A99F] mb-1.5">Max file size: 5MB</p>

              {!imageFile ? (
                <label className="flex items-center w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 text-xs rounded-xl cursor-pointer focus-within:border-[#5A453C] transition-colors">
                  <span className="mr-3 py-1 px-3 rounded-lg border-0 text-[10px] font-bold uppercase bg-white text-[#4A3B36] shrink-0">Choose File</span>
                  <span className="text-[#8A7264] truncate">No file chosen</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImagePick(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="flex items-center gap-2.5 w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 pl-2 rounded-xl">
                  {imagePreviewUrl && (
                    <img
                      src={imagePreviewUrl}
                      alt="Preview ng napiling reference image"
                      className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[#DED4CC]"
                    />
                  )}
                  <span className="text-xs text-[#4A3B36] truncate min-w-0 flex-1">{imageFile.name}</span>
                  <button
                    type="button"
                    onClick={() => handleImagePick(null)}
                    aria-label="Remove file"
                    className="ml-3 w-6 h-6 rounded-full bg-white text-[#8A7264] flex items-center justify-center shrink-0 hover:bg-[#EAE4E0] hover:text-[#3B1F0A] transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}
              {imageError && <span className="text-[10px] text-red-500 mt-1 block">{imageError}</span>}
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

  const isBundleGrid = product.type === 'bundle' && !product.custom_image_url && product.products && product.products.length > 0;

  const renderGrid = () => {
    const products = product.products;
    const MAX_IMAGE_SLOTS = 3;
    const showCountTile = products.length > MAX_IMAGE_SLOTS;
    const imageSlots = showCountTile ? products.slice(0, MAX_IMAGE_SLOTS - 1) : products;
    const extraCount = products.length - imageSlots.length;
    const segmentCount = imageSlots.length + (showCountTile ? 1 : 0);

    return (
      <div className="relative w-full h-[50vh] sm:h-[60vh] flex rounded-[14px] overflow-hidden bg-[#F5EFEB]">
        {imageSlots.map((p, idx) => {
          const img = p.image_url || p.image;
          return (
            <div key={p.id ?? idx} className="flex-1 h-full relative overflow-hidden">
              {img ? (
                <img src={img} alt={p.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#F5EFEB] flex items-center justify-center">
                  <Package size={32} className="text-[#DED4CC]" />
                </div>
              )}
            </div>
          );
        })}

        {showCountTile && (
          <div className="flex-1 h-full bg-[#3B1F0A] flex flex-col items-center justify-center text-white">
            <span className="text-3xl sm:text-4xl font-extrabold leading-none">+{extraCount}</span>
            <span className="text-xs font-bold uppercase tracking-wide opacity-80 mt-1">more</span>
          </div>
        )}

        {Array.from({ length: segmentCount - 1 }).map((_, i) => (
          <div
            key={i}
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center"
            style={{ left: `${(100 / segmentCount) * (i + 1)}%` }}
          >
            <Plus size={20} className="text-[#3B1F0A]" strokeWidth={3} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[#1F1108]/80 backdrop-blur-md z-[5000] flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200" onClick={onClose}>
      <div className="relative w-full max-w-2xl flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-4 -right-2 sm:-top-3 sm:-right-3 w-9 h-9 rounded-full bg-white text-[#3B1F0A] flex items-center justify-center shadow-lg hover:bg-[#F5EFEB] active:scale-95 transition-all z-10"><X size={18} /></button>
        <div className="p-2 sm:p-3 bg-gradient-to-br from-[#EFE0C8] via-[#FCFAF9] to-[#DDC3A0] rounded-[22px] shadow-2xl w-full">
          <div className="rounded-2xl border border-[#3B1F0A]/25 p-1">
            {isBundleGrid ? (
              renderGrid()
            ) : (
              <img src={product.custom_image_url || product.image_url} alt={product.name} className="w-full max-h-[65vh] sm:max-h-[70vh] object-contain rounded-[14px] bg-[#F5EFEB]" />
            )}
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

function resolveBundleOrderType(products = []) {
  if (products.some(p => p.order_type === 'Pre-order')) return 'Pre-order';
  if (products.some(p => p.order_type === 'Pick-up Today')) return 'Pick-up Today';
  return 'Both';
}

function hasDailyLimitSet(item) {
  return item?.daily_limit !== null && item?.daily_limit !== undefined && Number(item.daily_limit) > 0;
}

// Ang limit ng Bundle/Package ay galing LAMANG sa mga component products —
// walang sariling limit. Para sa bawat component: floor(available ÷ kailangan
// kada 1 bundle/package); ang pinakamaliit sa lahat ang bilang na pwedeng i-order.
// `components`: [{ product, qty }] (product galing sa allProducts, may available_stock).
function computeComponentStock(components = [], orderType = 'Both') {
  const byId = new Map();
  for (const { product, qty } of components) {
    if (!product) continue;
    const need = Number(qty) > 0 ? Number(qty) : 1;
    const entry = byId.get(String(product.id));
    if (entry) entry.need += need;
    else byId.set(String(product.id), { product, need });
  }
  const tracked = [...byId.values()].filter(({ product: p }) =>
    hasDailyLimitSet(p) || (p.stock_quantity !== null && p.stock_quantity !== undefined));
  if (tracked.length === 0) return { stock: 999, tracked: false };

  const stock = Math.min(...tracked.map(({ product: p, need }) => {
    const basis = hasDailyLimitSet(p) ? p.daily_limit : p.stock_quantity;
    const preOrder = orderType === 'Pre-order' ? p.pre_order_available_stock : undefined;
    const available = preOrder ?? p.available_stock ?? basis ?? 0;
    return Math.floor(Number(available) / need);
  }));
  return { stock: Math.max(0, stock), tracked: true };
}

function isQuantityTracked(item) {
  if (!item) return false;
  if (item.type === 'bundle' || item.type === 'package') return item.is_tracked; 
  if (item.is_celebration_material) return true;
  return hasDailyLimitSet(item) || (item.stock_quantity !== null && item.stock_quantity !== undefined);
}

function getQuantityLimit(item) {
  if (item.type === 'bundle' || item.type === 'package') return item.available_stock;
  const basis = hasDailyLimitSet(item) ? item.daily_limit : item.stock_quantity;
  return item.available_stock ?? basis ?? 0;
}

// ─────────────────────────────────────────────────────────────
// Module-level cache
// ─────────────────────────────────────────────────────────────
let menuProductsFetchPromise = null;
function getMenuProducts() {
  if (!menuProductsFetchPromise) {
    menuProductsFetchPromise = fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products`)
      .then(res => res.json())
      .then(json => (json.success && Array.isArray(json.data))
        ? json.data.map(p => ({
            ...p,
            order_slip_fields: p.order_slip_fields || [],
            pricing_mode: p.pricing_mode || 'fixed',
            price_groups: p.price_groups || [],
            price_matrix: p.price_matrix || []
          }))
        : [])
      .catch(err => {
        console.error('Failed to fetch products:', err);
        return [];
      });
  }
  return menuProductsFetchPromise;
}

let menuBundlesFetchPromise = null;
function getMenuBundles() {
  if (!menuBundlesFetchPromise) {
    menuBundlesFetchPromise = fetch(`${import.meta.env.VITE_API_URL}/online-ordering/products/bundles`)
      .then(res => res.json())
      .then(json => (json.success && Array.isArray(json.data)) ? json.data : [])
      .catch(err => {
        console.error('Failed to load promo bundles:', err);
        return [];
      });
  }
  return menuBundlesFetchPromise;
}

export default function Menu({ cart, setCart }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.category || 'All');
  const [searchQuery, setSearchQuery] = useState('');
  const [modal, setModal] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [rawProducts, setRawProducts] = useState([]);
  const [rawBundles, setRawBundles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [toast, setToast] = useState(null); 
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

  useEffect(() => {
    window.scrollTo(0, 0);
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
    let cancelled = false;

    Promise.all([getMenuProducts(), getMenuBundles()]).then(([productsData, bundlesData]) => {
      if (cancelled) return;
      setRawProducts(productsData);
      setRawBundles(bundlesData);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, []);

  const products = useMemo(() => {
    const allProducts = rawProducts;
    const bundlesData = rawBundles;

    const activeBundlesAndPackages = bundlesData
      .filter(b => b.is_active && b.is_within_date_range !== false)
      .map(b => {
        const fallbackImage = b.products && b.products.length > 0 ? (b.products[0].image_url || b.products[0].image) : null;

        if (b.category === 'Package') {
           const packageComponents = (b.package_items || [])
              .map(pi => {
                  const cp = allProducts.find(p => String(p.id) === String(pi.product_id));
                  return cp ? { ...cp, package_qty: pi.quantity } : null;
              })
              .filter(Boolean);

           const packageOrderType = b.order_type || 'Both';
           const { stock: packageStock, tracked: isPackageTracked } = computeComponentStock(
             (b.package_items || []).map(pi => ({
               product: allProducts.find(p => String(p.id) === String(pi.product_id)),
               qty: pi.quantity
             })),
             packageOrderType
           );

           return {
              ...b,
              id: `package-${b.id}`,
              name: b.bundle_name,
              category: 'Package',
              type: 'package',
              packageId: b.id,
              package_components: packageComponents,
              inclusion: getPackageInclusion(b, allProducts),
              image_url: b.custom_image_url || fallbackImage,
              custom_image_url: b.custom_image_url,
              price: Number(b.bundle_price || b.discounted_price || 0),
              original_price: Number(b.original_total || 0),
              order_type: packageOrderType, 
              pricing_mode: 'fixed',
              available_stock: Math.max(0, packageStock), 
              is_tracked: isPackageTracked,
              order_slip_fields: [],
              price_groups: [],
              price_matrix: []
           };
        }

        const bundleProducts = (b.product_ids || []).map(id => allProducts.find(p => String(p.id) === String(id))).filter(Boolean);
        const bundleOrderType = b.order_type || resolveBundleOrderType(bundleProducts);
        
        const { stock: bundleStock, tracked: isBundleTracked } = computeComponentStock(
          (b.product_ids || []).map(id => ({
            product: allProducts.find(p => String(p.id) === String(id)),
            qty: 1
          })),
          bundleOrderType
        );

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
          order_type: bundleOrderType,
          pricing_mode: 'fixed',
          available_stock: Math.max(0, bundleStock),
          is_tracked: isBundleTracked,
          type: 'bundle',
          bundleId: b.id,
          order_slip_fields: [],
          price_groups: [],
          price_matrix: []
        };
      });

    const regularProducts = allProducts.filter(p => p.category !== 'Package');

    return [...activeBundlesAndPackages, ...regularProducts];
  }, [rawProducts, rawBundles]);

  const categories = useMemo(() => {
    const base = ['Package', 'Cake', 'Pastry', 'Celebration Material'];
    const hasActiveBundles = rawBundles.some(b => b.is_active && b.is_within_date_range !== false && b.category !== 'Package');
    return hasActiveBundles ? ['Promo Bundle', ...base] : base;
  }, [rawBundles]);

  const addToCart = (item) => {
    setCart(prev => {
      const currentSlipStr = slipSignature(item.order_slip_details);
      const currentOptionsStr = JSON.stringify(item.selected_price_options);
      
      const idx = prev.findIndex(i => 
        i.id === item.id && 
        slipSignature(i.order_slip_details) === currentSlipStr &&
        JSON.stringify(i.selected_price_options) === currentOptionsStr
      );

      const currentQtyInCart = prev.filter(i => i.id === item.id).reduce((s, i) => s + i.qty, 0);

      if (isQuantityTracked(item)) {
        const limit = getQuantityLimit(item);
        if (currentQtyInCart + item.qty > limit) {
          showToast(`Sorry, you've reached the available limit for ${item.name}.`);
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

  const removeItem = (index) => setCart(prev => prev.filter((_, i) => i !== index));

  const replaceCartItemImage = (index, file) => setCart(prev => prev.map(
    (item, i) => (i === index ? { ...item, inspiration_image: file } : item)
  ));

  // Multi-image order slip fields: palitan / idagdag / burahin ang mga larawan
  // ng isang cart line (nire-replace ang buong order_slip_details ng line na iyon).
  const updateCartItemSlip = (index, nextSlip) => setCart(prev => prev.map(
    (item, i) => (i === index ? { ...item, order_slip_details: nextSlip } : item)
  ));

  const [expandedCartIndexes, setExpandedCartIndexes] = useState(() => new Set());
  const toggleCartItemExpanded = (i) => {
    setExpandedCartIndexes(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };
  const [openSwipeIndex, setOpenSwipeIndex] = useState(null);
  const [cartImagePreviewSrc, setCartImagePreviewSrc] = useState(null);

  const [cartImageBlobUrls, setCartImageBlobUrls] = useState({});
  useEffect(() => {
    const urls = {};
    cart.forEach((item, i) => {
      let file = null;
      if (item.inspiration_image instanceof File) {
        file = item.inspiration_image;
      } else if (item.inspiration_image && typeof item.inspiration_image === 'object') {
        file = Object.values(item.inspiration_image).find(v => v instanceof File);
      }
      if (file) urls[i] = URL.createObjectURL(file);
    });
    setCartImageBlobUrls(urls);
    return () => {
      Object.values(urls).forEach(u => URL.revokeObjectURL(u));
    };
  }, [cart]);

  const normalizeCartSrc = (src) => {
    if (!src || typeof src !== 'string') return null;
    if (!src.startsWith('http') && !src.startsWith('blob:') && !src.startsWith('data:')) {
      return `${import.meta.env.VITE_API_URL}/uploads/${src.replace(/^\//, '')}`;
    }
    return src;
  };

  const resolveCartImageSrc = (item) =>
    normalizeCartSrc(item.custom_image_url || item.image_url || item.image);

  const resolveAttachedImageSrc = (item, i) => {
    let src = cartImageBlobUrls[i];
    if (!src) {
      if (typeof item.inspiration_image === 'string') {
        src = item.inspiration_image;
      } else if (item.inspiration_image && typeof item.inspiration_image === 'object') {
        src = Object.values(item.inspiration_image).find(v => typeof v === 'string');
      }
    }
    return normalizeCartSrc(src);
  };

  const changeQty = (index, delta) => setCart(prev => {
    const newCart = [...prev];
    const item = newCart[index];
    const newQty = item.qty + delta;

    if (isQuantityTracked(item) && delta > 0) {
      const currentQtyInCart = prev.filter(i => i.id === item.id).reduce((s, i) => s + i.qty, 0);
      const limit = getQuantityLimit(item);
      if (currentQtyInCart + delta > limit) {
        showToast(`Limit reached for ${item.name}.`);
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
    return products.filter(p => !q || p.name.toLowerCase().includes(q));
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

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-4">
            {catProducts.map(p => {
              const isStockTracked = isQuantityTracked(p);
              const currentStock = getQuantityLimit(p);
              const isSoldOut = isStockTracked && currentStock <= 0;
              const inclusionText = p.type !== 'bundle' ? (p.inclusion || '') : '';

              return (
                <div key={p.id} className="bg-white rounded-2xl border border-[#EAE4E0] overflow-hidden flex flex-col group shadow-sm relative">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[#F5EFEB] shrink-0">
                    
                    {p.type === 'bundle' ? (
                       <BundleMenuImage products={p.products} customImageUrl={p.custom_image_url} />
                    ) : (
                       <img src={p.image_url} alt={p.name} className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105 group-hover:blur-[3px] group-hover:brightness-[0.55]" />
                    )}

                    {isSoldOut ? (
                      <div className="absolute top-2 left-2 px-2.5 py-1 rounded-md shadow-sm border border-white/20 z-10 backdrop-blur-sm bg-red-500/90 text-white">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Sold Out</span>
                      </div>
                    ) : p.order_type === 'Pre-order' && (
                      <div className="absolute top-2 left-2 px-2.5 py-1 rounded-md shadow-sm border border-white/20 z-10 backdrop-blur-sm bg-white/90 text-[#3B1F0A]">
                        <span className="text-[10px] font-bold uppercase tracking-wider">Pre-order Only</span>
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
                    <div className="flex-1 mb-2">
                      <h3 className="font-bold text-xs sm:text-sm lg:text-xs text-[#3B1F0A] leading-snug line-clamp-2">{p.name}</h3>

                      {p.type === 'bundle' && (
                        <p
                          className="text-[10px] sm:text-[11px] text-[#8A7264] truncate mt-0.5"
                          title={getBundleDescription(p)}
                        >
                          {getBundleDescription(p)}
                        </p>
                      )}

                      {inclusionText && (
                        <p
                          className="text-[10px] sm:text-[11px] text-[#8A7264] leading-snug line-clamp-2 mt-1"
                          title={inclusionText}
                        >
                          {inclusionText}
                        </p>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm lg:text-xs font-bold text-[#5A453C] mb-2 lg:mb-2">
                       {p.type === 'bundle' && p.discount_percent > 0 && p.original_price > 0 && (
                         <span className="text-[10px] sm:text-[11px] text-[#B7A99F] line-through font-normal mr-1.5">
                           ₱{p.original_price.toLocaleString()}
                         </span>
                       )}
                       ₱{Number(p.price).toLocaleString()}
                    </p>

                    <button
                      onClick={() => {
                        if (isSoldOut) return;
                        const needsModal = p.type === 'bundle' || p.type === 'package' || (p.order_slip_fields && p.order_slip_fields.length > 0) || p.allow_file_upload;
                        
                        needsModal ? setModal(p) : addToCart({ ...p, qty: 1, order_slip_details: null, selected_price_options: null });
                      }}
                      disabled={isSoldOut}
                      className={`w-full py-2 sm:py-2.5 lg:py-2 rounded-full text-[11px] sm:text-xs font-semibold transition-colors ${
                        isSoldOut 
                          ? 'bg-[#EAE4E0] text-[#8A7264] cursor-not-allowed' 
                          : 'bg-[#3B1F0A] text-white hover:bg-[#2A1608]'
                      }`}
                    >
                      {isSoldOut ? 'Out of Stock' : 'Add to Cart'}
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
              
              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isSearching ? 'max-h-0 opacity-0' : 'max-h-20 opacity-100'}`}>
                <div className="flex w-full justify-between sm:justify-start gap-2 sm:gap-6 overflow-x-auto scrollbar-hide border-b border-[#EAE4E0] -mx-3 px-3 sm:mx-0 sm:px-0">
                  {['All', ...categories].map(cat => {
                    const Icon = getCategoryIcon(cat);
                    return (
                      <button 
                        key={cat} 
                        onClick={() => setActiveTab(cat)}
                        title={cat}
                        aria-label={cat}
                        className={`shrink-0 flex items-center justify-center sm:justify-start gap-1.5 pb-2.5 px-1.5 sm:px-0 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                          activeTab === cat 
                            ? 'border-[#3B1F0A] text-[#3B1F0A]' 
                            : 'border-transparent text-[#8A7264] hover:text-[#3B1F0A]'
                        }`}
                      >
                        <Icon size={20} className="sm:hidden" />
                        <span className="hidden sm:inline">{cat}</span>
                      </button>
                    );
                  })}
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
                  <CartItemRow
                    key={i}
                    item={item}
                    index={i}
                    changeQty={changeQty}
                    onRemove={removeItem}
                    expanded={expandedCartIndexes.has(i)}
                    onToggleExpand={toggleCartItemExpanded}
                    imageSrc={resolveCartImageSrc(item)}
                    attachedImageSrc={resolveAttachedImageSrc(item, i)}
                    onPreviewImage={setCartImagePreviewSrc}
                    variant="desktop"
                    onReplaceImage={replaceCartItemImage}
                    onUpdateSlip={updateCartItemSlip}
                  />
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
                <CartItemRow
                  key={i}
                  item={item}
                  index={i}
                  changeQty={changeQty}
                  onRemove={removeItem}
                  expanded={expandedCartIndexes.has(i)}
                  onToggleExpand={toggleCartItemExpanded}
                  imageSrc={resolveCartImageSrc(item)}
                  attachedImageSrc={resolveAttachedImageSrc(item, i)}
                  onPreviewImage={setCartImagePreviewSrc}
                  variant="mobile"
                  onReplaceImage={replaceCartItemImage}
                  onUpdateSlip={updateCartItemSlip}
                  openSwipeIndex={openSwipeIndex}
                  setOpenSwipeIndex={setOpenSwipeIndex}
                />
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
        <BundleModal bundle={modal} onClose={() => setModal(null)} onAddToCart={addToCart} showToast={showToast} />
      ) : modal && modal.type === 'package' ? (
        <PackageModal pkg={modal} onClose={() => setModal(null)} onAddToCart={addToCart} showToast={showToast} />
      ) : modal ? (
        <ProductModal product={modal} onClose={() => setModal(null)} onAddToCart={addToCart} showToast={showToast} />
      ) : null}

      {previewImage && <ImagePreviewModal product={previewImage} onClose={() => setPreviewImage(null)} />}

      {cartImagePreviewSrc && (
        <div
          className="fixed inset-0 z-[5000] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setCartImagePreviewSrc(null)}
        >
          <img
            src={cartImagePreviewSrc}
            alt="Reference image"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-full rounded-2xl object-contain"
          />
          <button
            onClick={() => setCartImagePreviewSrc(null)}
            aria-label="Close image preview"
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      )}

      {cartCount > 0 && <div className="lg:hidden h-24"></div>}
      <Footer />
    </div>
  );
}