import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

// Rate limiter: 5MB max para sa mga reference/inspiration image na iuupload
// ng customer, para hindi mabilis maubos ang Supabase Storage.
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = '5MB';

export default function OrderSlip({ product, onClose, onConfirm }) {
  const [slipAnswers, setSlipAnswers] = useState({});
  const [imageFile, setImageFile] = useState(null);
  const [imageError, setImageError] = useState('');
  const [selectedPriceOptions, setSelectedPriceOptions] = useState({});
  
  // State para sa pag-track ng errors
  const [errors, setErrors] = useState({});

  // This modal is only ever mounted while it's open (parent renders it
  // conditionally via `{slipModalItem && <OrderSlip .../>}`). It's portaled
  // straight to <body> below (see the `createPortal` call), matching the
  // pattern already used for the other POS modals — that way a plain
  // <body>/<html> scroll lock is guaranteed to work, regardless of whatever
  // scroll container the surrounding POS page/layout happens to use.
  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  const handleImagePick = (file) => {
    if (!file) {
      setImageFile(null);
      setImageError('');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setImageError(`Masyadong malaki ang file (max ${MAX_FILE_SIZE_LABEL} lang).`);
      setImageFile(null);
      return;
    }
    setImageError('');
    setImageFile(file);
  };

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
    // Aalisin ang error kapag nag-input na si user
    setErrors(prev => ({
      ...prev,
      [label]: false
    }));
  };

  const handleAdd = () => {
    const newErrors = {};

    // 1. Validation para sa Product Options (Variations)
    if (isVariable && !allGroupsSelected) {
      product.price_groups.forEach(g => {
        if (!selectedPriceOptions[g.name]) {
          newErrors[g.name] = true;
        }
      });
    }

    if (isVariable && missingCombo) {
      // Kung missing combo, disabled na rin ang Add Button sa UI
      return; 
    }

    // 2. Validation para sa Customization Details (Order Slip)
    if (hasFields) {
      product.order_slip_fields.forEach(field => {
        // Tinitignan kung optional ba ang field
        const isOptional = field.optional === true || field.isOptional === true || field.required === false;
        
        if (!isOptional) {
          const answer = slipAnswers[field.label];
          if (!answer || answer.trim() === '') {
            newErrors[field.label] = true;
          }
        }
      });
    }

    // 3. Kung may error, i-set sa state at pigilang mag-add to cart
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Kapag pasado, ipapasa pabalik sa posPage ang kumpletong data
    onConfirm({ 
      ...product, 
      qty: 1, 
      price: isVariable ? resolvedPrice : product.price,
      selected_price_options: isVariable ? selectedPriceOptions : null,
      order_slip_details: hasFields ? slipAnswers : null,
      inspiration_image: imageFile 
    });
  };

  return createPortal(
    <div className="fixed inset-0 bg-[#1F1108]/60 z-[4000] flex items-center justify-center p-4">
      <div className="bg-[#FCFAF9] w-full max-w-[420px] lg:max-w-[620px] rounded-2xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">

        {/* STICKY HEADER */}
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

        {/* SCROLLABLE CONTENT BODY */}
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto overscroll-contain scrollbar-thin">

          {isVariable && (
            <div className="flex flex-col gap-4 mb-6">
              <p className="text-[11px] font-bold text-[#5A453C] uppercase tracking-wider">Product Options</p>
              <div className="flex flex-wrap gap-x-4 gap-y-4">
                {product.price_groups.map((group, index) => (
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
                <div className="flex items-center justify-between w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 pl-3 rounded-xl">
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

          {/* BUTTONS */}
          <div className={`flex flex-col sm:flex-row-reverse gap-2 ${product.allow_file_upload || isVariable || hasFields ? 'mt-6 pt-6 border-t border-[#EAE4E0]' : ''}`}>
            <button
              onClick={handleAdd}
              disabled={isVariable && missingCombo}
              className={`flex-1 px-4 py-3 rounded-xl text-xs font-bold transition-colors shadow-sm ${isVariable && missingCombo ? 'bg-[#EAE4E0] text-[#8A7264] cursor-not-allowed' : 'bg-[#3B1F0A] text-white hover:bg-[#2A1608]'}`}
            >
              Add to Order
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
    </div>,
    document.body
  );
}