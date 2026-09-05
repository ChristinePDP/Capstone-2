import { Activity, TrendingUp, TrendingDown } from 'lucide-react';

const EmptyRow = ({ text }) => (
  <div role="status" className="flex items-center justify-center flex-1 py-4 text-center">
    <p className="text-[12px] text-[#9a8b7a] italic">{text}</p>
  </div>
);

export default function ProductForecasting({ data, view = '30d' }) {
  const insufficientData = data?.insufficientData || false;
  const message = data?.message || '';

  // Wala nang mock/fallback data. Kung walang totoong data na dumating,
  // mananatiling walang laman (empty arrays) ang growth/risk lists.
  // Striktong 2 lang ang kukunin per list — 2 fast moving, 2 at risk.
  const MAX_ITEMS_PER_LIST = 2;
  const growthList = (Array.isArray(data?.growth) ? data.growth : []).slice(0, MAX_ITEMS_PER_LIST);
  const riskList = (Array.isArray(data?.risk) ? data.risk : []).slice(0, MAX_ITEMS_PER_LIST);

  const renderMiniSparkline = (trend) => {
    const isUp = trend === 'up';
    const color = isUp ? '#10b981' : '#f43f5e';
    const path = isUp
      ? "M0,16 L10,12 L20,14 L30,6 L40,8 L50,2"
      : "M0,2 L10,8 L20,6 L30,14 L40,12 L50,16";

    return (
      <svg width="40" height="16" viewBox="0 0 50 20" className="overflow-visible hidden sm:block shrink-0">
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M0,18 L50,18" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.3" />
      </svg>
    );
  };

  const periodText = view === '7d' ? '7-Day' : view === '60d' ? '60-Day' : '30-Day';

  return (
    <div className="w-full bg-white border border-[#e7ded4] rounded-xl shadow-sm flex flex-col p-4 sm:p-5 h-full min-h-[350px]">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <Activity size={20} className="text-[#5C3317] shrink-0" />
        <div>
          <h3 className="text-base font-bold text-[#3d2410] leading-tight truncate">
            Product Forecast
          </h3>
          <p className="text-xs text-[#9a8b7a]">{periodText} Trend Analysis</p>
        </div>
      </div>
      
      {insufficientData ? (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-[#d97706] font-medium border border-dashed border-[#e7ded4] rounded-lg text-center px-6 min-h-[250px] bg-[#fffbf4]">
          {message || 'Insufficient data for this timeframe.'}
        </div>
      ) : (
        <div className="flex flex-col flex-1 gap-5">
          {/* Fast Moving */}
          <div className="flex flex-col shrink-0">
            <h4 className="text-[11px] font-bold text-[#9a8b7a] uppercase tracking-wider mb-2 border-b border-[#e7ded4] pb-1.5 flex items-center gap-1.5">
              <TrendingUp size={14} className="text-emerald-500" /> Fast Moving
            </h4>
            <div className="flex flex-col">
              {growthList.length === 0 ? (
                <EmptyRow text="No fast moving products detected." />
              ) : (
                growthList.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-[#f3ede4] last:border-0 gap-3 hover:bg-[#faf8f5] transition-colors rounded-lg px-2 -mx-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#3d2410] truncate">{item.name}</p>
                      <p className="text-[11px] text-[#9a8b7a] mt-0.5">
                        <span className="font-bold text-[#5C3317]">{item.forecast} pcs</span> <span className="opacity-80">(+{item.diff})</span>
                      </p>
                    </div>
                    {renderMiniSparkline('up')}
                    <span className="shrink-0 w-12 text-right text-emerald-600 text-[13px] font-bold tabular-nums">
                      +{item.pct}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* At Risk */}
          <div className="flex flex-col shrink-0">
            <h4 className="text-[11px] font-bold text-[#9a8b7a] uppercase tracking-wider mb-2 border-b border-[#e7ded4] pb-1.5 flex items-center gap-1.5">
              <TrendingDown size={14} className="text-rose-500" /> At Risk
            </h4>
            <div className="flex flex-col">
              {riskList.length === 0 ? (
                <EmptyRow text="No at-risk products detected." />
              ) : (
                riskList.map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 border-b border-[#f3ede4] last:border-0 gap-3 hover:bg-[#faf8f5] transition-colors rounded-lg px-2 -mx-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#3d2410] truncate">{item.name}</p>
                      <p className="text-[11px] text-[#9a8b7a] mt-0.5">
                        <span className="font-bold text-[#5C3317]">{item.forecast} pcs</span> <span className="opacity-80">({item.diff})</span>
                      </p>
                    </div>
                    {renderMiniSparkline('down')}
                    <span className="shrink-0 w-12 text-right text-rose-600 text-[13px] font-bold tabular-nums">
                      {item.pct}%
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}