import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { LineChart as LucideLineChart } from 'lucide-react';

const formatCurrency = (val) => `₱${Number(val).toLocaleString('en-PH')}`;
const formatAxis = (val) => (val >= 1000 ? `₱${(val / 1000).toFixed(0)}K` : `₱${val}`);

const CustomXAxisTick = ({ x, y, payload, index, tickStep }) => {
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
      {isFirst && (
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
  view = '30d', 
  data: propData,
  insufficientData = false,
  message = ''
}) {
  const hasFetchedButEmpty = Array.isArray(propData) && propData.length === 0;

  const chartData = useMemo(() => {
    const daysMap = { '7d': 7, '30d': 30, '60d': 60 };
    const totalPoints = daysMap[view] || 30;
    
    const today = new Date();
    const rawForecasts = Array.isArray(propData) ? propData.map(d => d.forecastSales) : [];

    return Array.from({ length: totalPoints }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);

      const val = rawForecasts[i] !== undefined ? rawForecasts[i] : null;

      return {
        label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        forecastSales: val,
        isToday: i === 0 
      };
    });
  }, [view, propData, hasFetchedButEmpty, insufficientData]);

  const periodText = view === '7d' ? '7-Day' : view === '60d' ? '60-Day' : '30-Day';
  const tickStep = view === '7d' ? 1 : view === '30d' ? 5 : 10;

  return (
    <div className="w-full p-5 bg-white border border-[#e7ded4] rounded-xl shadow-sm flex flex-col h-full min-h-[350px]">
      <div className="flex items-center gap-2 mb-6 shrink-0">
        <LucideLineChart size={20} className="text-[#5C3317]" />
        <div>
          <h3 className="text-base font-bold text-[#3d2410]">{title}</h3>
          <p className="text-xs text-[#9a8b7a]">{periodText} Trend Analysis</p>
        </div>
      </div>

     {insufficientData ? (
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
            <LineChart data={chartData} margin={{ top: 15, right: 20, left: -15, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1ece4" vertical={false} />
              
              <XAxis 
                dataKey="label" 
                interval={0}
                tick={<CustomXAxisTick tickStep={tickStep} />} 
                axisLine={{ stroke: '#f1ece4' }} 
                tickLine={false} 
              />
              
              <YAxis 
                tick={{ fontSize: 11, fill: '#9a8b7a', fontWeight: 500 }} 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={formatAxis} 
                domain={[0, dataMax => Math.max(10000, dataMax || 10000)]} 
              />

              <Tooltip content={<CustomTooltip />} cursor={false} />

              <Line 
                type="linear" 
                dataKey="forecastSales" 
                name="Forecast" 
                stroke="#d97706" 
                strokeWidth={2.5} 
                dot={false} 
                activeDot={{ r: 5 }} 
                connectNulls 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-5 mt-4 pt-4 border-t border-[#e7ded4] text-xs shrink-0">
        <span className="flex items-center gap-2 text-[#9a8b7a] font-semibold">
          <span className="w-4 border-t-2 border-solid border-[#d97706]" /> Forecasted Sales
        </span>
      </div>
    </div>
  );
}