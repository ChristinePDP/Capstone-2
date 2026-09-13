import { useState, useEffect, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart2 } from 'lucide-react';

export default function StackedBar({ period = 'Last 7 Days', height = 220, data: propData }) {
  const chartWrapRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(0);

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

  // LOGIC PARA SA RANGE / 30-DAY LIMIT O INTERVAL:
  // Kapag ang data ay lumagpas sa 30 items (hal. 60 days o 3 months), 
  // awtomatiko nating nilalagyan ng interval o downsampling para hindi magsiksikan 
  // at manatiling malinis at UI-approved ang X-axis labels.
  const processedChartData = useMemo(() => {
    const data = Array.isArray(propData) ? propData : [];
    
    // Kung mahigit 30 ang data points (e.g. Custom range na lampas 1 month), 
    // kinukuha natin ang tamang step para magkasya sa max 30 bars/labels.
    let filteredData = data;
    if (!isHourly && data.length > 30) {
      const step = Math.ceil(data.length / 30);
      filteredData = data.filter((_, index) => index % step === 0 || index === data.length - 1);
    }

    return filteredData.map(d => {
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

  // Roughly how many horizontal pixels a single label like "Sep 1" or "Sep 30"
  // needs so it doesn't collide with its neighbors (glyph width + breathing room).
  const LABEL_PX = 58;

  const tickInterval = useMemo(() => {
    const len = processedChartData.length;
    if (len === 0) return 0;

    // While chartWidth hasn't been measured yet, fall back to a sane guess
    // instead of showing every single label (which is what caused the crowding).
    const width = chartWidth || (typeof window !== 'undefined' ? window.innerWidth * 0.6 : 600);

    const maxVisibleLabels = Math.max(3, Math.floor(width / LABEL_PX));
    if (len <= maxVisibleLabels) return 0;

    // interval=N means "render every (N+1)th tick", so subtract 1 from the step.
    return Math.max(0, Math.ceil(len / maxVisibleLabels) - 1);
  }, [processedChartData.length, chartWidth]);

  const fmtFull = (n) => '₱' + Math.round(n).toLocaleString('en-PH');
  const fmtAxis = (v) => {
    if (v >= 1000000) return '₱' + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return '₱' + (v / 1000).toFixed(0) + 'K';
    return '₱' + v;
  };

  const axisStyle = { fontSize: 11, fill: '#64748b', fontWeight: 600 };

  return (
    <div className="relative overflow-hidden p-4 sm:p-5 bg-white rounded-xl flex flex-col h-full shadow-sm" data-testid="performance-trend">
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
      <div ref={chartWrapRef} className="flex-1" style={{ minHeight: height }}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={processedChartData} margin={{ top: 8, right: 8, left: -15, bottom: 0 }} barCategoryGap="20%">
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={true} horizontal={true} />
            
            <XAxis 
              dataKey="label" 
              tick={axisStyle} 
              axisLine={{ stroke: '#f1f5f9' }} 
              tickLine={false} 
              interval={tickInterval} 
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
                  <div className="bg-white border border-brand-200 rounded-md shadow-lg p-3 text-sm min-w-[150px] z-50">
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