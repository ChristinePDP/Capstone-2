import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart2 } from 'lucide-react';

export default function StackedBar({ period = 'Past 7 Days', height = 220, data: propData }) {
  const chartWrapRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);
  const [viewportWidth, setViewportWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 600);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track the ACTUAL rendered width of the chart instead of just a mobile/desktop
  // boolean. This lets the tick interval adapt to any container size (sidebar
  // collapsed, split view, custom date range card, etc.), not just screen width.
  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w) setChartWidth(w);
    });
    ro.observe(el);
    setChartWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const isHourly = period.toLowerCase() === 'today' || period.toLowerCase() === 'yesterday';

  // For long ranges, sum neighboring days into display buckets. Keeping every
  // day's values in the bucket ensures the chart still represents the full range.
  // FIX: `label` stays the full range (for the tooltip), pero may hiwalay na
  // `tickLabel` (start date lang) para sa X axis, kasi ang haba ng
  // "Dec 1 – Dec 12" kaya nagpapatong-patong sa malalawak na date range.
  const processedChartData = useMemo(() => {
    const data = Array.isArray(propData) ? propData : [];
    let chartData = data;
    if (!isHourly && data.length > 30) {
      const step = Math.ceil(data.length / 30);
      chartData = [];
      for (let index = 0; index < data.length; index += step) {
        const bucket = data.slice(index, index + step);
        const firstLabel = bucket[0]?.label || '';
        const lastLabel = bucket[bucket.length - 1]?.label || firstLabel;
        chartData.push({
          label: firstLabel === lastLabel ? firstLabel : `${firstLabel} – ${lastLabel}`,
          tickLabel: firstLabel,
          Sales: bucket.reduce((sum, item) => sum + Number(item.Sales || 0), 0),
          Expenses: bucket.reduce((sum, item) => sum + Number(item.Expenses || 0), 0),
        });
      }
    }

    return chartData.map(d => {
      const Sales = Number(d.Sales || 0);
      const Expenses = Number(d.Expenses || 0);
      const Profit = Sales - Expenses;
      const isLoss = Expenses > Sales;
      
      let VisBaseExpenses = null;
      let VisBaseSales = null;
      let VisExcessExpenses = null;
      let VisProfit = null;
      let VisSalesRemainder = null;

      if (isHourly) {
        if (isLoss) {
          VisBaseSales = Sales > 0 ? Sales : null; 
          VisExcessExpenses = Expenses > Sales ? Expenses - Sales : null; 
        } else {
          VisBaseExpenses = Expenses > 0 ? Expenses : null; 
          VisSalesRemainder = Sales > Expenses ? Sales - Expenses : null; 
        }
      } else {
        VisBaseExpenses = Expenses > 0 ? Expenses : null; 
        VisProfit = Profit > 0 ? Profit : null;
      }

      return {
        ...d,
        tickLabel: d.tickLabel ?? d.label,
        Sales,
        Expenses,
        Profit,
        VisBaseExpenses,
        VisBaseSales,
        VisExcessExpenses,
        VisProfit,
        VisSalesRemainder
      };
    });
  }, [propData, isHourly]);

  const hasFetchedButEmpty = !Array.isArray(processedChartData) || processedChartData.length === 0 || (
    processedChartData.every(d => Number(d.Sales || 0) === 0 && Number(d.Expenses || 0) === 0)
  );

  // Allow enough room for date labels while keeping the chart readable.
  const effectiveWidth = Math.min(chartWidth || viewportWidth, viewportWidth);
  const isNarrowChart = effectiveWidth <= 560;

  // FIX: dati fixed lang ang lapad ng label (54 / 92px) kahit gaano kahaba
  // ang text. Ngayon, sinusukat na base sa pinakamahabang tick label na
  // talagang ipapakita, kaya hindi na nagsasalpukan ang mga label.
  const labelLayout = useMemo(() => {
    const len = processedChartData.length;
    if (len === 0) return { step: 1, labelWidth: 0, slotWidth: 0 };

    // Cap the measured width by the viewport. This prevents an initially wide
    // chart measurement from keeping too many labels after desktop-to-mobile resize.
    const width = Math.min(chartWidth || viewportWidth, viewportWidth);
    const plotWidth = Math.max(0, width - 88);

    const longest = processedChartData.reduce(
      (max, d) => Math.max(max, String(d.tickLabel ?? d.label ?? '').length),
      0
    );
    const baseWidth = width <= 560 ? 54 : 92;
    const labelWidth = Math.max(baseWidth, longest * 6.6 + 16);

    const maxVisibleLabels = Math.max(2, Math.floor(plotWidth / labelWidth));
    return {
      step: Math.max(1, Math.ceil(len / maxVisibleLabels)),
      labelWidth,
      slotWidth: plotWidth / len,
    };
  }, [processedChartData, chartWidth, viewportWidth]);

  const labelStep = labelLayout.step;

  // FIX: dati laging pinipilit ang huling label kaya sumasalpok sa naunang
  // label. Ngayon, ipapakita lang kung may sapat na espasyo.
  const showLastLabel = useMemo(() => {
    const lastIndex = processedChartData.length - 1;
    if (lastIndex < 1) return true;
    const lastRegular = Math.floor(lastIndex / labelStep) * labelStep;
    if (lastRegular === lastIndex) return true;
    return (lastIndex - lastRegular) * labelLayout.slotWidth >= labelLayout.labelWidth;
  }, [processedChartData.length, labelStep, labelLayout]);

  const fmtFull = (n) => '₱' + Math.round(n).toLocaleString('en-PH');
  const fmtAxis = (v) => {
    if (v >= 1000000) return '₱' + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return '₱' + (v / 1000).toFixed(0) + 'K';
    return '₱' + v;
  };

  const axisStyle = { fontSize: 11, fill: '#64748b', fontWeight: 600 };

  return (
    <div className="relative min-w-0 w-full overflow-hidden p-4 sm:p-5 bg-white rounded-xl flex flex-col h-full shadow-sm" data-testid="performance-trend">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4 pt-1">
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-brand-600 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-brand-800">Performance Trend</h3>
            <p className="text-xs text-brand-400 mt-0.5">Sales composition · {period}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-brand-500 font-semibold">
          {isHourly && (
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#3b82f6]" />Sales</span>
          )}
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#f43f5e]" />Expenses</span>
          {!isHourly && (
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#10b981]" />Profit</span>
          )}
        </div>
      </div>

      {hasFetchedButEmpty ? (
        <div role="status" style={{ minHeight: height }} className="flex-1 flex items-center justify-center text-sm text-brand-400 rounded-lg text-center px-6">
          No performance trend data available for this timeframe
        </div>
      ) : (
      <div ref={chartWrapRef} className="flex-1 min-w-0 w-full" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={processedChartData} margin={{ top: 8, right: 8, left: -15, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={true} horizontal={true} />
            
            <XAxis 
              dataKey="label" 
              interval={0}
              tickFormatter={(label, index) => {
                const lastIndex = processedChartData.length - 1;
                const isRegular = index % labelStep === 0;
                const isForcedLast = index === lastIndex && showLastLabel;
                if (!isRegular && !isForcedLast) return '';

                // Short tick label (start date lang) para hindi magpatong-patong.
                const text = processedChartData[index]?.tickLabel ?? label;
                if (!isNarrowChart || isHourly || typeof text !== 'string') return text;
                // Mobile: keep the date, drop the weekday (for example, "Nov 4").
                return text.replace(/^[A-Za-z]{3,9}\s*\((.+)\)$/, '$1');
              }}
              tick={axisStyle} 
              axisLine={{ stroke: '#f1f5f9' }} 
              tickLine={false} 
              angle={0} 
              textAnchor="middle"
              dy={12} 
              minTickGap={20} 
            />
            
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtAxis} width={56} />
            
            <Tooltip
              cursor={{ fill: '#f8fafc' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const dataObj = payload[0].payload; 
                
                const tooltipHourly = isHourly || /AM|PM/i.test(label);
                
                return (
                  <div className="bg-white border border-brand-200 rounded-md shadow-lg p-3 text-sm min-w-37.5 z-50">
                    <p className="font-semibold text-brand-800 mb-2">{label}</p>
                    
                    {dataObj.Sales !== 0 && (
                      <p className="flex items-center justify-between gap-4 mb-2 pb-2 border-b border-slate-100">
                        {tooltipHourly ? (
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full inline-block bg-[#3b82f6]" />
                            <span className="text-brand-500">Sales:</span>
                          </span>
                        ) : (
                          <span className="text-brand-500 font-medium">Total Sales:</span>
                        )}
                        <span className={`font-bold ${tooltipHourly ? 'text-blue-600' : 'text-brand-800'}`}>
                          {fmtFull(dataObj.Sales)}
                        </span>
                      </p>
                    )}
                    
                    {dataObj.Expenses !== 0 && (
                      <p className="flex items-center justify-between gap-4 mb-1">
                        <span className="text-brand-500">Expenses:</span>
                        <span className="font-bold text-red-500">{fmtFull(dataObj.Expenses)}</span>
                      </p>
                    )}
                    
                    {!tooltipHourly && dataObj.Profit !== 0 && (
                      <p className="flex items-center justify-between gap-4 mb-1">
                        <span className="text-brand-500">Profit:</span>
                        <span className={`font-bold ${dataObj.Profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                          {fmtFull(dataObj.Profit)}
                        </span>
                      </p>
                    )}
                  </div>
                );
              }}
            />
            
            <Bar dataKey="VisBaseExpenses" name="Expenses" fill="#f43f5e" stackId="a" />
            <Bar dataKey="VisBaseSales" name="Sales" fill="#3b82f6" stackId="a" />
            <Bar dataKey="VisSalesRemainder" name="Sales" fill="#3b82f6" stackId="a" radius={[6, 6, 0, 0]} />
            <Bar dataKey="VisProfit" name="Profit" fill="#10b981" stackId="a" radius={[6, 6, 0, 0]} />
            <Bar dataKey="VisExcessExpenses" name="Excess Expenses" fill="#f43f5e" stackId="a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}
