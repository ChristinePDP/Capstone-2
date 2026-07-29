import { ShoppingBag } from 'lucide-react';

const RANK_STYLES = [
  'bg-amber-100 text-amber-800',
  'bg-slate-100 text-slate-600',
  'bg-orange-100 text-orange-800',
  'bg-[#f3ede4] text-[#9a8b7a]',
  'bg-[#f3ede4] text-[#9a8b7a]',
];

export default function TopProductsList({
  period = 'Last 7 Days',
  title = 'Top 5 Best Selling Products',
  maxItems = 5,
  data 
}) {
  
  const products = (data && data.length > 0) ? data : [];
  const items = products.slice(0, maxItems);
  const isEmpty = items.length === 0;

  return (
    <div className="w-full p-4 sm:p-5 bg-white border border-[#e7ded4] rounded-xl flex flex-col h-full">
      <div className="mb-4 flex items-center gap-2 shrink-0">
        <ShoppingBag size={18} className="text-[#5C3317] shrink-0" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#3d2410] truncate">{title}</h3>
          <p className="text-xs text-[#9a8b7a] mt-0.5">Best-selling items · {period}</p>
        </div>
      </div>

      {isEmpty ? (
        // INAYOS: Pinalitan ang h-32 ng flex-1 at min-h-[240px] para di lumiit
        <div role="status" className="flex flex-1 items-center justify-center min-h-[240px] text-sm text-[#9a8b7a] border border-dashed border-[#e7ded4] rounded-lg p-4 text-center">
          No product data available for this timeframe.
        </div>
      ) : (
        // INAYOS: Dinagdagan din ng min-h-[240px] para standard ang height
        <div className="flex flex-col gap-4 justify-center flex-1 min-h-[240px]">
          {items.map((p, i) => (
            <div key={p.name || i} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[12px] font-extrabold shrink-0 ${RANK_STYLES[i] || RANK_STYLES[RANK_STYLES.length - 1]}`}>
                {i + 1}
              </div>
              <span className="text-[13px] sm:text-[14px] text-[#3d2410] font-semibold flex-1 truncate">{p.name}</span>
              <div className="flex items-baseline gap-1 shrink-0">
                <span className="text-[16px] font-extrabold text-[#241406] tabular-nums whitespace-nowrap">
                  {(p.sold || 0).toLocaleString()}
                </span>
                <span className="text-[11px] font-semibold text-[#9a8b7a]">pcs</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}