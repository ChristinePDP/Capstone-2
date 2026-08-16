import { Lightbulb, Loader2 } from 'lucide-react';

// ============================================================
// Ang component na ito ay pure presentational na. 
// Tumatanggap ito ng `data` at `isLoading` props mula sa parent (analyticsPage.jsx).
// Ang mismong text summary at logic ay galing na sa AI text generation.
// ============================================================

const EMPTY_SUMMARY = {
  summaryText: '',
  topProducts: [],
};

// Function para basahin ang markdown-style bold (e.g., **₱5,000**) galing sa AI 
// at i-render bilang <span className="font-semibold">
function renderTextWithBold(text) {
  if (!text) return null;
  
  // Hahatiin natin ang text kung nasaan ang mga **
  const parts = text.split(/(\*\*.*?\*\*)/g);
  
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      // Tinatanggal natin yung literal na "**" para i-render ang text sa loob
      return (
        <span key={i} className="font-semibold text-[#3d2410]">
          {part.slice(2, -2)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function Summary({ data, isLoading, error }) {
  const resolvedData = data ?? EMPTY_SUMMARY;
  const hasData = Boolean(resolvedData.summaryText) || (resolvedData.topProducts || []).length > 0;

  // Formatting lang para ilista ang top products na binigay ng backend
  const topProductsText = (resolvedData.topProducts || [])
    .map((p, i, arr) => {
      const label = `${p.name} (${p.qty} pcs)`;
      if (i === 0) return label;
      if (i === arr.length - 1) return `at ${label}`;
      return label;
    })
    .join(', ');

  return (
    <div className="w-full p-4 sm:p-5 bg-white border border-[#e7ded4] rounded-xl flex flex-col">
      <div className="mb-4 flex items-center gap-2 shrink-0">
        <Lightbulb size={18} className="text-[#5C3317] shrink-0" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#3d2410] truncate">Performance Summary</h3>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[#8a7a68]">
          <Loader2 size={16} className="animate-spin" />
          <span>Loading performance summary...</span>
        </div>
      ) : error ? (
        <div className="flex-1 min-h-[140px] flex items-center justify-center rounded-lg border border-dashed border-[#e7c9c9] bg-[#fdfaf9] px-4 py-8">
          <p className="text-sm text-[#c17b83] text-center">
            Unable to load the performance summary right now. Please try again later.
          </p>
        </div>
      ) : !hasData ? (
        <div className="flex-1 min-h-[140px] flex items-center justify-center rounded-lg border border-dashed border-[#e7c9c9] bg-[#fdfaf9] px-4 py-8">
          <p className="text-sm text-[#c17b83] text-center">
            No performance summary data available for this timeframe
          </p>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-[#5b4636]">
          {/* I-render ang text from AI, tas isunod ang formatted Top Products */}
          {renderTextWithBold(resolvedData.summaryText)}
          
          {topProductsText && (
            <>
              {' Nanguna sa benta sa nakalipas na linggo ang '}
              <span className="font-semibold text-[#3d2410]">{topProductsText}</span>
              {'.'}
            </>
          )}
        </p>
      )}
    </div>
  );
}