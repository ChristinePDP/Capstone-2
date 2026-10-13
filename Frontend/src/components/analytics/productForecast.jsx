import { Activity, TrendingUp, TrendingDown } from 'lucide-react';

const MAX_ITEMS_PER_LIST = 2;

const PLACEHOLDER_ITEM = { name: '-', recentQty: 0, forecast: 0, diff: 0, pct: 0 };

const formatSigned = (value) => `${value >= 0 ? '+' : ''}${value}`;

const EmptyRow = ({ text }) => (
  <div role="status" className="flex items-center justify-center text-center">
    <p className="text-[12px] text-[#9a8b7a] italic">{text}</p>
  </div>
);

const ProductRow = ({ item, periodDays, pctClass }) => {
  const recent = item.recentQty ?? (item.forecast - item.diff);
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#f3ede4] last:border-0 gap-3 hover:bg-[#faf8f5] transition-colors rounded-lg px-2 -mx-2">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#3d2410] truncate">{item.name}</p>
        <p className="text-[11px] text-[#9a8b7a] mt-0.5">
          <span>Last {periodDays} days: {recent} pcs → Next {periodDays} days: </span>
          <span className="font-bold text-[#5C3317]">{item.forecast} pcs</span>{' '}
          <span className="opacity-80">({formatSigned(item.diff)})</span>
        </p>
      </div>
      <span className={`shrink-0 w-12 text-right text-[13px] font-bold tabular-nums ${pctClass}`}>
        {formatSigned(item.pct)}%
      </span>
    </div>
  );
};

// Laging MAX_ITEMS_PER_LIST ang slots, kaya pareho ang taas kahit walang laman.
const ForecastSection = ({ title, icon, items, emptyText, periodDays, pctClass }) => {
  const slots = Array.from({ length: MAX_ITEMS_PER_LIST }, (_, i) => items[i] ?? null);
  const isEmpty = items.length === 0;

  return (
    <div className="flex flex-col shrink-0">
      <h4 className="text-[11px] font-bold text-[#9a8b7a] uppercase tracking-wider mb-2 border-b border-[#e7ded4] pb-1.5 flex items-center gap-1.5">
        {icon} {title}
      </h4>

      <div className="relative flex flex-col">
        {slots.map((item, i) =>
          item ? (
            <ProductRow key={i} item={item} periodDays={periodDays} pctClass={pctClass} />
          ) : (
            <div key={i} aria-hidden="true" className="invisible">
              <ProductRow item={PLACEHOLDER_ITEM} periodDays={periodDays} pctClass={pctClass} />
            </div>
          )
        )}

        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center">
            <EmptyRow text={emptyText} />
          </div>
        )}
      </div>
    </div>
  );
};

export default function ProductForecasting({ data, view = '30d' }) {
  const insufficientData = data?.insufficientData || false;
  const message = data?.message || '';

  const growthList = (Array.isArray(data?.growth) ? data.growth : []).slice(0, MAX_ITEMS_PER_LIST);
  const riskList = (Array.isArray(data?.risk) ? data.risk : []).slice(0, MAX_ITEMS_PER_LIST);

  const periodDays = view === '7d' ? 7 : 30;

  return (
    <div className="w-full bg-white border border-[#e7ded4] rounded-xl shadow-sm flex flex-col p-4 sm:p-5 h-full min-h-[350px]">
      <div className="flex items-center gap-2 mb-4 shrink-0">
        <Activity size={20} className="text-[#5C3317] shrink-0" />
        <div>
          <h3 className="text-base font-bold text-[#3d2410] leading-tight truncate">
            Product Forecast
          </h3>
          <p className="text-xs text-[#9a8b7a]">Forecast vs last {periodDays} days</p>
        </div>
      </div>

      {insufficientData ? (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-[#d97706] font-medium border border-dashed border-[#e7ded4] rounded-lg text-center px-6 min-h-[250px] bg-[#fffbf4]">
          {message || 'Insufficient data for this timeframe.'}
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 gap-5">
          <ForecastSection
            title="Fast Moving"
            icon={<TrendingUp size={14} className="text-emerald-500" />}
            items={growthList}
            emptyText="No fast moving products detected."
            periodDays={periodDays}
            pctClass="text-emerald-600"
          />
          <ForecastSection
            title="At Risk"
            icon={<TrendingDown size={14} className="text-rose-500" />}
            items={riskList}
            emptyText="No at-risk products detected."
            periodDays={periodDays}
            pctClass="text-rose-600"
          />
        </div>
      )}
    </div>
  );
}