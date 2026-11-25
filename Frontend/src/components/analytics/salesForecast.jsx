import { useMemo } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LineChart as LucideLineChart } from 'lucide-react';
import { Skeleton } from '../ui';

// WEEKLY na ang Sales Forecast. Ang backend (SalesForecastService) ay nagbibigay
// ng isang row kada linggo sa `data` (chartData):
//   { label, weekStart, weekEnd, days, partial, forecastSales, lower, upper }
// Ang `lower`/`upper` ay ang karaniwang laki ng linggo (P10–P90 ng huling 12
// linggo), hindi prediction interval.
const DAYS_PER_WEEK = 7;
const Y_TICK_INTERVALS = 4; // ilang puwang sa pagitan ng ₱0 at maximum
const Y_HEADROOM = 1.15; // 15% extra space sa taas ng pinakamataas na value
const DEFAULT_Y_MAX = 1000; // fallback kapag walang data o puro zero

// Kulay (kapareho ng dating theme)
const COLOR_WEEK = '#d97706';
const COLOR_WEEK_PARTIAL = '#f0c48a';

const formatPeso = (val) => `₱${Math.round(Number(val)).toLocaleString('en-PH')}`;
const formatAxis = (val) => {
  if (val >= 1000) {
    const inK = val / 1000;
    return `₱${Number.isInteger(inK) ? inK : inK.toFixed(1)}K`;
  }
  return `₱${val}`;
};

// Kinukuha ang "nice" na step (1, 2, 2.5, 5, 10 x power of 10) para malinis ang mga tick
const getNiceStep = (rawStep) => {
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const normalized = rawStep / magnitude;
  const niceNormalized = [1, 2, 2.5, 5, 10].find((n) => normalized <= n) ?? 10;
  return niceNormalized * magnitude;
};

// Dynamic na maximum at ticks ng Y-axis base sa pinakamataas na value
const getYAxisScale = (values) => {
  const validValues = values.filter((v) => typeof v === 'number' && !Number.isNaN(v));
  const dataMax = validValues.length ? Math.max(...validValues) : 0;

  if (dataMax <= 0) {
    const step = DEFAULT_Y_MAX / Y_TICK_INTERVALS;
    return {
      max: DEFAULT_Y_MAX,
      ticks: Array.from({ length: Y_TICK_INTERVALS + 1 }, (_, i) => i * step),
    };
  }

  const step = getNiceStep((dataMax * Y_HEADROOM) / Y_TICK_INTERVALS);
  const max = step * Y_TICK_INTERVALS;

  return {
    max,
    ticks: Array.from({ length: Y_TICK_INTERVALS + 1 }, (_, i) => i * step),
  };
};

const WeeklyTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const w = payload[0].payload;

  return (
    <div className="bg-white border border-stone-200 rounded-md shadow-lg p-3 text-sm min-w-[190px] z-50">
      <p className="font-bold text-stone-800 border-b border-stone-100 pb-2 mb-2">{w.label}</p>
      <div className="flex justify-between items-center gap-4">
        <span className="text-stone-500 text-xs">Estimated total</span>
        <span className="font-bold text-stone-800">{formatPeso(w.value)}</span>
      </div>
      {w.lower !== null && w.upper !== null && (
        <div className="flex justify-between items-center gap-4 mt-1.5">
          <span className="text-stone-500 text-xs">Usual range</span>
          <span className="text-stone-700 text-xs font-medium">
            {formatPeso(w.lower)} – {formatPeso(w.upper)}
          </span>
        </div>
      )}
      <p className="text-[11px] text-stone-400 mt-1.5">
        {w.days} day{w.days === 1 ? '' : 's'}
        {w.partial ? ' (partial week, pro-rated)' : ''}
      </p>
    </div>
  );
};

const Stat = ({ label, value, sub, subClass = 'text-[#9a8b7a]' }) => (
  <div className="min-w-0">
    <p className="text-[11px] text-[#9a8b7a]">{label}</p>
    <p className="text-lg font-bold text-[#3d2410] leading-tight tabular-nums">{value}</p>
    {sub && <p className={`text-[11px] mt-0.5 ${subClass}`}>{sub}</p>}
  </div>
);

export default function SalesForecast({
  title = 'Sales Forecast',
  data: propData,
  // Optional: { recentTotal, forecastTotal, pct } galing sa backend payload (totals)
  totals = null,
  insufficientData = false,
  message = '',
  isLoading = false,
}) {
  const hasFetchedButEmpty = Array.isArray(propData) && propData.length === 0;

  // Weekly rows galing sa backend. Ang lumang daily cache (walang `days`) ay
  // hindi isinasama; lalabas ang "refresh" message sa ibaba hanggang mag-regenerate.
  const weeks = useMemo(() => {
    const rows = Array.isArray(propData) ? propData : [];

    return rows
      .filter((p) => p && typeof p.forecastSales === 'number' && typeof p.days === 'number')
      .map((p) => ({
        label: p.label || (p.weekStart === p.weekEnd ? p.weekStart : `${p.weekStart} – ${p.weekEnd}`),
        value: p.forecastSales,
        lower: typeof p.lower === 'number' ? p.lower : null,
        upper: typeof p.upper === 'number' ? p.upper : null,
        days: p.days,
        partial: Boolean(p.partial) || p.days < DAYS_PER_WEEK,
      }));
  }, [propData]);

  const isLegacyFormat = Array.isArray(propData) && propData.length > 0 && weeks.length === 0;

  const forecastTotal = totals?.forecastTotal ?? weeks.reduce((sum, w) => sum + w.value, 0);
  const recentTotal = totals?.recentTotal ?? null;
  const pct =
    totals?.pct ?? (recentTotal > 0 ? Math.round(((forecastTotal - recentTotal) / recentTotal) * 100) : null);

  // Strongest week: buong linggo lang ang paghahambingan; ang partial ay kulang sa araw.
  const strongestWeek = useMemo(() => {
    const full = weeks.filter((w) => !w.partial);
    const pool = full.length ? full : weeks;
    return pool.length ? pool.reduce((best, w) => (w.value > best.value ? w : best), pool[0]) : null;
  }, [weeks]);

  const yScale = useMemo(() => getYAxisScale(weeks.map((w) => w.value)), [weeks]);
  const hasPartial = weeks.some((w) => w.partial);

  return (
    <div className="w-full p-5 bg-white border border-[#e7ded4] rounded-xl shadow-sm flex flex-col h-full min-h-[350px]">
      <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <LucideLineChart size={20} className="text-[#5C3317]" />
          <div>
            <h3 className="text-base font-bold text-[#3d2410]">{title}</h3>
            <p className="text-xs text-[#9a8b7a]">
              AI-generated estimate of weekly sales for the next 30 days. Weeks can swing with large orders, so use the
              30-day total as your main guide.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div role="status" aria-label="Loading sales forecast" aria-live="polite" className="flex flex-1 min-h-[220px] flex-col justify-between rounded-lg px-2 py-4">
          <div className="flex h-full min-h-[180px] items-end gap-2 border-b border-l border-[#e7ded4] px-3">
            {[48, 62, 56, 76, 40].map((height, i) => <Skeleton key={i} className="flex-1 rounded-t-sm" h="h-full" style={{ height: `${height}%` }} />)}
          </div>
          <div className="mt-3 flex justify-between">{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} w="w-14" h="h-2.5" />)}</div>
        </div>
      ) : insufficientData ? (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-[#d97706] font-medium border border-dashed border-[#e7ded4] rounded-lg text-center px-6 min-h-[220px] bg-[#fffbf4]">
          {message || 'Insufficient historical data for this forecast.'}
        </div>
      ) : isLegacyFormat ? (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-[#9a8b7a] border border-dashed border-[#e7ded4] rounded-lg text-center px-6 min-h-[220px]">
          The forecast format was updated. Refresh the forecast to see the weekly estimates.
        </div>
      ) : hasFetchedButEmpty || weeks.length === 0 ? (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-[#9a8b7a] border border-dashed border-[#e7ded4] rounded-lg text-center px-6 min-h-[220px]">
          No forecast data available. It updates once a day.
        </div>
      ) : (
        <>
          {/* Buod: ang 30-day total ang pinakamaaasahang numero */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4 pb-4 border-b border-[#f1ece4] shrink-0">
            <Stat label="Next 30 days (estimate)" value={formatPeso(forecastTotal)} />
            {recentTotal !== null && (
              <Stat
                label="Last 30 days (actual)"
                value={formatPeso(recentTotal)}
                sub={pct !== null ? `${pct >= 0 ? '+' : ''}${pct}% expected` : undefined}
                subClass={pct !== null && pct < 0 ? 'text-rose-600 font-semibold' : 'text-emerald-600 font-semibold'}
              />
            )}
            {strongestWeek && (
              <Stat label="Strongest week" value={formatPeso(strongestWeek.value)} sub={strongestWeek.label} />
            )}
          </div>

          <div className="flex-1 min-h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 10, right: 12, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1ece4" vertical={false} />
                <XAxis
                  dataKey="label"
                  interval={0}
                  tick={{ fontSize: 11, fill: '#9a8b7a', fontWeight: 500 }}
                  axisLine={{ stroke: '#f1ece4' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9a8b7a', fontWeight: 500 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatAxis}
                  domain={[0, yScale.max]}
                  ticks={yScale.ticks}
                />
                <Tooltip content={<WeeklyTooltip />} cursor={{ fill: '#f6efe6' }} />
                <Bar dataKey="value" name="Estimated total" radius={[4, 4, 0, 0]} maxBarSize={72}>
                  {weeks.map((w, i) => (
                    <Cell key={i} fill={w.partial ? COLOR_WEEK_PARTIAL : COLOR_WEEK} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#9a8b7a] shrink-0">
            <span>
              Each bar is the estimated total for 7 days.
              {hasPartial ? ' A lighter bar is a partial week, estimated from the average week.' : ''}
            </span>
            <span>Hover a bar for the usual range of recent weeks.</span>
          </div>
        </>
      )}
    </div>
  );
}