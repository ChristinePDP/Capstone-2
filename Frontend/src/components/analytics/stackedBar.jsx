import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart2 } from 'lucide-react';

export default function StackedBar({ period = 'Last 7 Days', height = 280, data: propData }) {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const hasFetchedButEmpty = !Array.isArray(propData) || propData.length === 0 || (
    propData.every(d => Number(d.Sales || 0) === 0 && Number(d.Expenses || 0) === 0)
  );

  // Wala nang mock/random data generator. Gagamitin lang ang totoong propData;
  // kung wala, mananatiling walang laman (empty chart / empty state).
  const chartData = useMemo(() => {
    const data = Array.isArray(propData) ? propData : [];

    return data.map(d => {
      const Sales = Number(d.Sales || 0);
      const Expenses = Number(d.Expenses || 0);
      const Profit = Sales - Expenses;
      
      return {
        ...d,
        Sales,
        Expenses,
        Profit,
        VisExpenses: Profit >= 0 ? (Expenses > 0 ? Expenses : null) : Sales,
        VisProfit: Profit > 0 ? Profit : null, 
      };
    });
  }, [propData]);

  const tickInterval = useMemo(() => {
    const len = chartData.length;
    if (isMobile) {
      if (len <= 5) return 0;
      if (len <= 7) return 1; 
      return 4; 
    } else {
      if (len <= 15) return 0;
      return 2; 
    }
  }, [chartData.length, isMobile]);

  const fmtFull = (n) => '₱' + Math.round(n).toLocaleString('en-PH');
  const fmtAxis = (v) => {
    if (v >= 1000000) return '₱' + (v / 1000000).toFixed(1) + 'M';
    if (v >= 1000) return '₱' + (v / 1000).toFixed(0) + 'K';
    return '₱' + v;
  };

  const axisStyle = { fontSize: 11, fill: '#64748b', fontWeight: 600 };

  return (
    <div className="p-4 sm:p-5 bg-white border border-brand-100 rounded-xl flex flex-col h-full shadow-sm" data-testid="performance-trend">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart2 size={18} className="text-brand-600 shrink-0" />
          <div>
            <h3 className="text-sm font-bold text-brand-800">Performance Trend</h3>
            <p className="text-xs text-brand-400 mt-0.5">Sales composition · {period}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-brand-500 font-semibold">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#f43f5e]" />Expenses</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[#10b981]" />Profit</span>
        </div>
      </div>

      {hasFetchedButEmpty ? (
        <div role="status" className="flex-1 flex items-center justify-center text-sm text-brand-400 border border-dashed border-brand-200 rounded-lg text-center px-6 min-h-[240px]">
          No performance trend data available for this timeframe
        </div>
      ) : (
      <div className="flex-1 min-h-[240px]">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -15, bottom: 0 }} barCategoryGap="24%">
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
              minTickGap={15} 
            />
            
            <YAxis tick={axisStyle} axisLine={false} tickLine={false} tickFormatter={fmtAxis} width={56} />
            
            <Tooltip
              cursor={{ fill: '#f8fafc' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const dataObj = payload[0].payload; 
                
                return (
                  <div className="bg-white border border-brand-200 rounded-md shadow-lg p-3 text-sm min-w-[150px] z-50">
                    <p className="font-semibold text-brand-800 mb-2">{label}</p>
                    <p className="flex items-center justify-between gap-4 mb-2 pb-2 border-b border-slate-100">
                      <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full inline-block bg-[#3b82f6]" /><span className="text-brand-500">Total Sales:</span></span>
                      <span className="font-bold text-blue-600">{fmtFull(dataObj.Sales)}</span>
                    </p>
                    <p className="flex items-center justify-between gap-4 mb-1">
                      <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full inline-block bg-[#f43f5e]" /><span className="text-brand-500">Expenses:</span></span>
                      <span className="font-bold text-brand-800">{fmtFull(dataObj.Expenses)}</span>
                    </p>
                    <p className="flex items-center justify-between gap-4 mb-1">
                      <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full inline-block bg-[#10b981]" /><span className="text-brand-500">Profit:</span></span>
                      <span className={`font-bold ${dataObj.Profit < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                        {fmtFull(dataObj.Profit)}
                      </span>
                    </p>
                  </div>
                );
              }}
            />
            
            <Bar dataKey="VisExpenses" name="Expenses" fill="#f43f5e" stackId="a" />
            <Bar dataKey="VisProfit" name="Profit" fill="#10b981" stackId="a" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      )}
    </div>
  );
}