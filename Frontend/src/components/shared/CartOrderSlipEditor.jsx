import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, ImagePlus, CheckCircle2, AlertCircle, ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import MultiImageField, { MAX_IMAGE_BYTES } from './MultiImageField';
import { isSlipAnswerEmpty, setSlipValue } from './orderSlipUploads';

const isOptionalField = (field) => field.optional === true || field.isOptional === true || field.required === false;

// Cart-side editor for the order-slip fields already defined on the product.
// - Bottom sheet on mobile, centered dialog on sm+.
// - Packages/bundles: ONE accordion panel open at a time (with progress chips + "Next" buttons),
//   so the form never becomes one long scroll.
// - Reference image can be replaced or removed any time before saving.
export default function CartOrderSlipEditor({ item, onClose, onSave }) {
  const [slip, setSlip] = useState(() => item.order_slip_details || {});
  const [inspiration, setInspiration] = useState(() => item.inspiration_image || (item.type === 'bundle' || item.type === 'package' ? {} : null));
  const [imageErrors, setImageErrors] = useState({});
  const [errors, setErrors] = useState({});
  const bodyRef = useRef(null);
  const multi = item.type === 'bundle' || item.type === 'package';
  const components = multi ? (item.products || item.package_components || []) : [item];

  const update = (path, value) => setSlip(current => setSlipValue(current, path, value));
  const pathFor = (product, field) => multi ? [String(product.id), field.label] : [field.label];
  const valueAt = (path) => path.reduce((value, key) => value?.[key], slip);
  const imageAt = (product) => multi ? inspiration?.[String(product.id)] : inspiration;
  const imageHref = (value) => {
    if (typeof value !== 'string') return null;
    if (/^(https?:|blob:|data:)/i.test(value)) return value;
    return `${import.meta.env.VITE_API_URL}/uploads/${value.replace(/^\//, '')}`;
  };
  const imageKeyOf = (product) => (multi ? String(product.id) : 'single');
  const keyOf = (product) => String(product.id ?? product.name);

  // Blob preview URLs are created/revoked in the places where the file actually changes (initial load,
  // pick, replace, remove, unmount) — no setState inside an effect, so no cascading renders.
  const buildPreviews = (value) => {
    const urls = {};
    const entries = multi && value && typeof value === 'object' ? Object.entries(value) : [['single', value]];
    entries.forEach(([key, file]) => { if (file instanceof File) urls[key] = URL.createObjectURL(file); });
    return urls;
  };
  const [previewUrls, setPreviewUrls] = useState(() => buildPreviews(inspiration));
  const urlsRef = useRef(previewUrls);
  useEffect(() => { urlsRef.current = previewUrls; }, [previewUrls]);
  useEffect(() => () => Object.values(urlsRef.current).forEach(url => URL.revokeObjectURL(url)), []);

  const updateImage = (product, file) => {
    const key = imageKeyOf(product);
    const current = urlsRef.current;
    if (current[key]) URL.revokeObjectURL(current[key]);
    const next = { ...current };
    if (file instanceof File) next[key] = URL.createObjectURL(file); else delete next[key];
    urlsRef.current = next;
    setPreviewUrls(next);
    setInspiration(prev => multi
      ? { ...(prev && typeof prev === 'object' ? prev : {}), [String(product.id)]: file }
      : file);
  };

  // Esc to close + lock background scroll while the editor is open
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const visible = components.filter(product =>
    (product.order_slip_fields || []).length || product.allow_file_upload || imageAt(product)
  );
  const accordion = multi && visible.length > 1;

  const requiredOf = (product) => (product.order_slip_fields || []).filter(f => !isOptionalField(f));
  const filledOf = (product) => requiredOf(product).filter(f => !isSlipAnswerEmpty(f, valueAt(pathFor(product, f)))).length;

  // which panel is open — start on the first one that still needs input
  const [openKey, setOpenKey] = useState(() => {
    const first = visible.find(p => filledOf(p) < requiredOf(p).length) || visible[0];
    return first ? keyOf(first) : null;
  });

  const goTo = (product) => {
    setOpenKey(keyOf(product));
    requestAnimationFrame(() => {
      bodyRef.current?.querySelector(`[data-panel="${CSS.escape(keyOf(product))}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  };

  const save = () => {
    const nextErrors = {};
    let firstBad = null;
    components.forEach(product => (product.order_slip_fields || []).forEach(field => {
      if (isOptionalField(field)) return;
      const path = pathFor(product, field);
      if (isSlipAnswerEmpty(field, valueAt(path))) {
        nextErrors[path.join('.')] = true;
        if (!firstBad) firstBad = product;
      }
    }));
    setErrors(nextErrors);
    if (firstBad) {
      setOpenKey(keyOf(firstBad)); // open the panel that has the missing field, then jump to it
      setTimeout(() => {
        bodyRef.current?.querySelector('[data-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 60);
      return;
    }
    onSave(slip, inspiration);
    onClose();
  };

  const errorCount = Object.keys(errors).length;
  const eyebrow = item.category || (item.type === 'bundle' ? 'Promo Bundle' : item.type === 'package' ? 'Package' : 'Order customization');

  const inputBase = 'w-full min-h-11 sm:min-h-10 border bg-white px-3 py-2 rounded-lg text-base sm:text-[13px] text-[#3B1F0A] placeholder:text-[#B7A99F] focus:outline-none focus:ring-2 transition-colors';
  const inputOk = 'border-[#DED4CC] focus:border-[#5A453C] focus:ring-[#5A453C]/15';
  const inputBad = 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-500/15';

  const pickFile = (product, imageKey) => (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) { setImageErrors(c => ({ ...c, [imageKey]: 'File is too large. Maximum size is 5MB.' })); return; }
    setImageErrors(c => ({ ...c, [imageKey]: '' }));
    updateImage(product, file);
  };

  return createPortal((
    <div className="fixed inset-0 z-5000 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Edit ${item.name} order slip`} className="bg-[#FAF7F4] w-full sm:max-w-130 lg:max-w-150 max-h-[92dvh] sm:max-h-[calc(100dvh-2rem)] rounded-t-3xl sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-[#EAE4E0] shrink-0 px-4 sm:px-6 pt-2.5 sm:pt-4 pb-3">
          <div className="sm:hidden mx-auto mb-2.5 h-1 w-10 rounded-full bg-[#DED4CC]" aria-hidden="true" />
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-[#8A7264]">{eyebrow} · Edit order slip</p>
              <h2 className="mt-0.5 text-lg sm:text-xl font-serif text-[#3B1F0A] leading-tight wrap-break-word">{item.name}</h2>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 -mr-2 -mt-1 w-11 h-11 sm:w-9 sm:h-9 sm:mr-0 sm:mt-0 rounded-full flex items-center justify-center text-[#5A453C] hover:bg-[#F5EFEB] transition-colors"><X size={18}/></button>
          </div>
          {Number.isFinite(Number(item.price)) && (
            <div className="mt-2 flex items-center justify-between gap-3">
              {item.inclusion
                ? <p className="flex-1 min-w-0 text-xs text-[#8A7264] leading-snug line-clamp-1" title={item.inclusion}>{item.inclusion}</p>
                : <span className="flex-1" />}
              <span className="shrink-0 rounded-full bg-[#F5EFEB] px-2.5 py-0.5 text-xs font-bold text-[#3B1F0A] tabular-nums">₱{Number(item.price).toLocaleString()}</span>
            </div>
          )}
        </div>

        {/* Body — NOTE: every child is shrink-0 so cards scroll instead of being squished */}
        <div ref={bodyRef} className="px-4 sm:px-5 py-3 sm:py-4 flex-1 overflow-y-auto overscroll-contain min-h-0 scrollbar-thin flex flex-col gap-3">
          {errorCount > 0 && (
            <div role="alert" className="shrink-0 flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-700">
              <AlertCircle size={18} className="shrink-0" />
              Please fill in the {errorCount} required field{errorCount > 1 ? 's' : ''} marked in red.
            </div>
          )}

          {visible.map((product, index) => {
            const fields = product.order_slip_fields || [];
            const storedImage = imageAt(product);
            const imageKey = imageKeyOf(product);
            const preview = previewUrls[imageKey] || imageHref(storedImage);
            const required = requiredOf(product);
            const filled = filledOf(product);
            const complete = required.length > 0 && filled === required.length;
            const hasError = fields.some(f => errors[pathFor(product, f).join('.')]);
            const showUpload = product.allow_file_upload || storedImage;
            const isOpen = !accordion || openKey === keyOf(product);
            const nextProduct = visible[index + 1];
            const title = multi ? product.name : 'Order slip details';

            const chip = required.length > 0 && (
              <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                hasError ? 'bg-red-50 text-red-700 border border-red-200'
                  : complete ? 'bg-green-50 text-green-800'
                  : 'bg-white text-[#5A453C] border border-[#DED4CC]'}`}>
                {hasError ? <AlertCircle size={12} /> : complete ? <CheckCircle2 size={12} /> : null}
                {hasError ? 'Needs input' : `${filled}/${required.length}`}
              </span>
            );

            const headerInner = (
              <>
                {accordion && (
                  <span className={`w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${isOpen ? 'bg-[#3B1F0A] text-white' : 'bg-white text-[#5A453C] border border-[#DED4CC]'}`} aria-hidden="true">{index + 1}</span>
                )}
                <span className="flex-1 min-w-0 text-sm font-bold text-[#3B1F0A] leading-snug wrap-break-word">{title}</span>
                {chip}
                {accordion && <ChevronDown size={16} className={`shrink-0 text-[#8A7264] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />}
              </>
            );

            return (
              <section key={keyOf(product)} data-panel={keyOf(product)} className={`shrink-0 bg-white border rounded-2xl overflow-hidden transition-colors ${hasError ? 'border-red-300' : isOpen && accordion ? 'border-[#5A453C]/40' : 'border-[#EAE4E0]'}`}>
                {accordion ? (
                  <button type="button" aria-expanded={isOpen} onClick={() => (isOpen ? setOpenKey(null) : goTo(product))}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left min-h-12 transition-colors hover:bg-[#F5EFEB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5A453C] ${isOpen ? 'bg-[#F5EFEB] border-b border-[#EAE4E0]' : 'bg-white'}`}>
                    {headerInner}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-[#F5EFEB] border-b border-[#EAE4E0]">{headerInner}</div>
                )}

                {isOpen && (
                  <div className="p-4 flex flex-col gap-4">
                    {fields.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
                        {fields.map(field => {
                          const path = pathFor(product, field);
                          const value = valueAt(path);
                          const error = errors[path.join('.')];
                          const optional = isOptionalField(field);
                          const wide = field.type === 'Multi-image' || field.type === 'Textarea';
                          const wrapClass = `flex flex-col min-w-0 ${wide ? 'sm:col-span-2' : ''}`;
                          const labelNode = (
                            <div className="flex items-baseline justify-between gap-2 mb-1">
                              <span className={`text-xs font-semibold ${error ? 'text-red-600' : 'text-[#5A453C]'}`}>
                                {field.label}{!optional && <span className="text-red-500"> *</span>}
                              </span>
                              {optional && <span className="text-[11px] text-[#B7A99F]">Optional</span>}
                            </div>
                          );
                          const errorHint = error && <span className="text-[11px] font-medium text-red-600 mt-1 block">This field is required</span>;
                          const cls = `${inputBase} ${error ? inputBad : inputOk}`;
                          const common = { 'data-invalid': error ? 'true' : undefined };

                          if (field.type === 'Multi-image') {
                            return <div key={field.label} className={wrapClass} {...common}><MultiImageField label={`${field.label}${optional ? ' (Optional)' : ' *'}`} value={Array.isArray(value) ? value : []} onChange={next => update(path, next)} max={field.maxImages} error={!!error} />{errorHint}</div>;
                          }
                          if (field.type === 'Select') {
                            return <div key={field.label} className={wrapClass} {...common}>{labelNode}<select aria-label={field.label} className={cls} value={value || ''} onChange={e => update(path, e.target.value)}><option value="" disabled>Select {field.label}...</option>{(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select>{errorHint}</div>;
                          }
                          if (field.type === 'Textarea') {
                            return <div key={field.label} className={wrapClass} {...common}>{labelNode}<textarea aria-label={field.label} placeholder={`Enter ${field.label}...`} className={`${cls} resize-none`} rows={3} value={value || ''} onChange={e => update(path, e.target.value)} />{errorHint}</div>;
                          }
                          return <div key={field.label} className={wrapClass} {...common}>{labelNode}<input aria-label={field.label} type={field.type === 'Number' ? 'number' : 'text'} inputMode={field.type === 'Number' ? 'numeric' : undefined} placeholder={`Enter ${field.label}...`} className={cls} value={value || ''} onChange={e => update(path, e.target.value)} />{errorHint}</div>;
                        })}
                      </div>
                    )}

                    {showUpload && (
                      <div className={fields.length ? 'border-t border-dashed border-[#DED4CC] pt-4' : ''}>
                        <div className="flex items-baseline justify-between gap-2 mb-1.5">
                          <span className="text-xs font-semibold text-[#5A453C]">Reference image</span>
                          <span className="text-[11px] text-[#B7A99F]">Optional · max 5MB</span>
                        </div>

                        {storedImage ? (
                          <div className="flex items-center gap-2.5 w-full border border-[#DED4CC] bg-[#FAF7F4] p-2 rounded-lg">
                            {preview
                              ? <a href={preview} target="_blank" rel="noreferrer" aria-label="View reference image" className="shrink-0"><img src={preview} alt="Reference image preview" className="w-10 h-10 rounded-md object-cover border border-[#DED4CC]" /></a>
                              : <span className="w-10 h-10 rounded-md bg-[#F5EFEB] flex items-center justify-center shrink-0 text-[#8A7264]"><ImagePlus size={16} /></span>}
                            <span className="text-xs font-medium text-[#3B1F0A] truncate min-w-0 flex-1">{storedImage instanceof File ? storedImage.name : 'Reference image attached'}</span>
                            <label title="Replace image" aria-label="Replace reference image" className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg border border-[#DED4CC] bg-white text-[#5A453C] hover:bg-[#F5EFEB] cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-[#5A453C]">
                              <Pencil size={14} />
                              <input type="file" accept="image/*" onChange={pickFile(product, imageKey)} className="sr-only" />
                            </label>
                            <button type="button" title="Remove image" onClick={() => updateImage(product, null)} aria-label="Remove reference image" className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center gap-2.5 w-full min-h-11 border border-dashed border-[#DED4CC] bg-white hover:bg-[#FAF7F4] px-3 py-2 rounded-lg cursor-pointer focus-within:border-[#5A453C] transition-colors">
                            <span className="w-7 h-7 rounded-md bg-[#F5EFEB] text-[#5A453C] flex items-center justify-center shrink-0"><ImagePlus size={15} /></span>
                            <span className="text-xs font-semibold text-[#3B1F0A]">Choose an image</span>
                            <input type="file" accept="image/*" onChange={pickFile(product, imageKey)} className="sr-only" />
                          </label>
                        )}
                        {imageErrors[imageKey] && <span className="text-[11px] font-medium text-red-600 mt-1 block">{imageErrors[imageKey]}</span>}
                      </div>
                    )}

                    {accordion && nextProduct && (
                      <button type="button" onClick={() => goTo(nextProduct)} className="w-full min-h-10 inline-flex items-center justify-center gap-1 rounded-lg border border-[#DED4CC] bg-white text-xs font-semibold text-[#3B1F0A] hover:bg-[#F5EFEB] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5A453C]">
                        Next: {nextProduct.name} <ChevronRight size={14} />
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {/* Footer: always one row */}
        <div className="flex items-center gap-2.5 px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 bg-white border-t border-[#EAE4E0] shrink-0 sm:justify-end">
          <button type="button" onClick={onClose} className="flex-1 sm:flex-none min-h-11 sm:min-h-10 px-5 border border-[#DED4CC] rounded-lg text-[13px] font-semibold text-[#5A453C] hover:bg-[#F5EFEB] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5A453C] focus-visible:ring-offset-2">Cancel</button>
          <button type="button" onClick={save} className="flex-[1.4] sm:flex-none min-h-11 sm:min-h-10 px-5 rounded-lg text-[13px] font-semibold bg-[#3B1F0A] text-white hover:bg-[#2A1608] transition-colors shadow-sm inline-flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1F0A] focus-visible:ring-offset-2"><Save size={14}/>Save changes</button>
        </div>
      </div>
    </div>
  ), document.body);
}