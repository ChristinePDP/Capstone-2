import { useState, useEffect } from 'react';
import PerformanceTimeframe from '../components/analytics/performanceTimeframe';
import FourKpi from '../components/analytics/fourKPI';
import StackedBar from '../components/analytics/stackedBar';
import TopProductsList from '../components/analytics/topProducts';
import ForecastTimeframe from '../components/analytics/forecastTimeframe';
import SalesForecast from '../components/analytics/salesForecast';
import ProductForecasting from '../components/analytics/productForecast';
import ActionableRecommendation from '../components/analytics/actionableRecommendation';
import Summary from '../components/analytics/summary';

export default function AnalyticsPage() {
  const [perfTimeframe, setPerfTimeframe] = useState('Today');
  const [forecastTimeframe, setForecastTimeframe] = useState('30d');

  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('token'); 
        const headers = { 
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }) 
        };

        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

        const endpoints = [
          `${baseUrl}/analytics/four-kpi/${encodeURIComponent(perfTimeframe)}`,
          `${baseUrl}/analytics/stacked-bar/${encodeURIComponent(perfTimeframe)}`,
          `${baseUrl}/analytics/top-products/${encodeURIComponent(perfTimeframe)}`,
          `${baseUrl}/analytics/sales-forecast/${encodeURIComponent(forecastTimeframe)}`,
          `${baseUrl}/analytics/product-forecast/${encodeURIComponent(forecastTimeframe)}`,
          `${baseUrl}/analytics/actionable-recommendations/${encodeURIComponent(forecastTimeframe)}`,
          `${baseUrl}/analytics/summary` // Dinagdag na ang Summary endpoint dito
        ];

        const responses = await Promise.all(
          endpoints.map(url => 
            fetch(url, { headers })
              .then(async (res) => {
                const json = await res.json().catch(() => ({}));
                return { ok: res.ok, data: json };
              })
              .catch(() => ({ ok: false, data: null }))
          )
        );

        const [kpiRes, stackedRes, topRes, salesRes, prodRes, actionRes, summaryRes] = responses;

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
    <div className="space-y-6">
      <div className="flex flex-col gap-5 w-full">
        <div className="flex items-center justify-between gap-2 sm:gap-4 w-full">
          <h2 className="text-base sm:text-xl font-bold text-[#3d2410]">Business Performance</h2>
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
          <div className="flex items-center justify-between gap-2 sm:gap-4 w-full">
            <h2 className="text-base sm:text-xl font-bold text-[#3d2410]">Forecast & Recommendations</h2>
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