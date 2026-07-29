import { Sparkles, Lightbulb, AlertTriangle, Tag, Info, ShieldAlert } from 'lucide-react';

// ─── Palette — matched sa Sales Forecast card (#5C3317 / #9a8b7a / #3d2410 / #e7ded4) ───
const AI_COLORS = {
  success: { color: '#0f9d68', bg: '#eafaf3', icon: Lightbulb },
  warning: { color: '#d97706', bg: '#fdf3e5', icon: AlertTriangle },
  danger:  { color: '#e0483f', bg: '#fdedec', icon: ShieldAlert },
  info:    { color: '#3373c4', bg: '#eaf2fb', icon: Tag },
  neutral: { color: '#5C3317', bg: '#f1ece4', icon: Info },
};

// TINANGGAL NA ANG MOCK DATA DITO

export default function ActionableRecommendation({ recommendations = [] }) {
  const isEmpty = !recommendations || recommendations.length === 0;

  return (
    <div className="w-full p-5 bg-white border border-[#e7ded4] rounded-xl shadow-sm flex flex-col h-full">
      {/* Header — kaparehong sizing/spacing ng Sales Forecast header */}
      <div className="flex items-center gap-2 mb-6 shrink-0">
        <Sparkles size={20} className="text-[#5C3317]" />
        <div>
          <h3 className="text-base font-bold text-[#3d2410]">Actionable Recommendations</h3>
          <p className="text-xs text-[#9a8b7a]">AI-Generated Insights</p>
        </div>
      </div>

      {isEmpty ? (
        <div
          role="status"
          className="flex flex-1 items-center justify-center text-sm text-[#9a8b7a] border border-dashed border-[#e7ded4] rounded-lg text-center px-6 min-h-[200px]"
        >
          No recommendations available yet.
        </div>
      ) : (
        <div className="flex-1 flex flex-col divide-y divide-[#f1ece4]">
          {recommendations.map((ins, i) => {
            const theme = AI_COLORS[ins.type] || AI_COLORS.neutral;
            const Icon = theme.icon;

            return (
              <div key={i} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: theme.bg }}
                >
                  <Icon size={15} style={{ color: theme.color }} strokeWidth={2.25} />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: theme.color }}
                    >
                      {ins.badge}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-[#3d2410] leading-snug mb-1">
                    {ins.title}
                  </h4>
                  <p className="text-xs text-[#9a8b7a] leading-relaxed">
                    {ins.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}