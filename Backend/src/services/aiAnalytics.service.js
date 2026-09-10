import { OrdersModel } from "../model/orders.model.js";
import { OrderItemsModel } from "../model/orderItems.model.js";
import { InventoryLogModel as InventoryLogsModel } from "../model/inventoryLog.model.js";
import { WasteLogsModel } from "../model/wasteLogs.model.js";
import { AiCacheModel } from "../model/AiCache.model.js";
import { RecipeModel } from "../model/recipe.model.js";

import { callGeminiJSON } from "../utils/analytics/geminiForecast.util.js";
import { getLookbackDateRange } from "../utils/analytics/ForecastTimeframe.utils.js";

const TIMEFRAME_DAYS = { "7d": 7, "30d": 30 };

// ==========================================
// SHARED: PRE-GEMINI DATA SUFFICIENCY GATE
// ==========================================
// Applies to Actionable Recommendations, Product Forecast, and Sales
// Forecast only (NOT the Performance Summary — that runs daily on its
// own 7-day comparison logic regardless of long-term history).
//
// Rule: before any of those three services calls Gemini or writes to
// the AI cache, the database must actually contain sales history going
// back at least this many calendar days from "now" — not just this
// many days' worth of transactions, but real elapsed days.
//   - "7d" forecasts require at least 60 days (2 months) of history.
//   - "30d" forecasts require at least 180 days (6 months) of history.
// If the requirement isn't met, the caller must skip Gemini entirely,
// skip the cache write entirely, and effectively no-op the cron run.
const REQUIRED_HISTORY_DAYS = { "7d": 60, "30d": 180 };

async function hasSufficientHistory(requiredDays) {
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - requiredDays);

  // "Since forever" lower bound — we just need to know whether AT LEAST
  // ONE order exists on or before the cutoff date, which proves the
  // business has real sales data going back that far.
  const sinceForever = new Date(0).toISOString();

  const priorOrders = await OrdersModel.getByDateRange(sinceForever, cutoff.toISOString(), {
    columns: "created_at",
    excludeCancelled: true,
  });

  return Array.isArray(priorOrders) && priorOrders.length > 0;
}

async function checkForecastDataSufficiency(timeframe) {
  const requiredDays = REQUIRED_HISTORY_DAYS[timeframe] || REQUIRED_HISTORY_DAYS["30d"];
  const label = timeframe === "7d" ? "7-day" : "30-day";
  const sufficient = await hasSufficientHistory(requiredDays);

  return {
    sufficient,
    requiredDays,
    message: sufficient
      ? null
      : `Not enough historical data yet — a ${label} forecast requires at least ${requiredDays} days of past sales data.`,
  };
}

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
// 1. ACTIONABLE RECOMMENDATIONS SERVICE (PER-TIMEFRAME CACHE)
// ==========================================
const AR_CACHE_TTL_MS = 24 * 60 * 60 * 1000; 
const AR_VALID_TYPES = ["success", "warning", "danger", "info", "neutral"];
const AR_TIMEFRAMES = ["7d", "30d"];

function buildActionableCacheKey(timeframe) {
  return `actionable_recommendations_v4:${timeframe}`;
}

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

// The actionable recommendations are a downstream consumer of the Sales
// Forecast and Product Forecast services — they must NOT be generated
// from a stale/fallback forecast or when no forecast exists yet. This
// reads the actual forecast caches for this exact timeframe and only
// reports "ready" when BOTH forecasts successfully completed
// (insufficientData === false). No fallback to a different timeframe's
// cache, and no silent proceeding with an empty forecast.
async function getForecastDependency(timeframe) {
  const salesCacheKey = `sales_forecast:${timeframe}`;
  const productCacheKey = `product_forecast:${timeframe}`;

  const [salesCached, productCached] = await Promise.all([
    AiCacheModel.getByKey(salesCacheKey),
    AiCacheModel.getByKey(productCacheKey),
  ]);

  const salesPayload = salesCached?.payload;
  const productPayload = productCached?.payload;

  const salesReady = !!(salesPayload && salesPayload.insufficientData === false && salesPayload.chartData?.length);
  const productReady = !!(productPayload && productPayload.insufficientData === false);

  return {
    ready: salesReady && productReady,
    salesForecastSnippet: salesReady ? salesPayload.chartData.slice(0, 14) : [],
    productForecast: productReady
      ? { growth: productPayload.growth || [], risk: productPayload.risk || [] }
      : { growth: [], risk: [] },
  };
}

async function getSalesGrowthContext(days, forecastSnippet) {
  const [recentSalesTrend, growthAndRisk] = await Promise.all([
    getRecentSalesTrend(days),
    getProductGrowthAndRisk(days),
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

// Pulls the last cached recommendation titles (if any) so the prompt can
// steer Gemini away from repeating the exact same advice on the next
// refresh. This does not block generation if nothing is cached yet.
async function getPreviousRecommendationTitles(cacheKey) {
  const cached = await AiCacheModel.getByKey(cacheKey);
  const payload = cached?.payload;
  if (!payload) return [];

  const titles = [
    ...(payload.salesOptimization || []),
    ...(payload.wasteReduction || []),
    ...(payload.bundlePromotions || []),
  ].map((r) => r?.title).filter(Boolean);

  return titles;
}

async function getRecommendationContext(timeframe, ingredientToProducts, forecastDependency) {
  const days = TIMEFRAME_DAYS[timeframe];
  const [salesGrowthContext, expiryContext, bundleContext] = await Promise.all([
    getSalesGrowthContext(days, forecastDependency.salesForecastSnippet),
    getExpiryAdvisoryContext(days, ingredientToProducts),
    getBundleOpportunityContext(days),
  ]);
  return {
    salesGrowthContext,
    expiryContext,
    bundleContext,
    productForecast: forecastDependency.productForecast,
  };
}

function buildActionablePrompt(timeframe, context, previousTitles = []) {
  const todayDate = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });
  const days = TIMEFRAME_DAYS[timeframe];
  const horizonLabel = timeframe === "7d" ? "next 7 days" : "next 30 days";

  const avoidRepeatBlock = previousTitles.length
    ? `\nAVOID REPEATING YOURSELF: here are the recommendation titles you gave last time for this exact window: ${JSON.stringify(previousTitles)}. The underlying data may look similar again, but do not reuse these titles or restate them with only minor wording changes. Find a different specific angle in the current data (a different product, a different number, a different combination) — if the data genuinely supports the same core idea, at least ground it in a new specific detail so it doesn't read as a copy-paste.\n`
    : "";

  const systemPrompt = `You are a Decision Support System (DSS) advisor for Cakelytics, analyzing "Aileen and Cake Max," a local cake and bake shop in the Philippines. Today's date is ${todayDate}.

The context below (sales trend, near-expiring items, slow/best sellers) was all queried over the SAME ${days}-day window (the ${horizonLabel}).

BUSINESS CONSTRAINTS (these are real operational facts, not style preferences — never violate them):
- Pick-up only. No delivery, no third-party logistics (Grab/Foodpanda). Strategies work through walk-ins, advance pre-orders for pick-up, and on-site upselling.
- No dine-in / hospitality angle — this is a retail cake shop, not a café.
- Stay within the bakery/celebration product line (cakes, pastries, celebration add-ons like candles/tarpaulins). Don't suggest unrelated items (drinks, meals) or generic promos that don't fit a bakeshop (e.g. "back to school").
- Every recommendation must be internally consistent: if a seasonal or weather factor reduces walk-in traffic, don't still push an immediate walk-in campaign — shift to pre-order/flexible pick-up mechanics instead.
- Ground every recommendation in the actual numbers, product names, and items present in the context — never invent data.
${avoidRepeatBlock}
Produce THREE categories, each doing a distinct analytical job — don't blend them or duplicate the same insight across categories. Give 2-4 recommendations per category.

1. "salesOptimization" (Sales Growth Strategy) — read salesGrowthContext (recentSalesTrend, topGrowthProducts/topRiskProducts are PAST performance; forecastSnippet is the FORWARD-LOOKING sales forecast for this window). Also read productForecast.growth / productForecast.risk — the forward-looking, per-product trend forecast for this same window — and use it to say what's *expected* to happen, not just what already happened. Factor in the current PH season (summer / habagat-typhoon / 'Ber' months-Christmas) based on today's date, and Filipino payday timing (15th/30th), when it's actually relevant to the data. If sales are flat or declining (past or forecasted), say so plainly and give real mitigation strategies rather than dressing it up as a peak season.

2. "wasteReduction" (Expiry Advisory) — read expiryContext.nearExpiringItems (each with a possibleProducts match when a recipe link exists). For items with a possibleProducts match, recommend pushing that product with a reasoned discount and expected return vs. a full write-off. If nearExpiringItems is empty, base this instead on expiryContext.inventoryActivitySummary and recentWaste — e.g. restock frequency/quantity adjustments or FIFO improvements for high-waste items.

3. "bundlePromotions" (Bundle Opportunities) — pair a specific slow mover from bundleContext.slowMovers with a specific best seller from bundleContext.bestSellers, with a concrete promo mechanic (bundle discount, add-on pricing, small freebie) and why the pairing fits a bakery/celebration business. Prioritize slow movers that also appear in productForecast.risk (forecasted to keep declining) — bundling is more urgent for those than for a slow mover with no forecasted decline.

LANGUAGE & TONE: Write in clear, simple, friendly English — like an experienced business consultant talking directly to the shop owner. Keep sentences easy to read and avoid technical jargon. Vary your phrasing and sentence openers between recommendations; avoid falling into the same boilerplate structure for every item.

Respond with ONLY valid JSON strictly following this exact shape:
{
  "salesOptimization": [ { "title": "...", "desc": "...", "type": "success" | "warning" | "danger" | "info" | "neutral" } ],
  "wasteReduction": [ { "title": "...", "desc": "...", "type": "..." } ],
  "bundlePromotions": [ { "title": "...", "desc": "...", "type": "..." } ]
}`;

  const userPrompt = `Business context for the ${horizonLabel} window (JSON): ${JSON.stringify(context)}`;
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

  return {
    salesOptimization: normalizeArray(aiResult?.salesOptimization),
    wasteReduction: normalizeArray(aiResult?.wasteReduction),
    bundlePromotions: normalizeArray(aiResult?.bundlePromotions),
  };
}

function emptyActionablePayload() {
  return { salesOptimization: [], wasteReduction: [], bundlePromotions: [] };
}

const ActionableRecommendationService = {
  async getActionableRecommendations(timeframe = "30d", forceRefresh = false) {
    if (typeof timeframe === 'boolean') {
      forceRefresh = timeframe;
      timeframe = '30d';
    }

    const validTimeframe = AR_TIMEFRAMES.includes(timeframe) ? timeframe : "30d";
    const cacheKey = buildActionableCacheKey(validTimeframe);

    if (!forceRefresh) {
      const cached = await AiCacheModel.getByKey(cacheKey);
      if (cached && cached.payload) {
        return { recommendations: cached.payload, insufficientData: false };
      }
      return {
        recommendations: emptyActionablePayload(),
        insufficientData: true,
        message: "No cached recommendations available. Awaiting Cron execution.",
      };
    }

    // GATE 1: skip Gemini entirely and skip the cache write entirely when
    // the DB doesn't have enough calendar-day history for this timeframe.
    const { sufficient, message } = await checkForecastDataSufficiency(validTimeframe);
    if (!sufficient) {
      return { recommendations: emptyActionablePayload(), insufficientData: true, message };
    }

    // GATE 2: recommendations are a downstream consumer of the Sales
    // Forecast AND Product Forecast for this same timeframe. If either
    // one hasn't successfully run yet (no cache, or cached as
    // insufficientData), there is no forecasted data to reason over —
    // so recommendations must no-op too, not fall back to past-data-only.
    const forecastDependency = await getForecastDependency(validTimeframe);
    if (!forecastDependency.ready) {
      return {
        recommendations: emptyActionablePayload(),
        insufficientData: true,
        message: "Waiting for the sales and product forecast to finish generating for this timeframe before recommendations can be produced.",
      };
    }

    try {
      const [ingredientToProducts, previousTitles] = await Promise.all([
        buildIngredientToProductsMap(),
        getPreviousRecommendationTitles(cacheKey),
      ]);
      const context = await getRecommendationContext(validTimeframe, ingredientToProducts, forecastDependency);
      const { systemPrompt, userPrompt } = buildActionablePrompt(validTimeframe, context, previousTitles);
      // Slightly higher than default: this call generates business advice,
      // not a deterministic forecast, so some creative variance between
      // refreshes is desirable (paired with the anti-repeat instruction
      // above, which keeps it from just being noise).
      const aiResult = await callGeminiJSON({ systemPrompt, userPrompt, temperature: 0.7 });
      const payload = normalizeActionablePayload(aiResult);

      await AiCacheModel.upsert(cacheKey, payload, AR_CACHE_TTL_MS);
      return { recommendations: payload, insufficientData: false };
    } catch (err) {
      console.error("[ActionableRecommendationService] Gemini recommendation failed:", err.message);
      return { recommendations: emptyActionablePayload(), insufficientData: true };
    }
  },
};

// ==========================================
// 2. PRODUCT FORECAST SERVICE (PER-TIMEFRAME, GATED BY HISTORY)
// ==========================================
const PF_CACHE_TTL_MS = 24 * 60 * 60 * 1000; 
const PF_TIMEFRAME_LABELS = { "7d": "Next 7 Days", "30d": "Next 30 Days" };

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

    const validTimeframe = TIMEFRAME_DAYS[timeframe] ? timeframe : "30d";
    const cacheKey = buildProductCacheKey(validTimeframe);

    if (!forceRefresh) {
      const cached = await AiCacheModel.getByKey(cacheKey);
      if (cached && cached.payload && !cached.payload.insufficientData) {
        return { ...cached.payload, insufficientData: false };
      }
      return {
        ...emptyProductPayload(validTimeframe),
        insufficientData: true,
        message: "No cached forecast available. Awaiting Cron execution.",
      };
    }

    // GATE: skip Gemini entirely and skip the cache write entirely when
    // the DB doesn't have enough calendar-day history for this timeframe.
    const { sufficient, requiredDays, message } = await checkForecastDataSufficiency(validTimeframe);
    if (!sufficient) {
      return { ...emptyProductPayload(validTimeframe), insufficientData: true, message };
    }

    const productSalesHistory = await getRawProductSalesHistory(requiredDays);
    const hasSales = productSalesHistory.some(p => p.dailyQty.some(q => q > 0));

    if (!hasSales) {
      return { ...emptyProductPayload(validTimeframe), insufficientData: true, message: "No product sales activity found in the historical window." };
    }

    try {
      const { systemPrompt, userPrompt } = buildProductPrompt(validTimeframe, productSalesHistory);
      // UPDATED: lowered temperature (0.4 -> 0.1) to reduce sampling
      // randomness and make output more reproducible given the same data.
      const aiResult = await callGeminiJSON({ systemPrompt, userPrompt, temperature: 0.1 });
      const payload = normalizeProductPayload(aiResult, validTimeframe);

      const finalPayload = { ...payload, insufficientData: false };
      await AiCacheModel.upsert(cacheKey, finalPayload, PF_CACHE_TTL_MS);
      return finalPayload;
    } catch (err) {
      console.error("[ProductForecastService] Gemini forecast failed:", err.message);
      return { ...emptyProductPayload(validTimeframe), insufficientData: true };
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
    columns: "grand_total, created_at", // Now using created_at
    excludeCancelled: true,
    ascending: true,
  });

  const totalsByDate = {};
  for (const order of orders) {
    const day = order.created_at.slice(0, 10); // Now using created_at
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

    const validTimeframe = TIMEFRAME_DAYS[timeframe] ? timeframe : "30d";
    const cacheKey = buildSalesCacheKey(validTimeframe);
    const requestedDays = TIMEFRAME_DAYS[validTimeframe];

    if (!forceRefresh) {
      const cached = await AiCacheModel.getByKey(cacheKey);
      if (cached && cached.payload && !cached.payload.insufficientData && cached.payload.chartData?.length) {
        return { chartData: cached.payload.chartData, insufficientData: false };
      }
      return {
        chartData: [],
        insufficientData: true,
        message: "No cached forecast available. Awaiting Cron execution.",
      };
    }

    // GATE: skip Gemini entirely and skip the cache write entirely when
    // the DB doesn't have enough calendar-day history for this timeframe.
    const { sufficient, requiredDays, message } = await checkForecastDataSufficiency(validTimeframe);
    if (!sufficient) {
      return { chartData: [], insufficientData: true, message };
    }

    try {
      const historicalSales = await getRawSalesHistory(requiredDays);
      const { systemPrompt, userPrompt } = buildSalesPrompt(validTimeframe, historicalSales);

      // UPDATED: lowered temperature (0.4 -> 0.1) to reduce sampling
      // randomness and make output more reproducible given the same data.
      const aiResult = await callGeminiJSON({ systemPrompt, userPrompt, temperature: 0.1 });
      const payload = normalizeSalesPayload(aiResult, requestedDays);

      const finalPayload = { ...payload, insufficientData: false };
      await AiCacheModel.upsert(cacheKey, finalPayload, SF_CACHE_TTL_MS);
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

  // Updated: Removed the old "deltas" calculation so the AI comparison reads more naturally
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
1. Write a 2 to 3 sentence executive summary in clear, simple, friendly English describing the performance.
2. Explicitly compare the current 7 days against the previous 7 days. State clearly if the performance improved or declined based on the provided current vs prior metrics. (e.g. "Sales went up from ₱4,000 last week to ₱5,000 this week...").
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