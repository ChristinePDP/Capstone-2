
import { OrdersModel } from "../model/orders.model.js";
import { OrderItemsModel } from "../model/orderItems.model.js";
import { InventoryLogModel as InventoryLogsModel } from "../model/inventoryLog.model.js";

import { getDateRange } from "../utils/analytics/PerformancetTimeframeHelper.utils.js";

const PH_TIMEZONE = "Asia/Manila";

// ==========================================
// DATE HELPERS
// ==========================================
function getPHDate(date) {
  return new Date(
    date.toLocaleString("en-US", { timeZone: PH_TIMEZONE })
  );
}

function getPHLabel(date, options) {
  return date.toLocaleDateString("en-US", {
    ...options,
    timeZone: PH_TIMEZONE
  });
}

// ==========================================
// 1. FOUR KPI SERVICE
// ==========================================
function calculateMetrics(orders, inventoryLogs) {
  const totalSales = (orders || []).reduce(
    (sum, order) => sum + Number(order.amount_paid || 0),
    0
  );

  const totalExpenses = (inventoryLogs || []).reduce((sum, log) => {
    if (["IN", "restock"].includes(log.transaction_type)) {
      return sum + Number(log.cost || 0);
    }
    return sum;
  }, 0);

  const totalOrders = (orders || []).length;

  const grossProfit = totalSales - totalExpenses;
  const profitMargin =
    totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  return {
    totalSales,
    totalExpenses,
    grossProfit,
    profitMargin,
    totalOrders
  };
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

    const [
      currentOrders,
      currentInventoryLogs,
      priorOrders,
      priorInventoryLogs
    ] = await Promise.all([
      OrdersModel.getByDateRange(startDate, endDate, {
        columns: "amount_paid, status, created_at",
        excludeCancelled: true
      }),

      InventoryLogsModel.getByDateRange(startDate, endDate),

      OrdersModel.getByDateRange(priorStartStr, priorEndStr, {
        columns: "amount_paid, status, created_at",
        excludeCancelled: true
      }),

      InventoryLogsModel.getByDateRange(priorStartStr, priorEndStr)
    ]);

    const currentMetrics = calculateMetrics(
      currentOrders,
      currentInventoryLogs
    );

    const priorMetrics = calculateMetrics(
      priorOrders,
      priorInventoryLogs
    );

    return {
      totalSales: parseFloat(currentMetrics.totalSales.toFixed(2)),
      sDelta: parseFloat(
        calculateDelta(
          currentMetrics.totalSales,
          priorMetrics.totalSales
        ).toFixed(2)
      ),

      totalExpenses: parseFloat(currentMetrics.totalExpenses.toFixed(2)),
      eDelta: parseFloat(
        calculateDelta(
          currentMetrics.totalExpenses,
          priorMetrics.totalExpenses
        ).toFixed(2)
      ),

      grossProfit: parseFloat(currentMetrics.grossProfit.toFixed(2)),
      pDelta: parseFloat(
        calculateDelta(
          currentMetrics.grossProfit,
          priorMetrics.grossProfit
        ).toFixed(2)
      ),

      profitMargin: parseFloat(currentMetrics.profitMargin.toFixed(2)),
      mDelta: parseFloat(
        (
          currentMetrics.profitMargin -
          priorMetrics.profitMargin
        ).toFixed(2)
      ),

      totalOrders: currentMetrics.totalOrders,
      oDelta: parseFloat(
        calculateDelta(
          currentMetrics.totalOrders,
          priorMetrics.totalOrders
        ).toFixed(2)
      )
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
      OrdersModel.getByDateRange(startDate, endDate, {
        columns: "amount_paid, status, updated_at",
        excludeCancelled: true,
        ascending: true
      }),

      InventoryLogsModel.getByDateRange(startDate, endDate, {
        ascending: true
      })
    ]);

    const groupedData = {};

    const start = getPHDate(new Date(startDate));
    const end = getPHDate(new Date(endDate));

    if (timeframe === "Today" || timeframe === "Yesterday") {
      const hours = [7, 9, 11, 13, 15, 17];

      hours.forEach(h => {
        const label =
          h === 12 ? "12 PM" :
          h > 12 ? `${h - 12} PM` :
          `${h} AM`;

        groupedData[label] = {
          label,
          Sales: 0,
          Expenses: 0,
          sortKey: h
        };
      });

    } else if (timeframe === "This Year") {
      const months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
      ];

      const currentMonthLimit = end.getMonth();

      for (let i = 0; i <= currentMonthLimit; i++) {
        groupedData[months[i]] = {
          label: months[i],
          Sales: 0,
          Expenses: 0,
          sortKey: i
        };
      }

    } else if (
      timeframe === "This Month" ||
      timeframe === "Last Month"
    ) {
      const year = start.getFullYear();
      const month = start.getMonth();
      const currentDayLimit = end.getDate();

      for (let i = 1; i <= currentDayLimit; i++) {
        const d = new Date(year, month, i);

        const label = getPHLabel(d, {
          month: "short",
          day: "numeric"
        });

        groupedData[label] = {
          label,
          Sales: 0,
          Expenses: 0,
          sortKey: d.getTime()
        };
      }

    } else if (
      timeframe === "Past 7 Days" ||
      timeframe === "Past 30 Days"
    ) {
      const numDays = timeframe === "Past 7 Days" ? 7 : 30;

      for (let i = numDays - 1; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);

        let label;

        if (numDays <= 7) {
          const day = getPHLabel(d, {
            weekday: "short"
          });

          const date = getPHLabel(d, {
            month: "short",
            day: "numeric"
          });

          label = `${day} (${date})`;
        } else {
          label = getPHLabel(d, {
            month: "short",
            day: "numeric"
          });
        }

        groupedData[label] = {
          label,
          Sales: 0,
          Expenses: 0,
          sortKey: d.getTime()
        };
      }

    } else {
      let curr = new Date(start);
      curr.setHours(0, 0, 0, 0);

      while (curr <= end) {
        const label = getPHLabel(curr, {
          month: "short",
          day: "numeric"
        });

        groupedData[label] = {
          label,
          Sales: 0,
          Expenses: 0,
          sortKey: curr.getTime()
        };

        curr.setDate(curr.getDate() + 1);
      }
    }

    const getLabelForData = (isoString, period) => {
      const d = getPHDate(new Date(isoString));

      if (period === "Today" || period === "Yesterday") {
        let h = d.getHours();

        if (h < 7) h = 7;
        if (h > 17) h = 17;
        if (h % 2 === 0) h -= 1;

        return h === 12 ? "12 PM" :
          h > 12 ? `${h - 12} PM` :
          `${h} AM`;

      } else if (period === "Past 7 Days") {
        const day = getPHLabel(d, {
          weekday: "short"
        });

        const date = getPHLabel(d, {
          month: "short",
          day: "numeric"
        });

        return `${day} (${date})`;

      } else if (period === "This Year") {
        return getPHLabel(d, {
          month: "short"
        });

      } else {
        return getPHLabel(d, {
          month: "short",
          day: "numeric"
        });
      }
    };

    const processItem = (item, type) => {
      const dateString =
        type === "expenses"
          ? item.created_at
          : (item.updated_at || item.created_at);

      if (!dateString) return;

      const label = getLabelForData(dateString, timeframe);

      if (!groupedData[label]) return;

      if (type === "sales") {
        groupedData[label].Sales += Number(item.amount_paid || 0);

      } else if (type === "expenses") {
        // Isama ang current IN at historical restock records.
        if (["IN", "restock"].includes(item.transaction_type)) {
          groupedData[label].Expenses += Number(item.cost || 0);
        }
      }
    };

    (orders || []).forEach(o => processItem(o, "sales"));
    (inventoryLogs || []).forEach(log => processItem(log, "expenses"));

    const chartData = Object.values(groupedData).sort(
      (a, b) => a.sortKey - b.sortKey
    );

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

// ==========================================
// 3. TOP PRODUCTS
// ==========================================
async function fetchRawTopProductsByTimeframe(timeframe) {
  const { startDate, endDate } = getDateRange(timeframe);

  let items;

  try {
    items = await OrderItemsModel.getByOrderDateRange(
      startDate,
      endDate,
      {
        columns: "product_name, quantity, orders!inner(created_at, status)",
        excludeCancelled: true
      }
    );

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
    .map((name) => ({
      name,
      sold: productMap[name]
    }))
    .sort((a, b) => b.sold - a.sold);
}

const TopProductsService = {
  async getTopProductsByTimeframe(timeframe) {
    const result = await fetchRawTopProductsByTimeframe(timeframe);

    if (!result) {
      throw new Error("AppError");
    }

    return result.slice(0, 5);
  }
};

export {
  FourKpiService,
  StackedBarServices,
  TopProductsService
};
