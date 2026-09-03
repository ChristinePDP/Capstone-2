import { OrdersModel } from "../model/orders.model.js";
import { OrderItemsModel } from "../model/orderItems.model.js";
import { InventoryLogModel as InventoryLogsModel } from "../model/inventoryLog.model.js";

import { getDateRange } from "../utils/analytics/PerformancetTimeframeHelper.utils.js";

// ==========================================
// 1. FOUR KPI SERVICE
// ==========================================
function calculateMetrics(orders, inventoryLogs) {
  const totalSales = (orders || []).reduce((sum, order) => sum + Number(order.grand_total || 0), 0);
  const totalExpenses = (inventoryLogs || []).reduce((sum, log) => {
    if (log.transaction_type === 'IN') return sum + Number(log.cost || 0);
    return sum;
  }, 0);

  const grossProfit = totalSales - totalExpenses;
  const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  return { totalSales, totalExpenses, grossProfit, profitMargin };
}

function calculateDelta(current, prior) {
  if (prior === 0) return current > 0 ? 100 : 0; 
  return ((current - prior) / Math.abs(prior)) * 100;
}

function formatDateForDB(dateObj) {
  return new Date(dateObj).toISOString(); 
}

async function getKpiByTimeframe(timeframe) {
  try {
    const { startDate, endDate } = getDateRange(timeframe);
    const start = new Date(startDate);
    const end = new Date(endDate);
    const duration = end.getTime() - start.getTime(); 
    
    const priorEndDate = new Date(start.getTime() - 1); 
    const priorStartDate = new Date(start.getTime() - duration);

    const priorStartStr = formatDateForDB(priorStartDate);
    const priorEndStr = formatDateForDB(priorEndDate);

    const [currentOrders, currentInventoryLogs, priorOrders, priorInventoryLogs] = await Promise.all([
      OrdersModel.getByDateRange(startDate, endDate, { columns: "grand_total, status, created_at", excludeCancelled: true }),
      InventoryLogsModel.getByDateRange(startDate, endDate),
      OrdersModel.getByDateRange(priorStartStr, priorEndStr, { columns: "grand_total, status, created_at", excludeCancelled: true }),
      InventoryLogsModel.getByDateRange(priorStartStr, priorEndStr)
    ]);

    const currentMetrics = calculateMetrics(currentOrders, currentInventoryLogs);
    const priorMetrics = calculateMetrics(priorOrders, priorInventoryLogs);

    return {
      totalSales: parseFloat(currentMetrics.totalSales.toFixed(2)),
      sDelta: parseFloat(calculateDelta(currentMetrics.totalSales, priorMetrics.totalSales).toFixed(2)),
      totalExpenses: parseFloat(currentMetrics.totalExpenses.toFixed(2)),
      eDelta: parseFloat(calculateDelta(currentMetrics.totalExpenses, priorMetrics.totalExpenses).toFixed(2)),
      grossProfit: parseFloat(currentMetrics.grossProfit.toFixed(2)),
      pDelta: parseFloat(calculateDelta(currentMetrics.grossProfit, priorMetrics.grossProfit).toFixed(2)),
      profitMargin: parseFloat(currentMetrics.profitMargin.toFixed(2)),
      mDelta: parseFloat((currentMetrics.profitMargin - priorMetrics.profitMargin).toFixed(2))
    };

  } catch (error) {
    console.error("🔥 BACKEND CRASH SA FOUR KPI:", error.message || error);
    throw error;
  }
}

const FourKpiService = { getKpiByTimeframe };

// ==========================================
// 2. STACKED BAR & TOP PRODUCTS
// ==========================================
async function getStackedBarByTimeframe(timeframe) {
  try {
    const { startDate, endDate } = getDateRange(timeframe);

    const [orders, inventoryLogs] = await Promise.all([
      OrdersModel.getByDateRange(startDate, endDate, { columns: "grand_total, status, updated_at", excludeCancelled: true, ascending: true }),
      InventoryLogsModel.getByDateRange(startDate, endDate, { ascending: true })
    ]);

    const groupedData = {};
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (timeframe === 'Today' || timeframe === 'Yesterday') {
      const hours = [6, 8, 10, 12, 14, 16, 18, 20];
      hours.forEach(h => {
        const label = h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
        groupedData[label] = { label, Sales: 0, Expenses: 0, sortKey: h };
      });
    } else if (timeframe === 'This Year') {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const currentMonthLimit = end.getMonth(); 
      for (let i = 0; i <= currentMonthLimit; i++) {
        groupedData[months[i]] = { label: months[i], Sales: 0, Expenses: 0, sortKey: i };
      }
    } else if (timeframe === 'This Month') {
      const year = start.getFullYear();
      const month = start.getMonth();
      const currentDayLimit = end.getDate(); 
      for (let i = 1; i <= currentDayLimit; i++) {
        const d = new Date(year, month, i);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        groupedData[label] = { label, Sales: 0, Expenses: 0, sortKey: d.getTime() };
      }
    } else if (timeframe === 'Last Month') {
      const year = start.getFullYear();
      const month = start.getMonth();
      const daysInMonth = end.getDate(); 
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        groupedData[label] = { label, Sales: 0, Expenses: 0, sortKey: d.getTime() };
      }
    } else if (timeframe === 'Last 7 Days') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        const day = d.toLocaleDateString('en-US', { weekday: 'short' });
        const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        groupedData[`${day} (${date})`] = { label: `${day} (${date})`, Sales: 0, Expenses: 0, sortKey: d.getTime() };
      }
    } else {
      let curr = new Date(start);
      curr.setHours(0,0,0,0);
      while (curr <= end) {
        const label = curr.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        groupedData[label] = { label, Sales: 0, Expenses: 0, sortKey: curr.getTime() };
        curr.setDate(curr.getDate() + 1);
      }
    }

    const getLabelForData = (isoString, period) => {
      const d = new Date(isoString);
      if (period === 'Today' || period === 'Yesterday') {
        let h = d.getHours();
        if (h < 6) h = 6; 
        if (h > 20) h = 20; 
        if (h % 2 !== 0) h -= 1; 
        return h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
      } else if (period === 'Last 7 Days') {
        const day = d.toLocaleDateString('en-US', { weekday: 'short' });
        const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${day} (${date})`;
      } else if (period === 'This Year') {
        return d.toLocaleDateString('en-US', { month: 'short' });
      } else {
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
    };

    const processItem = (item, type) => {
      const dateString = item.updated_at || item.created_at;
      if (!dateString) return;
      
      const label = getLabelForData(dateString, timeframe);

      if (groupedData[label]) {
        if (type === 'sales') {
          groupedData[label].Sales += Number(item.grand_total || 0);
        } else if (type === 'expenses') {
          if (item.transaction_type === 'IN') {
            groupedData[label].Expenses += Number(item.cost || 0);
          }
        }
      }
    };

    (orders || []).forEach(o => processItem(o, 'sales'));
    (inventoryLogs || []).forEach(log => processItem(log, 'expenses'));

    const chartData = Object.values(groupedData).sort((a, b) => a.sortKey - b.sortKey);

    return chartData.map(item => {
      const sales = parseFloat(item.Sales.toFixed(2));
      const expenses = parseFloat(item.Expenses.toFixed(2));
      const profit = parseFloat((sales - expenses).toFixed(2));
      
      return {
        label: item.label,
        Sales: sales,
        Expenses: expenses,
        Profit: profit 
      };
    });

  } catch (error) {
    throw error;
  }
}

const StackedBarServices = { getStackedBarByTimeframe };

async function fetchRawTopProductsByTimeframe(timeframe) {
  const { startDate, endDate } = getDateRange(timeframe);

  let items;
  try {
    items = await OrderItemsModel.getByOrderDateRange(startDate, endDate, {
      columns: "product_name, quantity, orders!inner(created_at, status)",
      excludeCancelled: true,
    });
  } catch (error) {
    console.error("Supabase Error sa Top Products:", error);
    throw new Error("Failed to fetch top products from database");
  }

  const productMap = {};
  items.forEach((item) => {
    if (!productMap[item.product_name]) {
      productMap[item.product_name] = 0;
    }
    productMap[item.product_name] += item.quantity;
  });

  return Object.keys(productMap)
    .map((name) => ({ name, sold: productMap[name] }))
    .sort((a, b) => b.sold - a.sold);
}

const TopProductsService = {
  async getTopProductsByTimeframe(timeframe) {
    const result = await fetchRawTopProductsByTimeframe(timeframe);
    if (!result) {
      throw new Error("AppError");
    }
    return result.slice(0, 5);
  },
};

export {
  FourKpiService,
  StackedBarServices,
  TopProductsService
};