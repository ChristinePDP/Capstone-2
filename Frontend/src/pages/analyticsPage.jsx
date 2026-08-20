import { useState, useEffect } from 'react';
import { apiClient } from '../services/apiClient';
import PerformanceTimeframe from '../components/analytics/performanceTimeframe';
import FourKpi from '../components/analytics/fourKPI';
import StackedBar from '../components/analytics/stackedBar';
import TopProductsList from '../components/analytics/topProducts';
import ForecastTimeframe from '../components/analytics/forecastTimeframe';
import SalesForecast from '../components/analytics/salesForecast';
import ProductForecasting from '../components/analytics/productForecast';
import ActionableRecommendation from '../components/analytics/actionableRecommendation';
import Summary from '../components/analytics/summary';

// Ang Analytics endpoints ay naka-mount sa ROOT ng API bilang `/api/analytics`
// (HINDI sa ilalim ng `/inventory`), kaya kailangan ng buong absolute URL dito
// para ma-bypass ang `/inventory` baseURL ng `apiClient` — parehong pattern
// gaya ng ORDERS_API_URL sa AppContext.jsx. Ginagamit pa rin ang parehong
// `apiClient` axios instance (may withCredentials cookie auth at 401
// auto-logout interceptor), kaya consistent na ito sa buong app.
const ANALYTICS_API_URL = `${import.meta.env.VITE_API_URL}/analytics`;

export default function AnalyticsPage() {
  const [perfTimeframe, setPerfTimeframe] = useState('Today');
  const [forecastTimeframe, setForecastTimeframe] = useState('30d');

  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        // Helper na kapareho ng safeFetch() sa AppContext.jsx — hindi
        // nagfa-fail ang Promise.all kapag may isang endpoint na nag-error.
        const safeFetch = async (url) => {
          try {
            const res = await apiClient.get(url);
            return { ok: true, data: res.data };
          } catch (err) {
            console.error(`Error fetching ${url}:`, err);
            return { ok: false, data: null };
          }
        };

        const [kpiRes, stackedRes, topRes, salesRes, prodRes, actionRes, summaryRes] = await Promise.all([
          safeFetch(`${ANALYTICS_API_URL}/four-kpi/${encodeURIComponent(perfTimeframe)}`),
          safeFetch(`${ANALYTICS_API_URL}/stacked-bar/${encodeURIComponent(perfTimeframe)}`),
          safeFetch(`${ANALYTICS_API_URL}/top-products/${encodeURIComponent(perfTimeframe)}`),
          safeFetch(`${ANALYTICS_API_URL}/sales-forecast/${encodeURIComponent(forecastTimeframe)}`),
          safeFetch(`${ANALYTICS_API_URL}/product-forecast/${encodeURIComponent(forecastTimeframe)}`),
          safeFetch(`${ANALYTICS_API_URL}/actionable-recommendations/${encodeURIComponent(forecastTimeframe)}`),
          safeFetch(`${ANALYTICS_API_URL}/summary`), // Dinagdag na ang Summary endpoint dito
        ]);

        const rawKpi = kpiRes.ok ? (kpiRes.data?.data || kpiRes.data) : null;
        
        const mappedKpi = rawKpi ? {
          sales: rawKpi.totalSales || 0,
          expenses: rawKpi.totalExpenses || 0,
          profit: rawKpi.grossProfit || 0,
          margin: rawKpi.profitMargin || 0,
          sDelta: rawKpi.sDelta || 0, 
          eDelta: rawKpi.eDelta || 0, 
          pDelta: rawKpi.pDelta || 0, 
          mDelta: rawKpi.mDelta || 0
        } : { sales: 0, expenses: 0, profit: 0, margin: 0, sDelta: 0, eDelta: 0, pDelta: 0, mDelta: 0 };

        const salesPayload = salesRes.ok ? (salesRes.data?.data || salesRes.data) : {};

        setAnalyticsData({
          kpi: mappedKpi,
          performanceTrend: stackedRes.ok ? (stackedRes.data?.data || stackedRes.data) : [],
          topProducts: topRes.ok ? (topRes.data?.data || topRes.data) : [],
          salesForecast: Array.isArray(salesPayload?.chartData) ? salesPayload.chartData : (Array.isArray(salesPayload) ? salesPayload : []),
          salesInsufficient: !!salesPayload?.insufficientData,
          salesMessage: salesPayload?.message || '',
          productForecast: prodRes.ok ? (prodRes.data?.data || prodRes.data) : { growth: [], risk: [] },
          recommendations: actionRes.ok ? (actionRes.data?.data?.recommendations || actionRes.data?.data || actionRes.data) : {},
          summary: summaryRes?.ok ? (summaryRes.data?.data || summaryRes.data) : null // Kinukuha na ang summary data
        });

      } catch (err) {
        console.error("Dashboard Error:", err.message);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAnalytics();
  }, [perfTimeframe, forecastTimeframe]);

  return (
    <div className="space-y-6 overflow-x-hidden w-full max-w-full">
      <div className="flex flex-col gap-5 w-full">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 w-full">
          <h2 className="text-base sm:text-xl font-bold text-[#3d2410] min-w-0">Business Performance</h2>
          <PerformanceTimeframe value={perfTimeframe} onChange={setPerfTimeframe} />
        </div>

        <FourKpi period={perfTimeframe} kpi={analyticsData?.kpi} />

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 w-full items-stretch">
          <StackedBar period={perfTimeframe} data={analyticsData?.performanceTrend} />
          <TopProductsList period={perfTimeframe} data={analyticsData?.topProducts} />
        </div>

        {/* Pinapasa na ang fetched data at loading status */}
        <Summary data={analyticsData?.summary} isLoading={isLoading} />

        <div className="mt-4 pt-6 border-t border-[#e7ded4] flex flex-col gap-5 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 w-full">
            <h2 className="text-base sm:text-xl font-bold text-[#3d2410] min-w-0">Forecast & Recommendations</h2>
            <ForecastTimeframe defaultValue={forecastTimeframe} onChange={setForecastTimeframe} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6 w-full items-stretch">
            <SalesForecast 
              view={forecastTimeframe} 
              data={analyticsData?.salesForecast} 
              insufficientData={analyticsData?.salesInsufficient}
              message={analyticsData?.salesMessage}
            />
            <ProductForecasting view={forecastTimeframe} data={analyticsData?.productForecast} />
          </div>
          
          <div className="w-full">
            <ActionableRecommendation recommendations={analyticsData?.recommendations} />
          </div>
        </div>
      </div>
    </div>
  );
}