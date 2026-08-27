import {
  Sparkles,
  Lightbulb,
  AlertTriangle,
  Tag,
  Info,
  ShieldAlert,
  TrendingUp,
  Timer,
  PackagePlus,
} from 'lucide-react';

// ─── Palette — matched sa Sales Forecast card (#5C3317 / #9a8b7a / #3d2410 / #e7ded4) ───
const AI_COLORS = {
  success: { color: '#0f9d68', bg: '#eafaf3', icon: Lightbulb },
  warning: { color: '#d97706', bg: '#fdf3e5', icon: AlertTriangle },
  danger: { color: '#e0483f', bg: '#fdedec', icon: ShieldAlert },
  info: { color: '#3373c4', bg: '#eaf2fb', icon: Tag },
  neutral: { color: '#5C3317', bg: '#f1ece4', icon: Info },
};

// ─── Standard, constant section labels — hindi ito galing sa AI at hindi
// dapat nagbabago kahit anong timeframe. Ang AI lang ang nagbibigay ng
// laman (title/desc) ng bawat recommendation sa loob ng bawat section.
// Inalis na ang mga subtitles dito ayon sa request. ───
const SECTIONS = [
  {
    key: 'salesOptimization',
    label: 'Sales Growth Strategy',
    icon: TrendingUp,
  },
  {
    key: 'wasteReduction',
    label: 'Expiry Advisory',
    icon: Timer,
  },
  {
    key: 'bundlePromotions',
    label: 'Bundle Opportunities',
    icon: PackagePlus,
  },
];

function RecommendationItem({ ins }) {
  const theme = AI_COLORS[ins.type] || AI_COLORS.neutral;
  const Icon = theme.icon;

  return (
    <div className="flex gap-3 py-4 first:pt-0 last:pb-0">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
        style={{ background: theme.bg }}
      >
        <Icon size={15} style={{ color: theme.color }} strokeWidth={2.25} />
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
    wasteReduction = [],
    bundlePromotions = [],
  } = recommendations;

  const dataByKey = { salesOptimization, wasteReduction, bundlePromotions };

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
            className="rounded-xl border border-[#e7ded4] bg-[#fdfbf8] p-4"
          >
            <RecommendationSection section={section} items={dataByKey[section.key]} />
          </div>
        ))}
      </div>
    </div>
  );
}