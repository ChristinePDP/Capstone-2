import { useState, useMemo, useRef } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { ImageLightbox, useFilePreviews, MAX_IMAGE_BYTES } from './MultiImageField';

// -----------------------------------------------------------------------------
// CartReferenceImage
// -----------------------------------------------------------------------------
// "Image Attached — View ✎ 🗑" na linya sa cart para sa REFERENCE image ng isang
// item (`item.inspiration_image`). Kapareho ng itsura/gawi ng sa online ordering
// cart, at ginagamit sa POS cart (posCart.jsx).
//
//  - Regular product: isang File/URL  -> View, Palitan, Burahin
//  - Bundle/package : { [productId]: File } -> "Image Attached (n)" + View lang
//                     (ang bawat larawan ay para sa sarili nitong component)
//
// Props:
//  - item: cart item
//  - onChange: (fileOrNull) => void   — palit (File) o burahin (null)
//  - readOnly: boolean — View lang, walang palit/burahin
// -----------------------------------------------------------------------------
export default function CartReferenceImage({ item, onChange, readOnly = false, className = '' }) {
  const raw = item?.inspiration_image;
  const isMulti = item?.type === 'bundle' || item?.type === 'package';

  // Naka-memo para hindi mag-loop ang useFilePreviews (na naka-depende sa identity ng array).
  const list = useMemo(() => {
    const isUsable = (v) => (typeof File !== 'undefined' && v instanceof File) || (typeof v === 'string' && v);
    if (isUsable(raw)) return [raw];
    if (raw && typeof raw === 'object') return Object.values(raw).filter(isUsable);
    return [];
  }, [raw]);

  const previews = useFilePreviews(list);
  const [viewIndex, setViewIndex] = useState(null);
  const [error, setError] = useState('');
  const replaceInputRef = useRef(null);

  if (list.length === 0) return null;

  const canEdit = !isMulti && !readOnly && typeof onChange === 'function';
  const iconBtn = 'inline-flex items-center justify-center w-5 h-5 rounded-full border border-[#DED4CC] text-[#5A453C] hover:bg-[#F5EFEB] transition-colors';

  return (
    <div className={className}>
      <p className="text-[11px] font-semibold text-[#8A7264] flex items-center gap-2 flex-wrap">
        <span>{isMulti ? `Image Attached (${list.length})` : 'Image Attached'}</span>

        {previews[0] && (
          <button
            type="button"
            onClick={() => setViewIndex(0)}
            className="underline underline-offset-2 font-normal text-[#5A453C]"
          >
            View
          </button>
        )}

        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => replaceInputRef.current?.click()}
              aria-label="Change picture"
              title="Change picture"
              className={iconBtn}
            >
              <Pencil size={11} />
            </button>
            <button
              type="button"
              onClick={() => { setError(''); onChange(null); }}
              aria-label="Remove picture"
              title="Remove picture"
              className={`${iconBtn} text-red-500 hover:bg-red-50`}
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
                e.target.value = '';
                if (!file) return;
                if (file.size > MAX_IMAGE_BYTES) {
                  setError('Masyadong malaki ang file (max 5MB lang).');
                  return;
                }
                setError('');
                onChange(file);
              }}
            />
          </>
        )}
      </p>

      {error && <span className="text-[10px] text-red-500 block mt-0.5">{error}</span>}

      {viewIndex !== null && previews[viewIndex] && (
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