import { OrdersModel } from "../model/orders.model.js";
import { OrderItemsModel } from "../model/orderItems.model.js";
import { InventoryLogModel as InventoryLogsModel } from "../model/inventoryLog.model.js";
import { WasteLogsModel } from "../model/wasteLogs.model.js";
import { AiCacheModel } from "../model/AiCache.model.js";
import { RecipeModel } from "../model/recipe.model.js";

import { callGeminiJSON } from "../utils/analytics/geminiForecast.util.js";
import { getLookbackDateRange } from "../utils/analytics/ForecastTimeframe.utils.js";

const TIMEFRAME_DAYS = { "7d": 7, "30d": 30, "60d": 60 };

function buildDateSequenceSafe(startDate, endDate) {
  const dates = [];
  let cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  let end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (cur <= end) {
    const year = cur.getFullYear();
    const month = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ==========================================
// 1. ACTIONABLE RECOMMENDATIONS SERVICE (MASTER CACHE)
// ==========================================
const AR_CACHE_TTL_MS = 24 * 60 * 60 * 1000; 
const AR_VALID_TYPES = ["success", "warning", "danger", "info", "neutral"];
const AR_TIMEFRAMES = ["7d", "30d", "60d"];
const AR_MASTER_CACHE_KEY = "actionable_recommendations_master_v3";

async function getRecentSalesTrend(days) {
  const { startDate, endDate } = getLookbackDateRange(days);

  const orders = await OrdersModel.getByDateRange(startDate, endDate, {
    columns: "grand_total, created_at",
    excludeCancelled: true,
    ascending: true,
  });

  const totalsByDate = {};
  for (const order of orders) {
    const day = order.created_at.slice(0, 10);
    totalsByDate[day] = (totalsByDate[day] || 0) + Number(order.grand_total || 0);
  }

  return Object.keys(totalsByDate)
    .sort()
    .map((date) => ({ date, totalSales: totalsByDate[date] }));
}

async function getProductGrowthAndRisk(days) {
  const { startDate: recentStart, endDate: recentEnd } = getLookbackDateRange(days);
  const { startDate: priorStart } = getLookbackDateRange(days * 2);
  const priorEnd = recentStart;

  const columns = "product_name, quantity, orders!inner(created_at, status)";

  const [recentItems, priorItems] = await Promise.all([
    OrderItemsModel.getByOrderDateRange(recentStart, recentEnd, { columns }),
    OrderItemsModel.getByOrderDateRange(priorStart, priorEnd, { columns }),
  ]);

  const sumByProduct = (items) => {
    const totals = {};
    for (const item of items) {
      totals[item.product_name] = (totals[item.product_name] || 0) + Number(item.quantity || 0);
    }
    return totals;
  };

  const recentTotals = sumByProduct(recentItems);
  const priorTotals = sumByProduct(priorItems);
  const productNames = new Set([...Object.keys(recentTotals), ...Object.keys(priorTotals)]);

  const changes = [...productNames].map((name) => {
    const recentQty = recentTotals[name] || 0;
    const priorQty = priorTotals[name] || 0;
    const diff = recentQty - priorQty;
    const pct = priorQty === 0 ? (recentQty > 0 ? 100 : 0) : Math.round((diff / priorQty) * 100);
    return { name, recentQty, priorQty, diff, pct };
  });

  const topGrowthProducts = changes.filter((c) => c.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 5);
  const topRiskProducts = changes.filter((c) => c.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 5);

  return { topGrowthProducts, topRiskProducts };
}

async function getSalesForecastSnippet(timeframe) {
  const keys = [`sales_forecast:${timeframe}`, "sales_forecast:60d", "sales_forecast:30d", "sales_forecast:7d"];
  for (const key of keys) {
    const cached = await AiCacheModel.getByKey(key);
    if (cached?.payload?.chartData?.length) {
      return cached.payload.chartData.slice(0, 14);
    }
  }
  return [];
}

async function getSalesGrowthContext(timeframe, days) {
  const [recentSalesTrend, growthAndRisk, forecastSnippet] = await Promise.all([
    getRecentSalesTrend(days),
    getProductGrowthAndRisk(days),
    getSalesForecastSnippet(timeframe),
  ]);

  return {
    recentSalesTrend,
    topGrowthProducts: growthAndRisk.topGrowthProducts,
    topRiskProducts: growthAndRisk.topRiskProducts,
    forecastSnippet,
  };
}

function extractIngredientName(recipeIngredientRow) {
  return String(
    recipeIngredientRow.ingredient_name ??
    recipeIngredientRow.item_name ??
    recipeIngredientRow.name ??
    ""
  ).trim();
}

async function buildIngredientToProductsMap() {
  const { data: recipes, error } = await RecipeModel.findAll();
  if (error) {
    console.error("[ActionableRecommendationService] Failed to load recipes:", error.message);
    return {};
  }

  const map = {};
  for (const recipe of recipes || []) {
    const productName = recipe.products?.name;
    if (!productName) continue;

    for (const ri of recipe.recipe_ingredients || []) {
      const ingredientName = extractIngredientName(ri);
      if (!ingredientName) continue;

      const key = ingredientName.toLowerCase();
      if (!map[key]) map[key] = new Set();
      map[key].add(productName);
    }
  }
  return map;
}

async function getExpiryAdvisoryContext(days, ingredientToProducts) {
  const { startDate: activityStart, endDate: activityEnd } = getLookbackDateRange(days);

  const [nearExpiringRaw, inventoryLogs, recentWaste] = await Promise.all([
    InventoryLogsModel.getNearExpiring(days),
    InventoryLogsModel.getByDateRange(activityStart, activityEnd),
    WasteLogsModel.getRecent(activityStart, activityEnd),
  ]);

  const inventoryActivitySummary = (inventoryLogs || []).reduce((acc, log) => {
    if (!acc[log.item_name]) acc[log.item_name] = { in_restock: 0, out_used: 0, waste: 0 };

    if (log.transaction_type === 'IN') {
      acc[log.item_name].in_restock += Number(log.quantity);
    } else if (log.transaction_type === 'OUT') {
      if (log.action === 'Waste') {
        acc[log.item_name].waste += Number(log.quantity);
      } else {
        acc[log.item_name].out_used += Number(log.quantity);
      }
    }
    return acc;
  }, {});

  const nearExpiringItems = (nearExpiringRaw || []).map((row) => {
    const key = String(row.item_name || "").toLowerCase();
    const possibleProducts = ingredientToProducts[key] ? [...ingredientToProducts[key]] : [];
    return {
      itemName: row.item_name,
      itemType: row.item_type,
      quantity: Number(row.quantity || 0),
      expirationDate: row.expiration_date,
      possibleProducts,
    };
  });

  return { nearExpiringItems, inventoryActivitySummary, recentWaste };
}

async function getBundleOpportunityContext(days) {
  const { startDate, endDate } = getLookbackDateRange(days);

  const items = await OrderItemsModel.getByOrderDateRange(startDate, endDate, {
    columns: "product_name, quantity, orders!inner(created_at, status)",
    excludeCancelled: true,
  });

  const totals = {};
  for (const item of items || []) {
    totals[item.product_name] = (totals[item.product_name] || 0) + Number(item.quantity || 0);
  }

  const sorted = Object.entries(totals)
    .map(([name, qty]) => ({ name, qty }))
    .sort((a, b) => b.qty - a.qty);

  const bestSellers = sorted.slice(0, 5);
  const bestSellerNames = new Set(bestSellers.map((p) => p.name));
  const slowMovers = sorted
    .filter((p) => !bestSellerNames.has(p.name))
    .slice(-5)
    .reverse();

  return { bestSellers, slowMovers };
}

async function getRecommendationContext() {
  const ingredientToProducts = await buildIngredientToProductsMap();

  const entries = await Promise.all(
    AR_TIMEFRAMES.map(async (timeframe) => {
      const days = TIMEFRAME_DAYS[timeframe];
      const [salesGrowthContext, expiryContext, bundleContext] = await Promise.all([
        getSalesGrowthContext(timeframe, days),
        getExpiryAdvisoryContext(days, ingredientToProducts),
        getBundleOpportunityContext(days),
      ]);
      return [timeframe, { salesGrowthContext, expiryContext, bundleContext }];
    })
  );

  return Object.fromEntries(entries);
}

function buildActionablePrompt(context) {
  const todayDate = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });

  const systemPrompt = `You are a sophisticated Decision Support System (DSS) advisor for Cakelytics, specifically analyzing "Aileen and Cake Max," a local cake and bake shop business located in the Philippines.
Today's date is ${todayDate}.

The input context is organized by THREE TIMEFRAMES — "7d" (next 7 days), "30d" (next 30 days), "60d" (next 60 days) — and each timeframe's data was queried over that SAME window (e.g. the "7d" entry's sales trend covers only the last 7 days; the "60d" entry covers the last 60 days). Treat each timeframe independently: do not copy or paraphrase the same recommendation across timeframes, since the underlying data itself is different per timeframe.

For EACH of the three timeframes, produce THREE distinct categories of decision-support recommendations, each with its own analytical job. Do not blend the categories together, and do not repeat the same recommendation across categories.

1. "salesOptimization" (Sales Growth Strategy):
   - Analyze that timeframe's salesGrowthContext: the ACTUAL sales performance over the window (recentSalesTrend), product-level growth/risk trends (topGrowthProducts / topRiskProducts), and — if present — a preview of the existing sales forecast (forecastSnippet).
   - You MUST factor in local Philippine realities based on today's date: determine the current season (Tag-init/Summer, Habagat/Typhoon season, or 'Ber' months/Christmas season) and its effect on foot traffic and sales, and consider Filipino payday buying patterns (15th and 30th).
   - Strategies MUST stay within pick-up, advance pre-order, and on-site upselling only (never delivery). When a seasonal factor REDUCES walk-in traffic (e.g. heavy rain during Habagat), do NOT recommend urging customers to physically come in despite the bad weather — instead, shift the strategy toward advance pre-orders with a flexible pick-up window (order now, pick up once weather clears), confirming orders ahead of time by phone/online, or bundling around occasions less sensitive to weather (e.g. birthdays booked days ahead). The recommendation must never contradict the seasonal condition it's based on.
   - HONESTY: if sales are flat or declining, say so directly and give mitigation strategies (e.g. trimming raw material orders, timed flash sales, adjusted promos for store pick-up) instead of inventing a fake "peak season."
   - Give 2-4 recommendations.

2. "wasteReduction" (Expiry Advisory):
   - Analyze that timeframe's expiryContext.nearExpiringItems: each entry is an ingredient batch expiring within THAT timeframe's window, with an estimated remaining quantity and, when a recipe match was found, a list of possibleProducts that use that ingredient.
   - For each near-expiring ingredient that has possibleProducts, recommend making/pushing that specific product, propose a REASONABLE discount percentage or price, briefly explain WHY that discount level is reasonable (e.g. weighed against the cost of the ingredient vs. the loss if it expires unused), and state the expected return of doing this (e.g. recovering partial revenue vs. a total write-off).
   - If nearExpiringItems is EMPTY for that timeframe, do NOT invent expiring items. Instead, give general inventory-improvement recommendations based on that timeframe's expiryContext.inventoryActivitySummary and expiryContext.recentWaste (e.g. adjusting restock frequency/quantity for items with a high waste rate, improving stock rotation / FIFO practices).
   - Give 2-4 recommendations.

3. "bundlePromotions" (Bundle Opportunities):
   - Analyze that timeframe's bundleContext.slowMovers (low/no-movement products) against bundleContext.bestSellers (top sellers), both measured over that same window.
   - Recommend specific bundle pairings: name a specific slow-moving product paired with a specific best-selling product, explain the promo mechanic (e.g. discounted bundle price, "add-on" pricing, small freebie with purchase), and why the pairing makes sense for a bakery/celebration business.
   - Give 2-4 recommendations.

CRITICAL RULES (apply to ALL timeframes and ALL three categories):
- BUSINESS NATURE & OPERATIONS: The business offers package cakes, customized cakes, common Filipino pastry products, and celebration materials (like candles and tarpaulins). 
  * STRICT PICK-UP ONLY POLICY: The bakeshop strictly does NOT offer delivery. NEVER suggest delivery services, delivery-based promos, or third-party logistics (like Grab or Foodpanda). Focus entirely on strategies that drive walk-ins, advanced pre-orders for store pick-up, and on-site upselling.
  * STRICT NO HOSPITALITY/DINE-IN: This is purely a retail cake shop. NEVER suggest dine-in promotions, table reservations, or hospitality-associated services.
  * RELEVANT OFFERINGS ONLY: Any product/promo suggestion MUST strictly align with the bakery/celebration context. Do NOT suggest irrelevant items like drinks (e.g., iced tea) or unrelated meals. Strictly do NOT suggest school-related promos (like "back to school").
- LOGICAL CONSISTENCY: Never produce a recommendation whose premise contradicts its own conclusion (e.g. citing bad weather as a reason customers won't go out, then still recommending an immediate walk-in push). If the pick-up-only constraint makes an insight unusable as-is, do not force it — instead reframe it using pre-order/advance-booking mechanics, or pick a different angle from the same data.
- Do NOT invent numbers, products, or ingredients that are not present in the given context.
- LANGUAGE: Strictly use HUMANISED, CONVERSATIONAL TAGLISH. Sound like an experienced Filipino business consultant talking straightforwardly to the owner.

Respond with ONLY valid JSON strictly following this format:
{
  "7d": {
    "salesOptimization": [ { "title": "...", "desc": "...", "type": "success" | "warning" | "danger" | "info" | "neutral" } ],
    "wasteReduction": [ { "title": "...", "desc": "...", "type": "..." } ],
    "bundlePromotions": [ { "title": "...", "desc": "...", "type": "..." } ]
  },
  "30d": { "salesOptimization": [...], "wasteReduction": [...], "bundlePromotions": [...] },
  "60d": { "salesOptimization": [...], "wasteReduction": [...], "bundlePromotions": [...] }
}`;

  const userPrompt = `Business context, organized by timeframe (JSON): ${JSON.stringify(context)}`;
  return { systemPrompt, userPrompt };
}

function normalizeActionablePayload(aiResult) {
  const normalizeArray = (arr) => {
    const list = Array.isArray(arr) ? arr : [];
    return list.filter(r => r && r.title && r.desc).map(r => ({
      title: String(r.title),
      desc: String(r.desc),
      type: AR_VALID_TYPES.includes(r.type) ? r.type : "neutral",
    }));
  };

  const normalizeTimeframe = (tf) => ({
    salesOptimization: normalizeArray(tf?.salesOptimization),
    wasteReduction: normalizeArray(tf?.wasteReduction),
    bundlePromotions: normalizeArray(tf?.bundlePromotions),
  });

  return {
    "7d": normalizeTimeframe(aiResult?.["7d"]),
    "30d": normalizeTimeframe(aiResult?.["30d"]),
    "60d": normalizeTimeframe(aiResult?.["60d"]),
  };
}

function emptyActionableTimeframe() {
  return { salesOptimization: [], wasteReduction: [], bundlePromotions: [] };
}

function emptyActionablePayload() {
  return { "7d": emptyActionableTimeframe(), "30d": emptyActionableTimeframe(), "60d": emptyActionableTimeframe() };
}

const ActionableRecommendationService = {
  async getActionableRecommendations(timeframe = "30d", forceRefresh = false) {
    if (typeof timeframe === 'boolean') {
      forceRefresh = timeframe;
      timeframe = '30d';
    }

    const validTimeframe = AR_TIMEFRAMES.includes(timeframe) ? timeframe : "30d";

    if (!forceRefresh) {
      const cached = await AiCacheModel.getByKey(AR_MASTER_CACHE_KEY);
      if (cached && cached.payload) {
        return { recommendations: cached.payload[validTimeframe] || emptyActionableTimeframe() };
      }
      return { recommendations: emptyActionableTimeframe() };
    }

    try {
      const context = await getRecommendationContext();
      const { systemPrompt, userPrompt } = buildActionablePrompt(context);
      const aiResult = await callGeminiJSON({ systemPrompt, userPrompt });
      const payload = normalizeActionablePayload(aiResult);

      await AiCacheModel.upsert(AR_MASTER_CACHE_KEY, payload, AR_CACHE_TTL_MS);
      return { recommendations: payload[validTimeframe] || emptyActionableTimeframe() };
    } catch (err) {
      console.error("[ActionableRecommendationService] Gemini recommendation failed:", err.message);
      return { recommendations: emptyActionableTimeframe() };
    }
  },
};

// ==========================================
// 2. PRODUCT FORECAST SERVICE (MASTER CACHE SCALING)
// ==========================================
const PF_CACHE_TTL_MS = 24 * 60 * 60 * 1000; 
const PF_TIMEFRAME_LABELS = { "7d": "Next 7 Days", "30d": "Next 30 Days", "60d": "Next 60 Days" };

function buildProductCacheKey(timeframe) {
  return `product_forecast:${timeframe}`;
}

async function getRawProductSalesHistory(days) {
  const { startDate, endDate } = getLookbackDateRange(days);

  const rows = await OrderItemsModel.getByOrderDateRange(startDate, endDate, {
    columns: `quantity, products ( name, category ), orders!inner ( created_at, status )`,
    excludeCancelled: true,
  });

  const dateSequence = buildDateSequenceSafe(startDate, endDate);
  const byProduct = {}; 

  for (const row of rows) {
    const name = row.products?.name || "Unknown Product";
    const category = row.products?.category || "Uncategorized";
    const key = `${name}|||${category}`;
    const day = row.orders?.created_at?.slice(0, 10);

    if (!byProduct[key]) {
      byProduct[key] = { productName: name, category, qtyByDate: {} };
    }
    byProduct[key].qtyByDate[day] = (byProduct[key].qtyByDate[day] || 0) + Number(row.quantity || 0);
  }

  return Object.values(byProduct).map((p) => ({
    productName: p.productName,
    category: p.category,
    dailyQty: dateSequence.map((d) => p.qtyByDate[d] || 0),
  }));
}

// UPDATED: step-by-step deterministic method instructions + explicit
// consistency rule, replacing the old vague "utilizing ARIMA" framing.
function buildProductPrompt(timeframe, productSalesHistory) {
  const days = TIMEFRAME_DAYS[timeframe] || 30;

  const systemPrompt = `You are a product-level sales trend assistant for Cakelytics, a small Philippine bakeshop.

TASK: Given each product's recent daily quantity history, identify which products are trending UP ("growth") and which are trending DOWN ("risk") over the next ${days} days.

Follow this method PRECISELY, in order, for EACH product, so your output stays consistent given the same input:
1. Sum the product's quantities over the full historical window provided — this is its recent total (recentQty).
2. Compare the average daily quantity in the most recent half of the window against the average daily quantity in the earlier half, to determine trend direction and rough magnitude.
3. Project that trend forward across ${days} days to estimate a forecasted total quantity (forecast).
4. Compute diff = forecast - recentQty, and pct = round((diff / recentQty) * 100). If recentQty is 0, treat pct as 100 if forecast > 0, otherwise 0.
5. Do NOT invent growth or decline that isn't supported by the historical numbers — if a product's history is flat, it does not belong in either list.
6. Select at most the 5 products with the strongest positive diff for "growth", and at most the 5 with the strongest negative diff for "risk". Do not include the same product in both lists.

CONSISTENCY RULE: Do NOT introduce random variation — same input data must always produce the same output.

ALL numbers (forecast, diff, pct) MUST be integers.

Respond with ONLY valid JSON:
{
  "growth": [{ "name": "Product Name", "pct": number, "diff": number, "forecast": number }],
  "risk": [{ "name": "Product Name", "pct": number, "diff": number, "forecast": number }]
}`;

  const userPrompt = `Timeframe requested: ${timeframe} (forecast horizon: ${days} days)\nPer-product recent daily quantity history (oldest to newest): ${JSON.stringify(productSalesHistory)}`;

  return { systemPrompt, userPrompt };
}

function normalizeList(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({
    name: String(item.name ?? ""),
    pct: Math.round(Number(item.pct ?? 0)),
    diff: Math.round(Number(item.diff ?? 0)),
    forecast: Math.max(0, Math.round(Number(item.forecast ?? 0))),
  }));
}

function normalizeProductPayload(aiResult, timeframe) {
  return {
    label: PF_TIMEFRAME_LABELS[timeframe] || PF_TIMEFRAME_LABELS["30d"],
    growth: normalizeList(aiResult?.growth),
    risk: normalizeList(aiResult?.risk),
  };
}

function emptyProductPayload(timeframe) {
  return { label: PF_TIMEFRAME_LABELS[timeframe] || PF_TIMEFRAME_LABELS["30d"], growth: [], risk: [] };
}

const ProductForecastService = {
  async getProductTrendsByTimeframe(timeframe = "30d", forceRefresh = false) {
    if (typeof timeframe === 'boolean') {
      forceRefresh = timeframe;
      timeframe = '30d';
    }

    const requestedDays = TIMEFRAME_DAYS[timeframe] || 30;

    if (!forceRefresh) {
      const possibleMasterKeys = ["product_forecast:60d", "product_forecast:30d", "product_forecast:7d"];
      let cached = null;
      let matchedKey = null;

      for (const key of possibleMasterKeys) {
        const item = await AiCacheModel.getByKey(key);
        if (item && item.payload && !item.payload.insufficientData) {
          cached = item;
          matchedKey = key;
          break;
        }
      }

      if (!cached || !cached.payload || !matchedKey) {
        return { ...emptyProductPayload(timeframe), insufficientData: true, message: "No cached forecast available. Awaiting Cron execution." };
      }

      const payload = cached.payload;
      const supportedDays = TIMEFRAME_DAYS[matchedKey.split(":")[1]] || 30;

      if (requestedDays > supportedDays) {
        return { ...emptyProductPayload(timeframe), insufficientData: true, message: "Insufficient historical data for this forecast horizon." };
      }

      const actualPastHistory = await getRawProductSalesHistory(requestedDays);
      const getPastQty = (name) => {
        const product = actualPastHistory.find(p => p.productName === name);
        return product ? product.dailyQty.reduce((sum, qty) => sum + qty, 0) : 0;
      };

      const projectArray = (arr) => arr.map(item => {
        const pastQty = getPastQty(item.name);
        const trendPct = item.pct || 0;
        const projectedDiff = Math.round(pastQty * (trendPct / 100));
        const projectedForecast = Math.max(0, pastQty + projectedDiff);
        
        return {
          name: item.name,
          pct: trendPct,
          diff: projectedForecast - pastQty, 
          forecast: projectedForecast
        };
      });

      return {
        label: PF_TIMEFRAME_LABELS[timeframe],
        growth: projectArray(payload.growth || []),
        risk: projectArray(payload.risk || []),
        insufficientData: false
      };
    }

    const rawHistory = await getRawProductSalesHistory(65);
    const hasSales = rawHistory.some(p => p.dailyQty.some(q => q > 0));

    const tempSalesHistory = await getRawSalesHistory(65);
    const firstSaleIndex = tempSalesHistory.findIndex(d => (d.totalSales || 0) > 0);
    const actualDaysOfData = firstSaleIndex === -1 ? 0 : tempSalesHistory.length - firstSaleIndex;

    let masterTimeframe = null;
    let historyToUse = 0;

    if (actualDaysOfData >= 60) {
      masterTimeframe = "60d"; historyToUse = 60;
    } else if (actualDaysOfData >= 30) {
      masterTimeframe = "30d"; historyToUse = 30;
    } else if (actualDaysOfData >= 20) {
      masterTimeframe = "7d"; historyToUse = 20;
    }

    if (!masterTimeframe || !hasSales) {
      return { ...emptyProductPayload(timeframe), insufficientData: true };
    }

    const masterCacheKey = buildProductCacheKey(masterTimeframe);

    try {
      const productSalesHistory = await getRawProductSalesHistory(historyToUse);
      const { systemPrompt, userPrompt } = buildProductPrompt(masterTimeframe, productSalesHistory);
      // UPDATED: lowered temperature (0.4 -> 0.1) to reduce sampling
      // randomness and make output more reproducible given the same data.
      const aiResult = await callGeminiJSON({ systemPrompt, userPrompt, temperature: 0.1 });
      const payload = normalizeProductPayload(aiResult, masterTimeframe);

      const finalPayload = { ...payload, insufficientData: false };
      await AiCacheModel.upsert(masterCacheKey, finalPayload, PF_CACHE_TTL_MS);
      return finalPayload;
    } catch (err) {
      console.error("[ProductForecastService] Gemini forecast failed:", err.message);
      return { ...emptyProductPayload(timeframe), insufficientData: true };
    }
  },
};

// ==========================================
// 3. SALES FORECAST SERVICE (TRUE ARIMA TREND)
// ==========================================
const SF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function buildSalesCacheKey(timeframe) {
  return `sales_forecast:${timeframe}`;
}

async function getRawSalesHistory(days) {
  const { startDate, endDate } = getLookbackDateRange(days);

  const orders = await OrdersModel.getByDateRange(startDate, endDate, {
    columns: "grand_total, created_at", // Pinalitan ng created_at
    excludeCancelled: true,
    ascending: true,
  });

  const totalsByDate = {};
  for (const order of orders) {
    const day = order.created_at.slice(0, 10); // Pinalitan ng created_at
    totalsByDate[day] = (totalsByDate[day] || 0) + Number(order.grand_total || 0);
  }

  const todayDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  const todayStr = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}-${String(todayDate.getDate()).padStart(2, '0')}`;

  const allDates = buildDateSequenceSafe(startDate, endDate);
  
  return allDates.map((date) => {
    let sales = totalsByDate[date];
    if (date === todayStr && !sales) return { date, totalSales: null, isToday: true };
    return { date, totalSales: sales || 0, isToday: date === todayStr };
  });
}

// UPDATED: step-by-step deterministic method instructions + explicit
// consistency rule, replacing the old vague "utilizing ARIMA" framing.
function buildSalesPrompt(timeframe, historicalSales) {
  const days = TIMEFRAME_DAYS[timeframe] || 30;
  const todayDate = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });

  const systemPrompt = `You are a sales forecasting assistant for Cakelytics, a small Philippine bakeshop.
Today's date is ${todayDate}.

TASK: Produce a daily sales forecast for the next ${days} days, starting from today.

Follow this method PRECISELY, in order, so your output stays consistent and reproducible given the same input:
1. Compute the simple average of the historical daily totals provided.
2. Compute the average value per day-of-week (Mon-Sun) across the historical data, to capture weekly demand patterns (e.g. weekends may be busier).
3. Determine the trend direction: compare the average of the most recent 7 days of history against the average of the 7 days before that. Classify as rising, flat, or declining, and note the approximate magnitude.
4. For each future day: start from that day's day-of-week average (step 2), then adjust it using the trend from step 3, scaled by how many days ahead that day is (further-out days carry more trend adjustment).
5. If a forecasted date is the 15th or 30th of the month (Filipino payday), apply a modest upward adjustment ONLY IF the historical data actually shows a payday-related spike pattern. Do not invent a spike that isn't supported by the data.
6. Round every value to the nearest whole number. No forecasted value may be negative.

CONSISTENCY RULES (important):
- Do NOT introduce random variation. Same input data must always produce the same reasoning and same output.
- Values must change smoothly day-to-day — no sudden unexplained jumps or drops that aren't explained by the trend or day-of-week pattern.
- You MUST return EXACTLY ${days} entries in "chartData", one per day, starting from today, in order, with no missing days.

Respond with ONLY valid JSON:
{
  "chartData": [
    { "label": "Jan 1", "isToday": true, "forecastSales": number }
  ]
}`;

  const userPrompt = `Timeframe requested: ${timeframe} (${days} days ahead)\nHistorical daily sales data (oldest to newest): ${JSON.stringify(historicalSales)}`;

  return { systemPrompt, userPrompt };
}

// UPDATED: removed the random jitter fallback. When Gemini returns fewer
// days than requested, we now carry forward the last known forecasted
// value instead of injecting random noise.
function normalizeSalesPayload(aiResult, timeframeDays) {
  const rawChartData = Array.isArray(aiResult?.chartData) ? aiResult.chartData : [];
  const todayDate = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));

  const finalChartData = [];
  let lastKnownForecast = rawChartData[0]?.forecastSales != null ? Number(rawChartData[0].forecastSales) : 4500;

  for (let i = 0; i < timeframeDays; i++) {
    const d = new Date(todayDate);
    d.setDate(todayDate.getDate() + i);
    const realLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

    let val;
    if (i < rawChartData.length && rawChartData[i].forecastSales != null) {
      val = Math.max(0, Math.round(Number(rawChartData[i].forecastSales)));
      lastKnownForecast = val;
    } else {
      val = lastKnownForecast;
    }

    finalChartData.push({
      label: realLabel,
      isToday: i === 0,
      forecastSales: val,
    });
  }

  return { chartData: finalChartData };
}

const SalesForecastService = {
  async getSalesTrendsByTimeframe(timeframe = "30d", forceRefresh = false) {
    if (typeof timeframe === 'boolean') {
      forceRefresh = timeframe;
      timeframe = '30d';
    }

    const requestedDays = TIMEFRAME_DAYS[timeframe] || 30;

    if (!forceRefresh) {
      const possibleMasterKeys = ["sales_forecast:60d", "sales_forecast:30d", "sales_forecast:7d"];
      let cached = null;
      let matchedKey = null; 

      for (const key of possibleMasterKeys) {
        const item = await AiCacheModel.getByKey(key);
        if (item && item.payload && !item.payload.insufficientData) {
          cached = item;
          matchedKey = key;
          break;
        }
      }

      if (!cached || !cached.payload || !matchedKey) {
        return { chartData: [], insufficientData: true, message: "No cached forecast available. Awaiting Cron execution." };
      }

      const supportedDays = TIMEFRAME_DAYS[matchedKey.split(":")[1]] || 30;
      
      if (requestedDays > supportedDays) {
        return { chartData: [], insufficientData: true, message: "Insufficient historical data for this forecast horizon." };
      }

      const slicedChartData = (cached.payload.chartData || []).slice(0, requestedDays);
      return { chartData: slicedChartData, insufficientData: false };
    }

    const tempHistory = await getRawSalesHistory(65);
    const firstSaleIndex = tempHistory.findIndex(d => (d.totalSales || 0) > 0);
    const actualDaysOfData = firstSaleIndex === -1 ? 0 : tempHistory.length - firstSaleIndex;

    let masterTimeframe = null;
    let historyToUse = 0;

    if (actualDaysOfData >= 60) {
      masterTimeframe = "60d"; historyToUse = 60;
    } else if (actualDaysOfData >= 30) {
      masterTimeframe = "30d"; historyToUse = 30;
    } else if (actualDaysOfData >= 20) {
      masterTimeframe = "7d"; historyToUse = 20; 
    }

    if (!masterTimeframe) {
      return { chartData: [], insufficientData: true, message: "Insufficient historical data for this forecast." };
    }

    const masterCacheKey = buildSalesCacheKey(masterTimeframe);
    const supportedDays = TIMEFRAME_DAYS[masterTimeframe] || 30; 

    try {
      const historicalSales = await getRawSalesHistory(historyToUse);
      const { systemPrompt, userPrompt } = buildSalesPrompt(masterTimeframe, historicalSales);
      
      // UPDATED: lowered temperature (0.4 -> 0.1) to reduce sampling
      // randomness and make output more reproducible given the same data.
      const aiResult = await callGeminiJSON({ systemPrompt, userPrompt, temperature: 0.1 });
      const payload = normalizeSalesPayload(aiResult, supportedDays);

      const finalPayload = { ...payload, insufficientData: false };
      await AiCacheModel.upsert(masterCacheKey, finalPayload, SF_CACHE_TTL_MS);
      return finalPayload;
    } catch (err) {
      console.error("[SalesForecastService] Gemini forecast failed:", err.message);
      return { chartData: [], insufficientData: true };
    }
  },
};

// ==========================================
// 4. PERFORMANCE SUMMARY SERVICE (AI-GENERATED TEXT SUMMARY)
// ==========================================
const PS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PS_MASTER_CACHE_KEY = "performance_summary_master";
const PS_PERIOD_DAYS = 7;
const PS_TOP_PRODUCTS_COUNT = 3;

function sumSalesAndExpenses(orders, inventoryLogs) {
  const totalSales = (orders || []).reduce((sum, order) => sum + Number(order.grand_total || 0), 0);
  const totalExpenses = (inventoryLogs || []).reduce((sum, log) => {
    if (log.transaction_type === 'IN') return sum + Number(log.cost || 0);
    return sum;
  }, 0);

  const grossProfit = totalSales - totalExpenses;
  const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  return { totalSales, totalExpenses, grossProfit, profitMargin };
}

async function getTopProductsForRange(startDate, endDate, limit = PS_TOP_PRODUCTS_COUNT) {
  const items = await OrderItemsModel.getByOrderDateRange(startDate, endDate, {
    columns: "product_name, quantity, orders!inner(created_at, status)",
    excludeCancelled: true,
  });

  const productMap = {};
  (items || []).forEach((item) => {
    productMap[item.product_name] = (productMap[item.product_name] || 0) + Number(item.quantity || 0);
  });

  return Object.keys(productMap)
    .map((name) => ({ name, qty: productMap[name] }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

async function getSummaryContext() {
  const { startDate: currentStart, endDate: currentEnd } = getLookbackDateRange(PS_PERIOD_DAYS);
  const { startDate: priorStart } = getLookbackDateRange(PS_PERIOD_DAYS * 2);
  const priorEnd = currentStart;

  const [currentOrders, currentInventoryLogs, priorOrders, priorInventoryLogs, topProducts] = await Promise.all([
    OrdersModel.getByDateRange(currentStart, currentEnd, { columns: "grand_total, created_at", excludeCancelled: true }),
    InventoryLogsModel.getByDateRange(currentStart, currentEnd),
    OrdersModel.getByDateRange(priorStart, priorEnd, { columns: "grand_total, created_at", excludeCancelled: true }),
    InventoryLogsModel.getByDateRange(priorStart, priorEnd),
    getTopProductsForRange(currentStart, currentEnd),
  ]);

  const currentMetrics = sumSalesAndExpenses(currentOrders, currentInventoryLogs);
  const priorMetrics = sumSalesAndExpenses(priorOrders, priorInventoryLogs);

  // Updated: Inalis na ang computation ng "deltas" kineme, para natural ang comparison ng AI
  return {
    periodInfo: "Comparing the current 7-day period (the last 7 days including today) against the prior 7-day period (the 7 days before that).",
    current: currentMetrics,
    prior: priorMetrics,
    topProducts,
  };
}

function buildSummaryPrompt(context) {
  const systemPrompt = `You are a meticulous business report analyst for Cakelytics, a bake shop point-of-sale analytics system.
You are given ALREADY-COMPUTED figures comparing the business's current 7-day performance (the last 7 days including today) against the prior 7-day period (the 7 days before that).

CRITICAL RULES:
1. Write a 2 to 3 sentence executive summary in humanized, conversational Taglish describing the performance.
2. Explicitly compare the current 7 days against the previous 7 days. State clearly if the performance improved or declined based on the provided current vs prior metrics. (e.g. "Tumaas ang ating benta mula ₱4,000 noong nakaraang linggo tungong ₱5,000 ngayon...").
3. Incorporate the computed Total Sales, Gross Profit, and Total Expenses. Format currency correctly (e.g. ₱5,000). You do not need to list exact percentage formulas unless it makes the narrative sound natural, but focus on comparing the real monetary values.
4. HIGHLIGHT key figures by wrapping them in double asterisks so they become bold (e.g. **₱5,000**).
5. Do NOT alter any numeric value.
6. Preserve the exact topProducts array in the JSON response.

Respond with ONLY valid JSON strictly following this exact shape:
{
  "summaryText": "...",
  "topProducts": [{ "name": "...", "qty": number }]
}`;

  const userPrompt = `Computed business performance context, current 7-day period vs prior 7-day period (JSON): ${JSON.stringify(context)}`;

  return { systemPrompt, userPrompt };
}

function normalizeSummaryPayload(aiResult, context) {
  const topProducts = Array.isArray(aiResult?.topProducts) && aiResult.topProducts.length
    ? aiResult.topProducts.map((p) => ({
        name: String(p.name ?? ""),
        qty: Math.max(0, Math.round(Number(p.qty ?? 0))),
      }))
    : context.topProducts;

  return {
    summaryText: String(aiResult?.summaryText ?? ""),
    topProducts,
  };
}

function emptySummaryPayload() {
  return {
    summaryText: "",
    topProducts: [],
  };
}

const PerformanceSummaryService = {
  async getPerformanceSummary(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await AiCacheModel.getByKey(PS_MASTER_CACHE_KEY);
      if (cached && cached.payload) {
        return cached.payload;
      }
      return { ...emptySummaryPayload(), insufficientData: true, message: "No cached summary available. Awaiting Cron execution." };
    }

    try {
      const context = await getSummaryContext();
      const { systemPrompt, userPrompt } = buildSummaryPrompt(context);
      const aiResult = await callGeminiJSON({ systemPrompt, userPrompt });
      const payload = normalizeSummaryPayload(aiResult, context);

      await AiCacheModel.upsert(PS_MASTER_CACHE_KEY, payload, PS_CACHE_TTL_MS);
      return { ...payload, insufficientData: false };
    } catch (err) {
      console.error("[PerformanceSummaryService] Gemini summary failed:", err.message);
      return { ...emptySummaryPayload(), insufficientData: true };
    }
  },
};

export {
  ActionableRecommendationService,
  ProductForecastService,
  SalesForecastService,
  PerformanceSummaryService
};