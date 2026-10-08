import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Save } from 'lucide-react';
import MultiImageField, { MAX_IMAGE_BYTES } from './MultiImageField';
import { isSlipAnswerEmpty, setSlipValue } from './orderSlipUploads';

// Small cart-side editor for the fields already defined on the product order slip.
export default function CartOrderSlipEditor({ item, onClose, onSave }) {
  const [slip, setSlip] = useState(() => item.order_slip_details || {});
  const [inspiration, setInspiration] = useState(() => item.inspiration_image || (item.type === 'bundle' || item.type === 'package' ? {} : null));
  const [imageError, setImageError] = useState('');
  const [errors, setErrors] = useState({});
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
  const updateImage = (product, file) => setInspiration(current => multi
    ? { ...(current && typeof current === 'object' ? current : {}), [String(product.id)]: file }
    : file);
  const [previewUrls, setPreviewUrls] = useState({});
  useEffect(() => {
    const urls = {};
    const images = multi && inspiration && typeof inspiration === 'object'
      ? Object.entries(inspiration)
      : [['single', inspiration]];
    images.forEach(([key, value]) => { if (value instanceof File) urls[key] = URL.createObjectURL(value); });
    setPreviewUrls(urls);
    return () => Object.values(urls).forEach(URL.revokeObjectURL);
  }, [inspiration, multi]);
  const save = () => {
    const nextErrors = {};
    components.forEach(product => (product.order_slip_fields || []).forEach(field => {
      if (field.optional === true || field.isOptional === true || field.required === false) return;
      const path = pathFor(product, field);
      if (isSlipAnswerEmpty(field, valueAt(path))) nextErrors[path.join('.')] = true;
    }));
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    onSave(slip, inspiration);
    onClose();
  };

  return createPortal((
    <div className="fixed inset-0 z-[5000] bg-black/50 flex items-center justify-center p-3 sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`Edit ${item.name} order slip`} className="bg-[#FCFAF9] w-full max-w-[420px] lg:max-w-[620px] max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] rounded-2xl flex flex-col shadow-xl overflow-hidden">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-6 bg-white border-b border-[#EAE4E0] shrink-0">
          <div className="flex-1 min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#B7A99F] block mb-1">{item.category || (item.type === 'bundle' ? 'Promo Bundle' : item.type === 'package' ? 'Package' : 'Order customization')}</span>
            <h2 className="text-xl sm:text-2xl font-serif text-[#3B1F0A] leading-tight mb-1.5 truncate">{item.name}</h2>
            <p className="text-xs text-[#8A7264] mb-1.5">Edit Order Slip</p>
            {Number.isFinite(Number(item.price)) && <p className="text-sm font-bold text-[#5A453C]">₱{Number(item.price).toLocaleString()}</p>}
            {item.inclusion && <p className="text-xs text-[#8A7264] mt-1 leading-snug">{item.inclusion}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[#8A7264] hover:bg-[#F5EFEB] hover:text-[#3B1F0A] transition-colors"><X size={18}/></button>
        </div>
        <div className="p-4 sm:p-6 flex-1 overflow-y-auto overscroll-contain min-h-0 scrollbar-thin">
          {components.map(product => {
            const fields = product.order_slip_fields || [];
            if (!fields.length && !product.allow_file_upload && !imageAt(product)) return null;
            const storedImage = imageAt(product);
            const localPreview = previewUrls[multi ? String(product.id) : 'single'];
            const preview = localPreview || imageHref(storedImage);
            return <section key={product.id || product.name} className="mb-6 last:mb-0">
              <div className="flex flex-col gap-4">
                <p className="text-[11px] font-bold text-[#5A453C] uppercase tracking-wider">{multi ? product.name : 'Order Slip'}</p>
                {fields.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-4">
                  {fields.map(field => {
                    const path = pathFor(product, field);
                    const value = valueAt(path);
                    const error = errors[path.join('.')];
                    const optional = field.optional === true || field.isOptional === true || field.required === false;
                    const label = `${field.label}${optional ? ' (Optional)' : ' *'}`;
                    const labelClass = `text-xs font-semibold mb-1.5 ${error ? 'text-red-500' : 'text-[#8A7264]'}`;
                    const inputClass = `w-full border bg-white p-3 rounded-xl text-sm focus:outline-none transition-colors ${error ? 'border-red-500 focus:border-red-500' : 'border-[#EAE4E0] focus:border-[#5A453C]'}`;
                    const errorHint = error && <span className="text-[10px] text-red-500 mt-1 block">This field is required</span>;
                    if (field.type === 'Multi-image') return <div key={field.label} className="flex flex-col w-full basis-full"><MultiImageField label={label} value={Array.isArray(value) ? value : []} onChange={next => update(path, next)} max={field.maxImages} error={!!error} />{errorHint}</div>;
                    if (field.type === 'Select') return <div key={field.label} className="flex flex-col flex-1 basis-[160px] min-w-[160px]"><label className={labelClass}>{label}</label><select className={inputClass} value={value || ''} onChange={e => update(path, e.target.value)}><option value="" disabled>Select {field.label}...</option>{(field.options || []).map(option => <option key={option} value={option}>{option}</option>)}</select>{errorHint}</div>;
                    if (field.type === 'Textarea') return <div key={field.label} className="flex flex-col w-full basis-full"><label className={labelClass}>{label}</label><textarea placeholder={`Enter ${field.label}...`} className={`${inputClass} resize-none`} rows={3} value={value || ''} onChange={e => update(path, e.target.value)} />{errorHint}</div>;
                    return <div key={field.label} className="flex flex-col flex-1 basis-[160px] min-w-[160px]"><label className={labelClass}>{label}</label><input type={field.type === 'Number' ? 'number' : 'text'} placeholder={`Enter ${field.label}...`} className={inputClass} value={value || ''} onChange={e => update(path, e.target.value)} />{errorHint}</div>;
                  })}
                </div>}
                {(product.allow_file_upload || storedImage) && <div className={`${fields.length ? 'border-t border-[#EAE4E0] pt-6' : ''}`}>
                  <label className="text-xs font-semibold text-[#8A7264] mb-1 block">Upload Reference Image (Optional)</label>
                  <p className="text-[10px] text-[#B7A99F] mb-1.5">Max file size: 5MB</p>
                  {storedImage ? <div className="flex items-center gap-2.5 w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 rounded-xl">
                    {preview && <a href={preview} target="_blank" rel="noreferrer" aria-label="View reference image"><img src={preview} alt="Reference image preview" className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[#DED4CC]" /></a>}
                    <span className="text-xs text-[#4A3B36] truncate min-w-0 flex-1">{storedImage instanceof File ? storedImage.name : 'Reference image attached'}</span>
                    <button type="button" onClick={() => updateImage(product, null)} aria-label="Remove file" className="ml-3 w-6 h-6 rounded-full bg-white text-[#8A7264] flex items-center justify-center shrink-0 hover:bg-[#EAE4E0] hover:text-[#3B1F0A] transition-colors"><X size={13}/></button>
                  </div> : <label className="flex items-center w-full border border-[#EAE4E0] bg-[#F5EFEB] p-2 text-xs rounded-xl cursor-pointer focus-within:border-[#5A453C] transition-colors">
                    <span className="mr-3 py-1 px-3 rounded-lg text-[10px] font-bold uppercase bg-white text-[#4A3B36] shrink-0">Choose File</span>
                    <span className="text-[#8A7264] truncate">No file chosen</span>
                    <input type="file" accept="image/*" onChange={event => {
                      const file = event.target.files?.[0]; event.target.value = '';
                      if (!file) return;
                      if (file.size > MAX_IMAGE_BYTES) { setImageError('File is too large. Maximum size is 5MB.'); return; }
                      setImageError(''); updateImage(product, file);
                    }} className="hidden" />
                  </label>}
                  {imageError && <span className="text-[10px] text-red-500 mt-1 block">{imageError}</span>}
                </div>}
              </div>
            </section>;
          })}
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 p-4 sm:p-6 bg-white border-t border-[#EAE4E0] shrink-0">
          <button type="button" onClick={onClose} className="flex-1 sm:flex-none px-4 py-3 border border-[#DED4CC] rounded-xl text-xs font-bold text-[#5A453C] hover:bg-[#F5EFEB] transition-colors">Cancel</button>
          <button type="button" onClick={save} className="flex-1 sm:flex-none px-4 py-3 rounded-xl text-xs font-bold bg-[#3B1F0A] text-white hover:bg-[#2A1608] transition-colors shadow-sm inline-flex items-center justify-center gap-2"><Save size={14}/>Save changes</button>
        </div>
      </div>
    </div>
  ), document.body);
}
