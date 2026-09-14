import { useState, useEffect } from 'react';
import { apiClient } from '../services/apiClient';
import PerformanceTimeframe from '../components/analytics/performanceTimeframe';
import PerformanceKpis from '../components/analytics/performanceKpis';
import StackedBar from '../components/analytics/stackedBar';
import ForecastTimeframe from '../components/analytics/forecastTimeframe';
import SalesForecast from '../components/analytics/salesForecast';
import ProductForecasting from '../components/analytics/productForecast';
import ActionableRecommendation from '../components/analytics/actionableRecommendation';
import Summary from '../components/analytics/summary';

const ANALYTICS_API_URL = `${import.meta.env.VITE_API_URL}/analytics`;

const safeFetch = async (url) => {
  try {
    const res = await apiClient.get(url);
    return { ok: true, data: res.data };
  } catch (err) {
    console.error(`Error fetching ${url}:`, err);
    return { ok: false, data: null };
  }
};

export default function AnalyticsPage() {
  const [perfTimeframe, setPerfTimeframe] = useState('Today');
  const [forecastTimeframe, setForecastTimeframe] = useState('30d');
  const [analyticsData, setAnalyticsData] = useState({});
  const [isPerfLoading, setIsPerfLoading] = useState(true);
  const [isForecastLoading, setIsForecastLoading] = useState(true);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);

  useEffect(() => {
    const fetchPerf = async () => {
      setIsPerfLoading(true);
      
      const [kpiRes, stackedRes] = await Promise.all([
        safeFetch(`${ANALYTICS_API_URL}/four-kpi/${encodeURIComponent(perfTimeframe)}`),
        safeFetch(`${ANALYTICS_API_URL}/stacked-bar/${encodeURIComponent(perfTimeframe)}`)
      ]);

      const rawKpi = kpiRes.ok ? (kpiRes.data?.data || kpiRes.data) : null;
      const mappedKpi = rawKpi ? {
        sales: rawKpi.totalSales || 0,
        expenses: rawKpi.totalExpenses || 0,
        profit: rawKpi.grossProfit || 0,
        orders: rawKpi.totalOrders || rawKpi.orderCount || 0,
        sDelta: rawKpi.sDelta || 0,
        eDelta: rawKpi.eDelta || 0,
        pDelta: rawKpi.pDelta || 0,
        oDelta: rawKpi.oDelta || 0,
      } : { sales: 0, expenses: 0, profit: 0, orders: 0, sDelta: 0, eDelta: 0, pDelta: 0, oDelta: 0 };

      const performanceTrend = stackedRes.ok ? (stackedRes.data?.data || stackedRes.data) : [];

      setAnalyticsData(prev => ({
        ...prev,
        kpi: mappedKpi,
        performanceTrend
      }));
      
      setIsPerfLoading(false);
    };
    
    fetchPerf();
  }, [perfTimeframe]);

  useEffect(() => {
    const fetchForecast = async () => {
      setIsForecastLoading(true);
      
      const [salesRes, prodRes, actionRes] = await Promise.all([
        safeFetch(`${ANALYTICS_API_URL}/sales-forecast/${encodeURIComponent(forecastTimeframe)}`),
        safeFetch(`${ANALYTICS_API_URL}/product-forecast/${encodeURIComponent(forecastTimeframe)}`),
        safeFetch(`${ANALYTICS_API_URL}/actionable-recommendations/${encodeURIComponent(forecastTimeframe)}`)
      ]);

      const salesPayload = salesRes.ok ? (salesRes.data?.data || salesRes.data) : {};

      setAnalyticsData(prev => ({
        ...prev,
        salesForecast: Array.isArray(salesPayload?.chartData) ? salesPayload.chartData : (Array.isArray(salesPayload) ? salesPayload : []),
        salesInsufficient: !!salesPayload?.insufficientData,
        salesMessage: salesPayload?.message || '',
        productForecast: prodRes.ok ? (prodRes.data?.data || prodRes.data) : { growth: [], risk: [] },
        recommendations: actionRes.ok ? (actionRes.data?.data?.recommendations || actionRes.data?.data || actionRes.data) : {}
      }));
      
      setIsForecastLoading(false);
    };
    
    fetchForecast();
  }, [forecastTimeframe]);

  useEffect(() => {
    const fetchSummary = async () => {
      setIsSummaryLoading(true);
      const summaryRes = await safeFetch(`${ANALYTICS_API_URL}/summary`);
      
      setAnalyticsData(prev => ({
        ...prev,
        summary: summaryRes?.ok ? (summaryRes.data?.data || summaryRes.data) : null
      }));
      
      setIsSummaryLoading(false);
    };
    
    fetchSummary();
  }, []); 

  return (
    <div className="overflow-x-hidden w-full max-w-full">
      <div className="flex flex-col gap-4 sm:gap-5 w-full">
        
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 w-full">
          <h2 className="text-base sm:text-xl font-bold text-[#3d2410] min-w-0">Business Performance</h2>
          <PerformanceTimeframe value={perfTimeframe} onChange={setPerfTimeframe} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-3 sm:gap-5 w-full lg:items-stretch">
          <div className="h-full w-full">
            <PerformanceKpis kpi={analyticsData?.kpi} isLoading={isPerfLoading} />
          </div>
          <StackedBar period={perfTimeframe} data={analyticsData?.performanceTrend} height={180} />
        </div>

        <div className="pt-4 sm:pt-6 border-t border-[#e7ded4] flex flex-col gap-4 sm:gap-5 w-full">
          <h2 className="text-base sm:text-xl font-bold text-[#3d2410] min-w-0">AI-Driven Insights</h2>

          <div className="flex flex-col gap-2">
            <h3 className="text-sm sm:text-base font-semibold text-[#3d2410]">Summarization</h3>
            <Summary data={analyticsData?.summary} isLoading={isSummaryLoading} />
          </div>

          <div className="flex flex-col gap-3 bg-[#fdfbf9] p-3 sm:p-4 rounded-xl border border-[#e7ded4]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 w-full mb-1">
              <h3 className="text-sm sm:text-base font-semibold text-[#3d2410]">Forecasting</h3>
              <ForecastTimeframe defaultValue={forecastTimeframe} onChange={setForecastTimeframe} />
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 sm:gap-4 w-full lg:items-stretch">
              <SalesForecast 
                view={forecastTimeframe} 
                data={analyticsData?.salesForecast} 
                insufficientData={analyticsData?.salesInsufficient}
                message={analyticsData?.salesMessage}
              />
              <ProductForecasting view={forecastTimeframe} data={analyticsData?.productForecast} />
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            <h3 className="text-sm sm:text-base font-semibold text-[#3d2410]">Decision Support Insights</h3>
            <div className="w-full">
              <ActionableRecommendation recommendations={analyticsData?.recommendations} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}