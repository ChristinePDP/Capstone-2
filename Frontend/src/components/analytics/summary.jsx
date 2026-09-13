import { Loader2, CalendarRange } from 'lucide-react';

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
        <span key={i} className="font-bold text-brand-900">
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
  const topProducts = resolvedData.topProducts || [];

  return (
    <div className="relative w-full p-4 sm:p-5 bg-white rounded-xl flex flex-col overflow-hidden shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-2 shrink-0 pt-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
            <CalendarRange size={16} className="text-brand-600" />
          </div>
          <h3 className="text-sm font-bold text-brand-800">Weekly Performance Summary</h3>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-brand-400">
          <Loader2 size={16} className="animate-spin" />
          <span>Loading performance summary...</span>
        </div>
      ) : error ? (
        <div className="flex-1 min-h-[140px] flex items-center justify-center rounded-lg bg-brand-50/50 px-4 py-8">
          <p className="text-sm text-brand-400 text-center">
            Unable to load the performance summary right now. Please try again later.
          </p>
        </div>
      ) : !hasData ? (
        <div className="flex-1 min-h-[140px] flex items-center justify-center rounded-lg bg-brand-50/50 px-4 py-8">
          <p className="text-sm text-brand-400 text-center">
            No performance summary data available for this timeframe
          </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-3.5">
          <div className="bg-brand-50/30 border border-brand-100 rounded-lg p-4">
            <p className="text-sm leading-relaxed text-brand-700">
              {renderTextWithBold(resolvedData.summaryText)}
              
              {/* Pinagsama ang top products sa iisang paragraph */}
              {topProducts.length > 0 && (
                <>
                  {' '}
                  <span className="font-bold text-brand-900">Top products this week:</span>{' '}
                  {topProducts.map((p) => `${p.name} (${p.qty} pcs)`).join(', ')}.
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}