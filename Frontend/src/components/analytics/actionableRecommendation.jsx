import {
  Sparkles,
  TrendingUp,
  PackagePlus,
} from 'lucide-react';

// ─── Standard, constant section labels — hindi ito galing sa AI at hindi
// dapat nagbabago. Ang AI lang ang nagbibigay ng laman (title/desc) ng
// bawat recommendation sa loob ng bawat section. Naging 2 categories na
// lang (dating 3): "salesOptimization" ngayon ay kasama na rin ang bundle
// promotions logic, at "wasteReduction" ay naging "inventoryOptimization"
// (expiry advisory + stock-level fallback). Wala nang per-timeframe
// subtitles. Bawat section may sariling "tag" color para makilala agad —
// pareho parin sila ng brand's warm brown/terracotta family kaya hindi
// kakaiba sa ibang parte ng dashboard. ───
const SECTIONS = [
  {
    key: 'salesOptimization',
    label: 'Sales Optimization',
    icon: TrendingUp,
    accent: '#C1694A',
  },
  {
    key: 'inventoryOptimization',
    label: 'Inventory Optimization',
    icon: PackagePlus,
    accent: '#8B6F3E',
  },
];

function RecommendationItem({ ins, accent }) {
  return (
    <div className="relative flex gap-3 py-4 pl-3.5 first:pt-0 last:pb-0 max-w-[64ch]">
      <span
        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full"
        style={{ backgroundColor: accent }}
      />
      <div className="min-w-0">
        <h4 className="text-sm font-bold text-[#3d2410] leading-snug mb-1.5">
          {ins.title}
        </h4>
        <p className="text-sm text-[#5C3317] leading-7">{ins.desc}</p>
      </div>
    </div>
  );
}

function Note({ section, items }) {
  const Icon = section.icon;
  const isEmpty = !items || items.length === 0;
  const count = items?.length || 0;

  return (
    <div className="relative rounded-xl border border-brand-100 bg-brand-50/40 overflow-hidden transition-shadow duration-200 hover:shadow-md">
      {/* pinned-tag strip — the one nod to "pinned note", kept flat and thin */}
      <div
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{ backgroundColor: section.accent }}
      />

      <div className="p-4 pt-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Icon size={16} className="text-[#5C3317] shrink-0" />
            <h3 className="text-sm font-bold text-[#3d2410] truncate">{section.label}</h3>
          </div>
          {!isEmpty && (
            <span
              className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
              style={{ color: section.accent, borderColor: section.accent + '55', backgroundColor: '#fff' }}
            >
              {count} {count === 1 ? 'tip' : 'tips'}
            </span>
          )}
        </div>

        {isEmpty ? (
          <div
            role="status"
            className="flex items-center justify-center text-sm text-[#5C3317] border border-dashed border-[#e7ded4] rounded-lg text-center px-6 py-6"
          >
            Nothing pinned here yet.
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-[#f1ece4]">
            {items.map((ins, i) => (
              <RecommendationItem key={i} ins={ins} accent={section.accent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActionableRecommendation({ recommendations = {} }) {
  const {
    salesOptimization = [],
    inventoryOptimization = [],
  } = recommendations;

  const dataByKey = { salesOptimization, inventoryOptimization };

  return (
    <div className="w-full p-5 bg-white border border-[#e7ded4] rounded-xl shadow-sm flex flex-col h-full">
      {/* Header — same sizing/spacing language as the rest of the dashboard */}
      <div className="flex items-center gap-2 mb-6 shrink-0">
        <Sparkles size={20} className="text-[#5C3317]" />
        <div>
          <h3 className="text-base font-bold text-[#3d2410]">Actionable Recommendations</h3>
          <p className="text-sm text-[#5C3317]">AI-Driven Decision Support System</p>
        </div>
      </div>

      {/* One row on desktop, stacked (2 rows) on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
        {SECTIONS.map((section) => (
          <Note key={section.key} section={section} items={dataByKey[section.key]} />
        ))}
      </div>
    </div>
  );
}