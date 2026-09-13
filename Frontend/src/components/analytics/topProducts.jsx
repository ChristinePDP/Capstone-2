import { ShoppingBag } from 'lucide-react';
import { useState, useLayoutEffect, useRef } from 'react';

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

  // Dense ranking: magkaparehong value = magkaparehong rank, walang nilalaktawang susunod na rank
  const rankedItems = items.reduce((acc, curr, i) => {
    const currSold = Number(curr.sold || 0);
    if (i === 0) {
      acc.push({ ...curr, rank: 1 });
    } else {
      const prevSold = Number(items[i - 1].sold || 0);
      const prevRank = acc[i - 1].rank;
      acc.push({ ...curr, rank: currSold === prevSold ? prevRank : prevRank + 1 });
    }
    return acc;
  }, []);

  // Pagsasama ng mga magkaparehong rank sa iisang row
  const groupedItems = rankedItems.reduce((acc, item) => {
    const group = acc[acc.length - 1];
    if (group && group.rank === item.rank) {
      group.names.push(item.name);
    } else {
      acc.push({ rank: item.rank, sold: item.sold, names: [item.name] });
    }
    return acc;
  }, []);

  // Fixed width lang ang container; kapag sasagad/mag-o-overflow ang text (isa man o maraming pangalan), ma-marquee
  const [overflowMap, setOverflowMap] = useState({});
  const containerRefs = useRef({});
  const measureRefs = useRef({});
  const groupKey = groupedItems.map(g => `${g.rank}:${g.names.join(',')}`).join('|');

  useLayoutEffect(() => {
    const next = {};
    groupedItems.forEach((g) => {
      const container = containerRefs.current[g.rank];
      const measurer = measureRefs.current[g.rank];
      if (container && measurer) {
        next[g.rank] = measurer.scrollWidth > container.clientWidth;
      }
    });
    setOverflowMap(next);
  }, [groupKey]);

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
          <style>{`
            @keyframes tp-marquee-scroll {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .tp-marquee-track {
              display: inline-flex;
              white-space: nowrap;
              animation: tp-marquee-scroll 8s linear infinite;
            }
          `}</style>
          {groupedItems.map((g) => {
            const displayText = g.names.join('  &  ');
            const isOverflowing = g.names.length > 1 || !!overflowMap[g.rank];
            return (
              <div key={g.rank} className="flex items-center gap-3">
                <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[12px] font-extrabold shrink-0 ${RANK_STYLES[g.rank - 1] || RANK_STYLES[RANK_STYLES.length - 1]}`}>
                  {g.rank}
                </div>
                {/* FIXED WIDTH: pinalitan ang flex-1 min-w-0 ng nakapirming w-[220px] */}
                <div
                  ref={(el) => { containerRefs.current[g.rank] = el; }}
                  className="w-[220px] overflow-hidden relative"
                >
                  <span
                    ref={(el) => { measureRefs.current[g.rank] = el; }}
                    className="invisible absolute top-0 left-0 whitespace-nowrap text-[13px] sm:text-[14px] font-semibold pointer-events-none"
                    aria-hidden="true"
                  >
                    {displayText}
                  </span>
                  {isOverflowing ? (
                    <div className="tp-marquee-track text-[13px] sm:text-[14px] text-[#3d2410] font-semibold">
                      <span className="pr-6">{displayText}</span>
                      <span className="pr-6">{displayText}</span>
                    </div>
                  ) : (
                    <span className="block text-[13px] sm:text-[14px] text-[#3d2410] font-semibold truncate">
                      {displayText}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1 shrink-0">
                  <span className="text-[16px] font-extrabold text-[#241406] tabular-nums whitespace-nowrap">
                    {(g.sold || 0).toLocaleString()}
                  </span>
                  <span className="text-[11px] font-semibold text-[#9a8b7a]">pcs</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}