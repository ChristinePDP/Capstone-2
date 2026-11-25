import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LineChart as LucideLineChart } from 'lucide-react';
import { Skeleton } from '../ui';

// Fixed na 30 days ang forecast
const TOTAL_POINTS = 30;
const TICK_STEP = 5;
const Y_TICK_INTERVALS = 4; // ilang puwang sa pagitan ng ₱0 at maximum
const Y_HEADROOM = 1.15; // 15% extra space sa taas ng pinakamataas na value
const DEFAULT_Y_MAX = 1000; // fallback kapag walang data o puro zero

const formatCurrency = (val) => `₱${Number(val).toLocaleString('en-PH')}`;
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

// Dynamic na maximum at ticks ng Y-axis base sa pinakamataas na forecast
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

const CustomXAxisTick = ({ x, y, payload, index, tickStep, todayIndex }) => {
  const isFirst = index === 0;
  const isSecond = index === 1;
  const isNth = index % tickStep === 0;

  let show = false;
  if (isFirst) {
    show = true; 
  } else if (tickStep > 1 && isSecond) {
    show = false; 
  } else if (isNth) {
    show = true; 
  }

  if (!show) return null;

  return (
    <g transform={`translate(${x},${y})`}>
      <text 
        x={0} 
        y={14} 
        textAnchor="middle" 
        fill={isFirst ? '#5C3317' : '#9a8b7a'} 
        fontSize={11} 
        fontWeight={isFirst ? 700 : 500}
      >
        {payload.value}
      </text>
      {index === todayIndex && (
        <text 
          x={0} 
          y={26} 
          textAnchor="middle" 
          fill="#d97706" 
          fontSize={10} 
          fontWeight="bold"
        >
          Today
        </text>
      )}
    </g>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white border border-stone-200 rounded-md shadow-lg p-3 text-sm min-w-[160px] z-50">
      <p className="font-bold text-stone-800 border-b border-stone-100 pb-2 mb-2">{label}</p>
      <div className="flex flex-col gap-2">
        {payload.map((p, i) => (
          <div key={i} className="flex justify-between items-center gap-4">
            <span className="flex items-center gap-2 text-stone-500 text-xs">
              <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
              {p.name}:
            </span>
            <span className="font-bold text-stone-800">{formatCurrency(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function SalesForecast({ 
  title = 'Sales Forecast', 
  data: propData,
  insufficientData = false,
  message = '',
  isLoading = false,
}) {
  const hasFetchedButEmpty = Array.isArray(propData) && propData.length === 0;

  const chartData = useMemo(() => {
    // Ginagamit ang date/label na galing sa backend (hindi ang petsa ngayon),
    // para tama ang axis kahit backtest mode (hal. Oct 24 - Nov 22).
    const rows = Array.isArray(propData) ? propData : [];
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
    const fmt = (key) =>
      new Date(`${key}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    return Array.from({ length: TOTAL_POINTS }, (_, i) => {
      const p = rows[i];

      let label;
      if (p?.label) {
        label = p.label;
      } else if (p?.date) {
        label = fmt(p.date);
      } else {
        // Fallback lang kapag walang date/label sa data: bilang mula ngayon
        const d = new Date();
        d.setDate(d.getDate() + i);
        label = fmt(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }));
      }

      return {
        label,
        forecastSales: p?.forecastSales !== undefined ? p.forecastSales : null,
        // "Today" lang kung ang petsa ng punto ay talagang ngayon (live mode)
        isToday: p?.date ? p.date === todayKey : i === 0,
      };
    });
  }, [propData]);

  // Index ng "Today" sa chart; -1 kapag wala (backtest mode)
  const todayIndex = useMemo(() => chartData.findIndex((d) => d.isToday), [chartData]);

  // Dynamic na Y-axis: sumusunod sa pinakamataas na forecast para hindi lumiit ang line
  const yScale = useMemo(
    () => getYAxisScale(chartData.map((d) => d.forecastSales)),
    [chartData]
  );

  return (
    <div className="w-full p-5 bg-white border border-[#e7ded4] rounded-xl shadow-sm flex flex-col h-full min-h-[350px]">
      <div className="flex items-center gap-2 mb-6 shrink-0">
        <LucideLineChart size={20} className="text-[#5C3317]" />
        <div>
          <h3 className="text-base font-bold text-[#3d2410]">{title}</h3>
          <p className="text-xs text-[#9a8b7a]">AI-generated projection of daily sales for the next 30 days, based on your shop’s historical sales records.</p>
        </div>
      </div>

     {isLoading ? (
        <div role="status" aria-label="Loading sales forecast" aria-live="polite" className="flex flex-1 min-h-[220px] flex-col justify-between rounded-lg px-2 py-4">
          <div className="flex h-full min-h-[180px] items-end gap-2 border-b border-l border-[#e7ded4] px-3">
            {[35, 48, 40, 62, 52, 76, 58, 84, 65, 92, 72, 100].map((height, i) => <Skeleton key={i} className="flex-1 rounded-t-sm" h="h-full" style={{ height: `${height}%` }} />)}
          </div>
          <div className="mt-3 flex justify-between">{[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} w="w-8" h="h-2.5" />)}</div>
        </div>
      ) : insufficientData ? (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-[#d97706] font-medium border border-dashed border-[#e7ded4] rounded-lg text-center px-6 min-h-[220px] bg-[#fffbf4]">
          {message || 'Insufficient historical data for this forecast.'}
        </div>
      ) : hasFetchedButEmpty ? (
        <div role="status" className="flex flex-1 items-center justify-center text-sm text-[#9a8b7a] border border-dashed border-[#e7ded4] rounded-lg text-center px-6 min-h-[220px]">
          No forecast data available. It updates once a day.
        </div>
      ) : (
        <div className="flex-1 min-h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 15, right: 20, left: -15, bottom: 15 }}>
              <defs>
                <linearGradient id="salesForecastFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#d97706" stopOpacity={0.35} />
                  <stop offset="55%" stopColor="#d97706" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="#d97706" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke="#f1ece4" vertical={false} />
              
              <XAxis 
                dataKey="label" 
                interval={0}
                tick={<CustomXAxisTick tickStep={TICK_STEP} todayIndex={todayIndex} />} 
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
                allowDataOverflow={false}
              />

              <Tooltip content={<CustomTooltip />} cursor={false} />

              <Area 
                type="monotone" 
                dataKey="forecastSales" 
                name="Forecast" 
                stroke="#d97706" 
                strokeWidth={2.5} 
                fill="url(#salesForecastFill)"
                dot={false} 
                activeDot={{ r: 5, fill: '#d97706', stroke: '#fff', strokeWidth: 2 }} 
                connectNulls 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

    </div>
  );
}