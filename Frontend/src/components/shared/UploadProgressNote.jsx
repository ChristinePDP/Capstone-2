import { useState, useEffect } from 'react';
import { Loader2, Check } from 'lucide-react';

// -----------------------------------------------------------------------------
// UploadProgressNote
// -----------------------------------------------------------------------------
// Ipinapakita sa loob ng Order Summary habang nagpo-proseso ang order na may
// mga larawan, para hindi isipin ng customer/cashier na hindi gumagana.
//
//   progress = null                                   -> walang ipinapakita
//   progress = { phase: 'uploading', done, total }    -> "Uploading photos 2 of 4"
//   progress = { phase: 'saving' }                    -> "Photos uploaded" + finalLabel
//
// Kapag lumampas ng ~4 segundo, may dagdag na paliwanag na medyo matagal dahil
// sa pag-upload ng mga larawan (at huwag isara ang page).
// -----------------------------------------------------------------------------

export function getProcessingLabel(progress, fallback = 'Processing...', finalLabel = 'Processing...') {
  if (!progress) return fallback;
  if (progress.phase === 'uploading') return `Uploading ${progress.done}/${progress.total}...`;
  return finalLabel;
}

export default function UploadProgressNote({ progress, finalLabel = 'Connecting to payment...', className = '' }) {
  const active = Boolean(progress);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    setSlow(false);
    if (!active) return undefined;
    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [active]);

  if (!progress) return null;

  const uploading = progress.phase === 'uploading';
  const pct = uploading && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 100;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded-xl border border-[#EAE4E0] bg-[#F9F5F1] px-3.5 py-3 ${className}`}
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-[#3B1F0A]">
        {uploading
          ? <Loader2 size={14} className="animate-spin shrink-0" />
          : <Check size={14} className="shrink-0 text-[#15803D]" />}
        <span>
          {uploading
            ? `Uploading your photos… ${progress.done} of ${progress.total}`
            : `Photos uploaded. ${finalLabel}`}
        </span>
      </div>

      <div className="mt-2 h-1.5 w-full rounded-full bg-[#EAE4E0] overflow-hidden">
        <div
          className="h-full rounded-full bg-[#3B1F0A] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {slow && (
        <p className="mt-2 text-[11px] leading-snug text-[#8A7264]">
          {uploading
            ? 'Medyo matagal dahil sa pag-upload ng mga larawan. Pakihintay lang at huwag isara ang page.'
            : 'Sandali na lang, halos tapos na.'}
        </p>
      )}
    </div>
  );
}