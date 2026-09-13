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
// subtitles. ───
const SECTIONS = [
  {
    key: 'salesOptimization',
    label: 'Sales Optimization',
    icon: TrendingUp,
  },
  {
    key: 'inventoryOptimization',
    label: 'Inventory Optimization',
    icon: PackagePlus,
  },
];

function RecommendationItem({ ins }) {
  return (
    <div className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <div className="w-8 h-8 flex items-center justify-center shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
      </div>

      <div className="min-w-0">
        {/* Updated: Binalik sa text-sm ang title para hindi lumaki */}
        <h4 className="text-sm font-bold text-[#3d2410] leading-snug mb-1">
          {ins.title}
        </h4>
        {/* Updated: Pinanatiling text-sm ang description at dark text para mas madaling basahin */}
        <p className="text-sm text-[#5C3317] leading-relaxed">{ins.desc}</p>
      </div>
    </div>
  );
}

function RecommendationSection({ section, items }) {
  const Icon = section.icon;
  const isEmpty = !items || items.length === 0;

  return (
    <div className="flex flex-col">
      {/* Updated: Ginawang mb-3 ang margin dahil inalis na ang subtitle */}
      <div className="flex items-center gap-2 mb-3 shrink-0">
        <Icon size={16} className="text-[#5C3317] shrink-0" />
        <h3 className="text-sm font-bold text-[#3d2410]">{section.label}</h3>
      </div>

      {isEmpty ? (
        <div
          role="status"
          className="flex items-center justify-center text-sm text-[#5C3317] border border-dashed border-[#e7ded4] rounded-lg text-center px-6 py-6"
        >
          No recommendations available yet.
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#f1ece4]">
          {items.map((ins, i) => (
            <RecommendationItem key={i} ins={ins} />
          ))}
        </div>
      )}
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
      {/* Header — kaparehong sizing/spacing ng Sales Forecast header */}
      <div className="flex items-center gap-2 mb-6 shrink-0">
        <Sparkles size={20} className="text-[#5C3317]" />
        <div>
          <h3 className="text-base font-bold text-[#3d2410]">Actionable Recommendations</h3>
          <p className="text-sm text-[#5C3317]">AI-Driven Decision Support System</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <div
            key={section.key}
            className="rounded-xl border border-brand-100 bg-brand-50/30 p-4"
          >
            <RecommendationSection section={section} items={dataByKey[section.key]} />
          </div>
        ))}
      </div>
    </div>
  );
}