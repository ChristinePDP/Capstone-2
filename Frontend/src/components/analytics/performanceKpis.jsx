import { Wallet, Receipt, PiggyBank, ShoppingBag, ArrowUpRight, ArrowDownRight } from 'lucide-react';

const fmtFull = (n) => '₱' + n.toLocaleString('en-PH');
const fmtCount = (n) => n.toLocaleString('en-PH');

function TrendBadge({ delta, invert = false }) {
  if (delta === undefined || delta === null || delta === 0) return null;

  const isUp = delta > 0;
  const isGood = invert ? !isUp : isUp;
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  const colorClasses = isGood
    ? 'bg-emerald-50 text-emerald-600'
    : 'bg-rose-50 text-rose-600';

  return (
    <span className={`inline-flex items-center gap-0.5 px-1 sm:px-1.5 py-1 sm:py-0.5 rounded-md text-[10px] xl:text-[11px] font-bold tabular-nums shrink-0 whitespace-nowrap ${colorClasses}`}>
      <Icon size={12} strokeWidth={2.5} className="shrink-0" />
      {/* Sa mobile, icon na lang (up/down arrow) ang bisible — natatago
          muna ang percentage text hanggang `sm` breakpoint pataas, para
          hindi na ito kumain ng space na dapat para sa KPI number mismo
          (na siyang priority na makita sa maliit na screen). */}
      <span className="hidden sm:inline">{Math.abs(delta).toFixed(1)}%</span>
    </span>
  );
}

function sizeForLength(str, sizes) {
  const len = str.length;
  if (len <= sizes.short.max) return sizes.short.classes;
  if (len <= sizes.medium.max) return sizes.medium.classes;
  return sizes.long.classes;
}

const KPI_SIZES = {
  short: { max: 5, classes: 'text-[22px] sm:text-[24px] md:text-[26px]' },
  medium: { max: 8, classes: 'text-[17px] sm:text-[19px] md:text-[21px]' },
  long: { max: 999, classes: 'text-[14px] sm:text-[15px] md:text-[16px]' },
};

export default function PerformanceKpis({ kpi, isLoading }) {
  const currentKpi = kpi || {
    sales: 0, expenses: 0, profit: 0, orders: 0,
    sDelta: 0, eDelta: 0, pDelta: 0, oDelta: 0,
  };

  const displayCurrency = (v) => (isLoading ? '—' : fmtFull(v || 0));
  const displayCount = (v) => (isLoading ? '—' : fmtCount(v || 0));

  const salesText = displayCurrency(currentKpi.sales);
  const expensesText = displayCurrency(currentKpi.expenses);
  const profitText = displayCurrency(currentKpi.profit);
  const ordersText = displayCount(currentKpi.orders);

  const cards = [
    { label: 'Total Sales', text: salesText, delta: currentKpi.sDelta, invert: false, Icon: Wallet },
    { label: 'Total Expenses', text: expensesText, delta: currentKpi.eDelta, invert: true, Icon: Receipt },
    { label: 'Total Profit', text: profitText, delta: currentKpi.pDelta, invert: false, Icon: PiggyBank },
    { label: 'Number of Orders', text: ordersText, delta: currentKpi.oDelta, invert: false, Icon: ShoppingBag },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full h-full">
      {cards.map((card) => (
        <div
          key={card.label}
          className="relative overflow-hidden bg-white border border-[#f1ece4] rounded-xl px-4 xl:px-5 py-4 flex flex-col justify-between shadow-sm min-w-0"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] xl:text-[11px] font-bold uppercase tracking-wide text-brand-400 leading-tight line-clamp-2 pt-1">
              {card.label}
            </p>
            <div className="w-8 h-8 xl:w-9 xl:h-9 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
              <card.Icon className="w-4 h-4 xl:w-[18px] xl:h-[18px] text-brand-600" />
            </div>
          </div>
          <div className="flex items-end justify-between gap-2 mt-3 min-w-0">
            <p className={`${sizeForLength(card.text, KPI_SIZES)} font-bold text-brand-900 leading-none tracking-tight tabular-nums truncate min-w-0`}>
              {card.text}
            </p>
            <TrendBadge delta={card.delta} invert={card.invert} />
          </div>
        </div>
      ))}
    </div>
  );
}