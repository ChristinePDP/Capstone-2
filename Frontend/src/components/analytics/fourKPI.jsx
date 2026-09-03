import { ShoppingBag, DollarSign, BarChart2, Percent } from 'lucide-react';

const fmtFull = (n) => '₱' + n.toLocaleString('en-PH');

const KPI_CONFIG = (kpi) => [
  {
    label: 'Total Sales',
    value: fmtFull(kpi.sales || 0),
    accentColor: '#3b82f6',
    icon: <ShoppingBag size={18} color="#3b82f6" />,
  },
  {
    label: 'Total Expenses',
    value: fmtFull(kpi.expenses || 0),
    accentColor: '#f43f5e',
    icon: <DollarSign size={18} color="#f43f5e" />,
  },
  {
    label: 'Gross Profit',
    value: fmtFull(kpi.profit || 0),
    accentColor: '#10b981',
    icon: <BarChart2 size={18} color="#10b981" />,
  },
  {
    label: 'Profit Margin',
    value: (kpi.margin || 0).toFixed(1) + '%',
    accentColor: '#f59e0b',
    icon: <Percent size={18} color="#f59e0b" />,
  },
];

export default function FourKpi({ kpi, isLoading }) {
  const currentKpi = kpi || { sales: 0, expenses: 0, profit: 0, margin: 0 };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {KPI_CONFIG(currentKpi).map(({ label, value, accentColor, icon }) => (
        <div key={label} className="bg-white border border-brand-300 rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="h-1 w-full shrink-0" style={{ background: accentColor }} />

          {/* Binawasan nang bahagya ang padding para hindi sobrang laki ng card */}
          <div className="px-4 py-4 flex flex-col justify-center flex-1">
            <div className="flex items-center justify-between mb-2 sm:mb-3">

              {/* Pinaliit ng konti ang label */}
              <p className="text-[11px] sm:text-[12px] font-bold uppercase tracking-wider text-brand-400 truncate pr-2">
                {label}
              </p>

              {/* Pinaliit ng konti ang icon container at icon size */}
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: accentColor + '15' }}>
                {icon}
              </div>
            </div>

            {/* Real data lang, o loading placeholder — walang MOCK_KPI fallback */}
            <p className="text-[20px] sm:text-[24px] md:text-[28px] font-bold text-brand-900 leading-none tracking-tight truncate" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {isLoading ? '—' : value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}