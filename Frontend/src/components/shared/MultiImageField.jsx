import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Pencil, ChevronLeft, ChevronRight, ImagePlus } from 'lucide-react';

// -----------------------------------------------------------------------------
// MultiImageField
// -----------------------------------------------------------------------------
// Shared na input para sa order slip field na may type na "Multi-image"
// (hal. tarpaulin — ilang larawan ang pwedeng i-attach, itinakda ng admin sa
// Product Management > Order Slip Fields > Max photos).
//
// Controlled component: `value` ay array ng File (o ng URL string, para sa
// mga naka-upload na), `onChange(nextArray)` ang tatawagin sa bawat idagdag /
// palitan / burahin. Puwedeng gamitin sa modal (orderSlip, posMenu, Menu) at
// sa cart (para mapalitan, mabura, at ma-view ang mga naka-attach).
//
// Props:
//  - label: string           — teksto ng label (kasama na ang * o "(Optional)")
//  - value: (File|string)[]  — mga naka-attach na larawan
//  - onChange: (next) => void
//  - max: number             — pinakamaraming larawan (default 3)
//  - error: boolean          — ipakita ang "This field is required"
//  - compact: boolean        — mas maliit na thumbnails (para sa cart)
//  - maxSizeBytes: number    — per-file limit (default 5MB, kapareho ng reference image)
//  - readOnly: boolean       — thumbnails + view lang (walang add/palit/delete)
// -----------------------------------------------------------------------------

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const sizeLabel = (bytes) => `${Math.round(bytes / (1024 * 1024))}MB`;

// Gumagawa ng object URLs para sa preview at nire-revoke pag nagbago/nawala.
// State + effect (hindi useMemo) para ligtas sa React StrictMode.
export function useFilePreviews(files) {
  const [previews, setPreviews] = useState([]);
  useEffect(() => {
    const created = [];
    const urls = files.map((f) => {
      if (typeof f === 'string') return f;
      const url = URL.createObjectURL(f);
      created.push(url);
      return url;
    });
    setPreviews(urls);
    return () => created.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);
  return previews;
}

export function ImageLightbox({ images, index, onIndexChange, onClose }) {
  const total = images.length;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      else if (e.key === 'ArrowLeft' && total > 1) onIndexChange((index - 1 + total) % total);
      else if (e.key === 'ArrowRight' && total > 1) onIndexChange((index + 1) % total);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [index, total, onClose, onIndexChange]);

  if (!images[index]) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[6000] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-10 w-9 h-9 rounded-full bg-white shadow-lg hover:bg-gray-100 flex items-center justify-center text-[#3B1F0A] transition-colors"
        >
          <X size={18} />
        </button>
        <img
          src={images[index]}
          alt={`Preview ${index + 1} of ${total}`}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg shadow-2xl block"
        />
        {total > 1 && (
          <>
            <button
              type="button"
              onClick={() => onIndexChange((index - 1 + total) % total)}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-[#3B1F0A]"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => onIndexChange((index + 1) % total)}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 hover:bg-white shadow flex items-center justify-center text-[#3B1F0A]"
            >
              <ChevronRight size={18} />
            </button>
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-full bg-black/60 text-white text-[11px] font-bold">
              {index + 1} / {total}
            </span>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

export default function MultiImageField({
  label,
  value,
  onChange,
  max = 3,
  error = false,
  compact = false,
  maxSizeBytes = MAX_IMAGE_BYTES,
  readOnly = false,
}) {
  const files = Array.isArray(value) ? value : [];
  const limit = Math.max(1, Number(max) || 3);
  const previews = useFilePreviews(files);

  const [message, setMessage] = useState('');
  const [viewIndex, setViewIndex] = useState(null);
  const addInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceTarget = useRef(null);

  const splitBySize = (picked) => {
    const ok = [];
    let tooBig = 0;
    picked.forEach((f) => {
      if (f.size > maxSizeBytes) tooBig += 1;
      else ok.push(f);
    });
    return { ok, tooBig };
  };

  const handleAdd = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (picked.length === 0) return;

    const { ok, tooBig } = splitBySize(picked);
    const slots = limit - files.length;
    const accepted = ok.slice(0, Math.max(0, slots));
    const overLimit = ok.length - accepted.length;

    const notes = [];
    if (tooBig > 0) notes.push(`${tooBig} file${tooBig > 1 ? 's' : ''} masyadong malaki (max ${sizeLabel(maxSizeBytes)} bawat isa).`);
    if (overLimit > 0) notes.push(`Hanggang ${limit} larawan lang ang pwede — ${overLimit} ang hindi naidagdag.`);
    setMessage(notes.join(' '));

    if (accepted.length > 0) onChange([...files, ...accepted]);
  };

  const handleReplace = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = replaceTarget.current;
    replaceTarget.current = null;
    if (!file || target === null) return;

    if (file.size > maxSizeBytes) {
      setMessage(`Masyadong malaki ang file (max ${sizeLabel(maxSizeBytes)} lang).`);
      return;
    }
    setMessage('');
    onChange(files.map((f, i) => (i === target ? file : f)));
  };

  const handleRemove = (index) => {
    setMessage('');
    setViewIndex(null);
    onChange(files.filter((_, i) => i !== index));
  };

  const tile = compact ? 'w-14 h-14' : 'aspect-square';
  const gridClass = compact
    ? 'flex flex-wrap gap-2'
    : 'grid grid-cols-3 sm:grid-cols-4 gap-2';
  const btnBase = 'absolute w-5 h-5 rounded-full bg-white/95 shadow flex items-center justify-center text-[#5A453C] hover:bg-white hover:text-[#3B1F0A] transition-colors';

  return (
    <div className="flex flex-col w-full">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`text-xs font-semibold ${error ? 'text-red-500' : 'text-[#8A7264]'}`}>{label}</span>
        <span className="text-[10px] font-bold text-[#B7A99F] shrink-0">{files.length}/{limit}</span>
      </div>

      <div className={`${gridClass} border bg-white p-2 rounded-xl transition-colors ${error ? 'border-red-500' : 'border-[#EAE4E0]'}`}>
        {files.map((f, i) => (
          <div
            key={typeof f === 'string' ? `${f}-${i}` : `${f.name}-${f.size}-${f.lastModified}-${i}`}
            className={`relative ${tile} rounded-lg overflow-hidden border border-[#EAE4E0] bg-[#F5EFEB] shrink-0`}
          >
            {previews[i] && (
              <button
                type="button"
                onClick={() => setViewIndex(i)}
                aria-label={`View image ${i + 1}`}
                className="w-full h-full cursor-zoom-in"
              >
                <img src={previews[i]} alt="" className="w-full h-full object-cover" />
              </button>
            )}
            {!readOnly && (<>
            <button
              type="button"
              onClick={() => handleRemove(i)}
              aria-label={`Remove image ${i + 1}`}
              title="Remove"
              className={`${btnBase} top-1 right-1`}
            >
              <X size={11} />
            </button>
            <button
              type="button"
              onClick={() => { replaceTarget.current = i; replaceInputRef.current?.click(); }}
              aria-label={`Replace image ${i + 1}`}
              title="Replace"
              className={`${btnBase} bottom-1 right-1`}
            >
              <Pencil size={10} />
            </button>
            </>)}
          </div>
        ))}

        {!readOnly && files.length < limit && (
          <button
            type="button"
            onClick={() => addInputRef.current?.click()}
            aria-label="Add images"
            className={`${tile} shrink-0 rounded-lg border border-dashed border-[#DED4CC] bg-[#F5EFEB] text-[#8A7264] hover:bg-[#EAE4E0] flex flex-col items-center justify-center gap-0.5 transition-colors`}
          >
            {files.length === 0 && !compact ? <ImagePlus size={18} /> : <Plus size={compact ? 14 : 16} />}
            {!compact && <span className="text-[10px] font-bold uppercase">{files.length === 0 ? 'Add' : 'More'}</span>}
          </button>
        )}
      </div>

      <input ref={addInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAdd} />
      <input ref={replaceInputRef} type="file" accept="image/*" className="hidden" onChange={handleReplace} />

      {!readOnly && <p className="text-[10px] text-[#B7A99F] mt-1">Max {limit} photo{limit > 1 ? 's' : ''} · {sizeLabel(maxSizeBytes)} each</p>}
      {message && <span className="text-[10px] text-red-500 mt-1">{message}</span>}
      {error && <span className="text-[10px] text-red-500 mt-1">This field is required</span>}

      {viewIndex !== null && (
        <ImageLightbox
          images={previews}
          index={Math.min(viewIndex, previews.length - 1)}
          onIndexChange={setViewIndex}
          onClose={() => setViewIndex(null)}
        />
      )}
    </div>
  );
}