import { OrdersModel } from "../model/orders.model.js";
import { OrderItemsModel } from "../model/orderItems.model.js";
import { InventoryLogModel as InventoryLogsModel } from "../model/inventoryLog.model.js";
import { WasteLogsModel } from "../model/wasteLogs.model.js";
import { AiCacheModel } from "../model/AiCache.model.js";
import { RecipeModel } from "../model/recipe.model.js";

import { callGeminiJSON } from "../utils/analytics/geminiForecast.util.js";
import { getLookbackDateRange } from "../utils/analytics/ForecastTimeframe.utils.js";
import { getDateRange } from "../utils/analytics/PerformancetTimeframeHelper.utils.js";

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
//   - "7d" forecasts require at least 30 days (~1 month) of history.
//   - "30d" forecasts require at least 60 days (~2 months) of history.
// If the requirement isn't met, the caller skips Gemini and caches the
// existing insufficient-data payload.
const REQUIRED_HISTORY_DAYS = { "7d": 30, "30d": 60 };

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

const MANILA_TZ = "Asia/Manila";
const manilaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const PRODUCT_RECENT_UNITS_WINDOW_DAYS = { "7d": 14, "30d": 30 };

// Sales: ilang araw na may benta ang kailangan sa loob ng history window
// bago mag-forecast (hindi lang "may isang order noon").
const SALES_MIN_ACTIVE_DAYS = { "7d": 15, "30d": 30 };

// Product: bawat produkto ay dumadaan sa sarili niyang eligibility check.
// Hindi isinasama sa forecast ang produktong bago, kaunti ang benta, o
// kalat-kalat — dahil ingay lang ang lalabas na "+200%" mula sa 1→3 units.
const PRODUCT_FORECAST_RULES = {
  // Pinaluwag para sa maliit na volume: bawat produkto ay may sariling series
  // kaya manipis ang data. Ang natitirang rule na lang ay "may konting
  // history at may konting benta kamakailan".
  "7d": {
    minDaysSinceFirstSale: 14,
    minActiveDays: 2,
    minUnitsRecent: 3,        // units sa configured recent-units window
    minAbsChange: 2,          // units — pinakamaliit na diff na papasok sa GROWTH list
    minPctChange: 10,         // % — pinakamaliit na pagtaas para maging "fast moving" (7d)
    // FIX: dati ay riskPctCeiling = +5, kaya kahit TUMATAAS na produkto
    // (hal. +4%) ay napupunta sa "At Risk" at lumalabas pa sa growth at risk
    // nang sabay. Ngayon: at-risk lang ang produktong ang forecast ay BUMABABA
    // nang hindi bababa sa 10% (7d) / 5% (30d) kumpara sa aktwal na huling
    // window. Mas mataas ang 7d dahil ±15-20% ang natural na ingay ng benta
    // sa loob lang ng isang linggo; mas mababa ang galaw doon ay hindi galaw.
    riskPctCeiling: -10,
  },
  "30d": {
    minDaysSinceFirstSale: 14,
    minActiveDays: 2,
    minUnitsRecent: 3,
    minAbsChange: 2,
    minPctChange: 5,
    riskPctCeiling: -5,
  },
};
const PRODUCT_LIST_MAX = 5;

// ---------- Date helpers (lahat ay nasa Manila calendar day) ----------
// Dati: created_at.slice(0, 10) — UTC date 'yun, kaya ang order na pumasok
// bago mag-8:00 AM Manila ay napupunta sa NAKARAANG araw at nagugulo ang
// weekday pattern. Ngayon: ang petsa ay laging kinukuha sa Asia/Manila.
function toManilaDateKey(input) {
  return manilaDateFormatter.format(new Date(input));
}

function addDaysToKey(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatForecastLabel(key) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function buildFutureDateKeys(todayKey, count) {
  return Array.from({ length: count }, (_, i) => addDaysToKey(todayKey, i));
}

const sumOf = (arr) => arr.reduce((a, b) => a + b, 0);

// ==========================================
// 1. ACTIONABLE RECOMMENDATIONS SERVICE (FORECAST-DRIVEN, TIMEFRAME-INDEPENDENT)
// ==========================================
// Recommendations are no longer split into a per-timeframe route/cache.
// There is ONE recommendation set, generated by cross-referencing
// whichever forecast horizon(s) are actually ready (7-day and/or
// 30-day) against the matching historical lookback:
//   - 90 days of history when the 30-day horizon is ready.
//   - 60 days of history when only the 7-day horizon is ready.
// If NEITHER horizon has a ready forecast (sales AND product forecast,
// on both sides), recommendations do not run at all — there is nothing
// forward-looking to reason over yet, so we no-op rather than fall back
// to a past-data-only guess.
const AR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const AR_VALID_TYPES = ["success", "warning", "danger", "info", "neutral"];
const AR_CACHE_KEY = "actionable_recommendations_v5";
const AR_MAX_PER_CATEGORY = 2;

// FIX: amount_paid (aktwal na natanggap na bayad), hindi grand_total —
// parehong basehan na ngayon ng FourKpiService/PerformanceSummaryService,
// para consistent ang "Sales" figure sa buong dashboard (KPI, Summary,
// AT Forecast/Recommendations).
async function getRecentSalesTrend(days) {
  const { startDate, endDate } = getLookbackDateRange(days);

  const orders = await OrdersModel.getByDateRange(startDate, endDate, {
    columns: "amount_paid, created_at",
    excludeCancelled: true,
    ascending: true,
  });

  const totalsByDate = {};
  for (const order of orders) {
    const day = order.created_at.slice(0, 10);
    totalsByDate[day] = (totalsByDate[day] || 0) + Number(order.amount_paid || 0);
  }

  return Object.keys(totalsByDate)
    .sort()
    .map((date) => ({ date, totalSales: totalsByDate[date] }));
}

// FIX 1: group by product_id (fallback sa normalized name kung walang id)
// imbes na raw product_name text — iniiwasan ang pagkakahati ng parehong
// produkto sa dalawang hiwalay na row dahil sa typo/spelling/category
// inconsistency (hal. "Cupcake" vs "Cupcakes").
// FIX 2: "at risk" dati ay literal na diff < 0 lang — bihira/halos hindi
// mangyari 'yon kung patuloy na lumalaki ang kabuuang volume. Loosened:
// kasama na rin ang mga stagnant/underperforming na produkto (pct <=
// HISTORICAL_RISK_PCT_CEILING), hindi lang literal na pagbaba. Kailangan
// munang may baseline (priorQty > 0) bago ma-flag bilang risk — kung
// walang laman ang prior period, bagong produkto lang 'yan, hindi pa
// dapat ituring na "risk" (walang dati na pwedeng ikumpara).
const HISTORICAL_RISK_PCT_CEILING = 5;

async function getProductGrowthAndRisk(days) {
  const { startDate: recentStart, endDate: recentEnd } = getLookbackDateRange(days);
  const { startDate: priorStart } = getLookbackDateRange(days * 2);
  const priorEnd = recentStart;

  const columns = "product_id, product_name, quantity, orders!inner(created_at, status)";

  const [recentItems, priorItems] = await Promise.all([
    OrderItemsModel.getByOrderDateRange(recentStart, recentEnd, { columns }),
    OrderItemsModel.getByOrderDateRange(priorStart, priorEnd, { columns }),
  ]);

  const groupKey = (item) =>
    item.product_id || `name:${String(item.product_name || "").trim().toLowerCase()}`;

  const sumByProduct = (items) => {
    const totals = {};
    for (const item of items) {
      const key = groupKey(item);
      if (!totals[key]) totals[key] = { name: item.product_name, qty: 0 };
      totals[key].qty += Number(item.quantity || 0);
    }
    return totals;
  };

  const recentTotals = sumByProduct(recentItems);
  const priorTotals = sumByProduct(priorItems);
  const productKeys = new Set([...Object.keys(recentTotals), ...Object.keys(priorTotals)]);

  const changes = [...productKeys].map((key) => {
    const recentQty = recentTotals[key]?.qty || 0;
    const priorQty = priorTotals[key]?.qty || 0;
    const name = recentTotals[key]?.name || priorTotals[key]?.name;
    const diff = recentQty - priorQty;
    const pct = priorQty === 0 ? (recentQty > 0 ? 100 : 0) : Math.round((diff / priorQty) * 100);
    return { name, recentQty, priorQty, diff, pct };
  });

  const topGrowthProducts = changes
    .filter((c) => c.diff > 0)
    .sort((a, b) => b.diff - a.diff)
    .slice(0, 5);

  const topRiskProducts = changes
    // kailangan may baseline muna (priorQty > 0) bago ma-flag bilang risk
    .filter((c) => c.priorQty > 0 && (c.diff < 0 || c.pct <= HISTORICAL_RISK_PCT_CEILING))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 5);

  return { topGrowthProducts, topRiskProducts };
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

// FALLBACK for Inventory Optimization when there are no near-expiring
// items to react to. Derived purely from existing inventory movement
// logs (IN vs OUT vs WASTE, already summarized as inventoryActivitySummary
// by getExpiryAdvisoryContext) — no new model method needed. Flags items
// trending toward a stockout (heavy usage, little restock => negative net
// movement) and items sitting overstocked (heavy restock, little usage,
// not yet wasted).
function getStockLevelContext(inventoryActivitySummary) {
  const entries = Object.entries(inventoryActivitySummary || {});

  const stockSignals = entries.map(([itemName, activity]) => {
    const netMovement = activity.in_restock - activity.out_used - activity.waste;
    return {
      itemName,
      inRestock: activity.in_restock,
      outUsed: activity.out_used,
      waste: activity.waste,
      netMovement,
    };
  });

  const understockRisk = stockSignals
    .filter((s) => s.outUsed > 0 && s.netMovement < 0)
    .sort((a, b) => a.netMovement - b.netMovement)
    .slice(0, 5);

  const overstockRisk = stockSignals
    .filter((s) => s.inRestock > 0 && s.netMovement > 0 && s.outUsed < s.inRestock * 0.3)
    .sort((a, b) => b.netMovement - a.netMovement)
    .slice(0, 5);

  return { understockRisk, overstockRisk };
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
    ...(payload.inventoryOptimization || []),
  ].map((r) => r?.title).filter(Boolean);

  return titles;
}

// Reads the current sales-forecast and product-forecast caches for BOTH
// horizons and reports, per horizon, whether it's actually usable — a
// horizon only counts as "ready" when BOTH its sales forecast AND its
// product forecast completed successfully (insufficientData === false).
// A half-ready horizon (e.g. sales forecast ready but product forecast
// still insufficient) is treated as not ready. Recommendations use
// whichever horizon(s) ARE ready; if neither is ready, the caller must
// no-op entirely instead of silently falling back to past data only.
async function getForecastAvailability() {
  // Route sales data through the SAME precedence/derivation logic the
  // dashboard reads use (getSalesForecastRead) instead of reading the
  // raw sales_forecast:7d cache key directly. That raw 7d key is
  // deliberately left untouched by refreshSalesForecast() whenever the
  // 30d horizon is authoritative (see the note there) — so a direct
  // read of it can silently return a stale snapshot from a much earlier
  // run, even though it still "looks ready" (insufficientData === false,
  // has chartData). Going through getSalesForecastRead guarantees this
  // reasons over EXACTLY the same sales numbers the dashboard shows —
  // never a stale leftover sitting under a different key.
  const [sales30, sales7, productCombinedCached] = await Promise.all([
    getSalesForecastRead("30d"),
    getSalesForecastRead("7d"),
    AiCacheModel.getByKey(PRODUCT_COMBINED_CACHE_KEY),
  ]);

  const productSeven = productCombinedCached?.payload?.sevenDay;
  const productThirty = productCombinedCached?.payload?.thirtyDay;

  const sales30Ready = !!(sales30 && sales30.insufficientData === false && sales30.chartData?.length);
  const sales7Ready = !!(sales7 && sales7.insufficientData === false && sales7.chartData?.length);
  const product7Ready = !!(productSeven && productSeven.insufficientData === false);
  const product30Ready = !!(productThirty && productThirty.insufficientData === false);

  const horizon7Ready = sales7Ready && product7Ready;
  const horizon30Ready = sales30Ready && product30Ready;

  return {
    anyReady: horizon7Ready || horizon30Ready,
    horizon7Ready,
    horizon30Ready,
    sevenDay: horizon7Ready
      ? {
          salesForecastSnippet: sales7.chartData.slice(0, 7),
          productForecast: { growth: productSeven.growth || [], risk: productSeven.risk || [] },
        }
      : null,
    thirtyDay: horizon30Ready
      ? {
          salesForecastSnippet: sales30.chartData.slice(0, 14),
          productForecast: { growth: productThirty.growth || [], risk: productThirty.risk || [] },
        }
      : null,
  };
}

// 90 days of historical context when the 30-day horizon is ready
// (richer, more stable signal); otherwise 60 days, matching whatever
// the 7-day horizon's own history requirement already guaranteed.
function resolveHistoricalLookbackDays(forecastAvailability) {
  return forecastAvailability.horizon30Ready ? REQUIRED_HISTORY_DAYS["30d"] : REQUIRED_HISTORY_DAYS["7d"];
}

// ==========================================
// SIGNAL RECONCILIATION (FORECAST-ANCHORED)
// ==========================================
// Cross-references the historical growth/risk lists (computed straight
// from past orders, via getProductGrowthAndRisk) against the ACTUAL
// forecasted growth/risk lists for whichever horizon this run selected,
// so the prompt no longer has to hope Gemini notices when they agree —
// that reconciliation is now done deterministically in code.
//
// Per product, this sorts into:
//   - "confirmed"     — appears in BOTH the historical list and the
//                       forecast list (same direction). Highest
//                       confidence: history and forecast agree.
//   - "forecastOnly"  — appears ONLY in the forecast list, not yet in
//                       the historical growth/risk list. A leading
//                       indicator — real, but should be described as
//                       forward-looking, not "already happening."
// A product that only shows up in the HISTORICAL list (not forecasted to
// keep moving that way) is deliberately left out of the reconciled set —
// that's exactly the "re-deriving a purely historical trend" pattern
// this reconciliation exists to close off. The raw historical lists are
// still available in context.salesGrowthContext for narrative color,
// but the prompt is instructed to build recommendations from this
// reconciled set instead.
function reconcileDirectionalSignals(historicalList, forecastList) {
  const confirmed = [];
  const forecastOnly = [];

  for (const f of forecastList || []) {
    const match = (historicalList || []).find((h) => h.name === f.name);
    if (match) {
      confirmed.push({
        name: f.name,
        historicalDiff: match.diff,
        historicalPct: match.pct,
        forecastPct: f.pct,
        forecastDiff: f.diff,
        forecastQty: f.forecast,
      });
    } else {
      forecastOnly.push({
        name: f.name,
        forecastPct: f.pct,
        forecastDiff: f.diff,
        forecastQty: f.forecast,
      });
    }
  }

  return { confirmed, forecastOnly };
}

// Picks whichever forecast horizon this run's historicalWindowDays
// actually corresponds to (mirrors resolveHistoricalLookbackDays) and
// reconciles against ONLY that horizon's product forecast — never mixes
// the 7-day and 30-day horizons together.
function reconcileGrowthAndRisk(growthAndRisk, forecastAvailability) {
  const activeForecast = forecastAvailability.horizon30Ready
    ? forecastAvailability.thirtyDay
    : forecastAvailability.sevenDay;

  if (!activeForecast) {
    // Defensive fallback only — the anyReady gate upstream should always
    // guarantee at least one horizon is present by the time this runs.
    return {
      growth: { confirmed: [], forecastOnly: [] },
      risk: { confirmed: [], forecastOnly: [] },
    };
  }

  return {
    growth: reconcileDirectionalSignals(growthAndRisk.topGrowthProducts, activeForecast.productForecast.growth),
    risk: reconcileDirectionalSignals(growthAndRisk.topRiskProducts, activeForecast.productForecast.risk),
  };
}

// Same idea, applied to the slow-mover/bundle pairing job (1b in the
// prompt): a slow mover is a much more urgent bundle candidate when the
// forecast ALSO expects it to keep declining, vs. one that's merely slow
// historically with no forecasted continuation. Splits bundleContext's
// slowMovers into that priority order instead of leaving the "check if
// this also shows up in the forecast" cross-reference to the prompt.
function reconcileSlowMovers(bundleContext, forecastAvailability) {
  const activeForecast = forecastAvailability.horizon30Ready
    ? forecastAvailability.thirtyDay
    : forecastAvailability.sevenDay;

  const forecastRiskNames = new Set(
    (activeForecast?.productForecast?.risk || []).map((f) => f.name)
  );

  const slowMovers = bundleContext.slowMovers || [];
  const confirmedDecline = slowMovers.filter((s) => forecastRiskNames.has(s.name));
  const otherSlowMovers = slowMovers.filter((s) => !forecastRiskNames.has(s.name));

  return { confirmedDecline, otherSlowMovers };
}

async function getRecommendationContext(historicalWindowDays, ingredientToProducts, forecastAvailability) {
  const [recentSalesTrend, growthAndRisk, expiryContext, bundleContext] = await Promise.all([
    getRecentSalesTrend(historicalWindowDays),
    getProductGrowthAndRisk(historicalWindowDays),
    getExpiryAdvisoryContext(historicalWindowDays, ingredientToProducts),
    getBundleOpportunityContext(historicalWindowDays),
  ]);

  // Stock-level fallback is only computed (and only sent to the prompt)
  // when there is nothing near-expiring to react to — keeps the context
  // lean and keeps the AI from mixing both signals for the same category.
  const stockContext = expiryContext.nearExpiringItems.length === 0
    ? getStockLevelContext(expiryContext.inventoryActivitySummary)
    : null;

  return {
    historicalWindowDays,
    // NOTE: kept for narrative color only (e.g. describing the overall
    // sales trend in plain language) — the prompt is instructed NOT to
    // use this as the basis for picking which products to recommend.
    // reconciledSignals below is the forecast-anchored basis for that.
    salesGrowthContext: {
      recentSalesTrend,
      topGrowthProducts: growthAndRisk.topGrowthProducts,
      topRiskProducts: growthAndRisk.topRiskProducts,
    },
    reconciledSignals: {
      ...reconcileGrowthAndRisk(growthAndRisk, forecastAvailability),
      slowMovers: reconcileSlowMovers(bundleContext, forecastAvailability),
    },
    forecast: {
      sevenDay: forecastAvailability.sevenDay,
      thirtyDay: forecastAvailability.thirtyDay,
    },
    bundleContext,
    expiryContext: {
      nearExpiringItems: expiryContext.nearExpiringItems,
      recentWaste: expiryContext.recentWaste,
    },
    stockContext,
  };
}

function buildActionablePrompt(context, previousTitles = []) {
  const todayDate = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });

  const horizonsAvailable = [
    context.forecast.sevenDay ? "7-day" : null,
    context.forecast.thirtyDay ? "30-day" : null,
  ].filter(Boolean).join(" and ");

  const avoidRepeatBlock = previousTitles.length
    ? `\nAVOID REPEATING YOURSELF: here are the recommendation titles you gave last time: ${JSON.stringify(previousTitles)}. The underlying data may look similar again, but do not reuse these titles or restate them with only minor wording changes. Find a different specific angle in the current data (a different product, a different number, a different combination) — if the data genuinely supports the same core idea, at least ground it in a new specific detail so it doesn't read as a copy-paste.\n`
    : "";

  const systemPrompt = `You are a Decision Support System (DSS) advisor for Cakelytics, analyzing "Aileen and Cake Max," a local cake and bake shop in the Philippines. Today's date is ${todayDate}.

This analysis is NOT tied to a single timeframe route. It looks at ${context.historicalWindowDays} days of historical data (salesGrowthContext, bundleContext, expiryContext / stockContext) plus whichever forecast horizon(s) are currently ready: the ${horizonsAvailable} forecast(s), found in "forecast". When both horizons are present, treat a signal that shows up in both as higher-confidence; when they disagree, say so and favor the nearer-term (7-day) signal for anything time-sensitive.

FORECAST IS THE AUTHORITATIVE BASIS — READ THIS CAREFULLY:
"reconciledSignals" has already cross-checked the historical growth/risk data against the actual forecast for you, so you do not have to (and should not try to) re-derive that comparison yourself:
- "reconciledSignals.growth.confirmed" / "reconciledSignals.risk.confirmed" — products where BOTH the historical trend AND the forecast agree on the direction. These are your highest-confidence, first-choice picks.
- "reconciledSignals.growth.forecastOnly" / "reconciledSignals.risk.forecastOnly" — products the forecast expects to move, even if the historical window hasn't clearly shown it yet. Use these when there is nothing in "confirmed", and describe them as forward-looking ("expected to..." / "forecast points to..."), not as something already observed.
- "reconciledSignals.slowMovers.confirmedDecline" — slow movers that the forecast ALSO expects to keep declining. Prefer these over "reconciledSignals.slowMovers.otherSlowMovers" for the bundle/pairing job below.
"salesGrowthContext.topGrowthProducts" and "salesGrowthContext.topRiskProducts" are included ONLY as background — to help you describe HOW a confirmed or forecastOnly signal got there in plain language. Do NOT pick a product for a recommendation because it appears in salesGrowthContext alone; if a product isn't in "reconciledSignals" in some form, it is not a forecast-backed signal, and should not anchor a recommendation. Only fall back to salesGrowthContext as a last resort if reconciledSignals is empty for a whole category, and clearly describe it as a historical-only observation with no forecast confirmation.

EVERY RECOMMENDATION MUST BE AN ACTION, NOT JUST A HEADS-UP:
This is a Decision Support tool — the owner is reading this to know exactly what to DO, not just what is happening. Each recommendation's "desc" must clearly state a specific, concrete move the owner can take this week: run a specific promo, bundle two named products together, cut production of a named item by a rough amount, put a specific item on sale at a specific discount, push pre-orders for a specific upcoming date, produce a smaller/larger batch of a named item, or a similarly concrete operational change.
BANNED — these are observations dressed as advice, not real actions, and must never be the main instruction of a recommendation: "monitor," "keep an eye on," "plan carefully," "stay mindful," "watch closely," "be cautious," "keep things steady/consistent," "prepare accordingly." If you catch yourself about to write one of these, stop and replace it with the actual concrete action you'd take instead (a number, a product pairing, a specific adjustment) — e.g. instead of "plan your prep carefully so you don't overproduce," say "cut your next Customized Cake batch by about a third" or name the specific smaller quantity that fits the forecasted drop.
It is fine — expected, even — to state the data/reasoning first (e.g. "Tarpaulin orders are expected to drop 23% this month"), but that must always be followed by a specific action, never left standing alone as the whole recommendation.

BUSINESS CONSTRAINTS (these are real operational facts that silently shape WHICH strategies are even possible — they are guardrails for YOU, not talking points for the owner. Never suggest a delivery, third-party logistics like Grab/Foodpanda, or dine-in/café strategy, since none of those exist here — but also NEVER explain, apologize for, or mention in the output text why a strategy was skipped or chosen because of pick-up-only or no-delivery. The owner already knows how their own shop operates; do not remind them. Just quietly pick strategies that work within walk-ins, advance pre-orders, and on-site/counter selling, and talk about the strategy itself — not the constraint):
- Stay within the bakery/celebration product line (cakes, pastries, celebration add-ons like candles/tarpaulins). Don't suggest unrelated items (drinks, meals) or generic promos that don't fit a bakeshop (e.g. "back to school").
- Ground every recommendation in the actual numbers, product names, and items present in the context — never invent data.

BE GENUINELY STRATEGIC — NOT JUST "PUT IT ON THE COUNTER":
Don't default to the same shallow move every time (e.g. "feature it near the counter," "highlight it to walk-ins"). Think like someone who actually wants this specific bake shop to sell more: bundle timing around paydays or upcoming occasions in occasions/celebration_materials if relevant, a smarter pre-order push for a specific event, a limited-time framing that creates urgency, a specific discount depth that still protects margin, or a concrete reason a customer would buy more per visit. The strategy should feel like it was built FOR this shop's actual numbers, not copy-pasted generic retail advice.

CRITICAL QUALITY GATE — DO NOT PAD WITH GENERIC ADVICE:
Only write a recommendation when it is anchored to something NOTICEABLE in the forecast or historical data — a real surge, a real decline, a real sustained trend, a real near-expiry item, or a real stock imbalance. A flat, unremarkable pattern is NOT a recommendation opportunity on its own. Every recommendation must cite the specific number, product, or item that justifies it (e.g. an actual forecasted pct/diff, an actual near-expiry date, an actual slow-mover vs best-seller pairing). Never invent or exaggerate a "noticeable" trend that the numbers don't actually support — if the strongest available signal is modest, describe it honestly as modest.
${avoidRepeatBlock}
Produce exactly TWO categories, each with EXACTLY 2 recommendations — the 2 most important and most immediately attainable for that category, ranked by how noticeable/urgent the underlying signal is. Never return 0, 1, 3, or 4 for a category unless the underlying context for that entire category is truly empty (in which case return as many as the data honestly supports, but do not fabricate to hit 2).

1. "salesOptimization" (Sales Optimization) — you MUST cover BOTH of these jobs across your 2 recommendations (one recommendation per job — they do not both have to come from job (a); do not submit two variations of job (a) and skip job (b)):
   a. A sales-growth or sales-risk strategy anchored primarily in the forecast (forecast.*.salesForecastSnippet, and reconciledSignals.growth/risk for product-level detail) — especially one lining up with an upcoming noticeable date (Filipino payday 15th/30th, or a PH seasonal window like summer / habagat-typhoon season / 'Ber' months-Christmas) if the forecast actually shows that pattern. Use salesGrowthContext.recentSalesTrend only to narrate whether the move has already begun — never as a substitute for the forecast itself. If sales are flat or declining (per the forecast), say so plainly and give a real, specific mitigation action instead of dressing it up as growth — e.g. a concrete production cut, a specific clearance/bundle move, or a specific pre-order push, never just "plan carefully" or "stay consistent."
   b. MANDATORY whenever reconciledSignals.slowMovers has at least one entry (in confirmedDecline OR otherSlowMovers) AND bundleContext.bestSellers has at least one entry — only skip this job entirely if BOTH of those are truly empty. From reconciledSignals.slowMovers, prefer a product from "confirmedDecline" (a slow mover the forecast also expects to keep declining — this is your most urgent pick); only use "otherSlowMovers" if confirmedDecline is empty, and note explicitly that it's a historical-only slow mover with no forecasted continuation. Pair it with a genuinely fast-moving product from bundleContext.bestSellers — prefer one that also appears in reconciledSignals.growth — in a specific bundle/add-on/discount pairing (name both products, and state a concrete discount or add-on term), explaining why the pairing fits a bakery/celebration business.

2. "inventoryOptimization" (Inventory Optimization):
   a. If expiryContext.nearExpiringItems is non-empty: pick the most urgent near-expiring item(s). For ones with a possibleProducts match, recommend producing/pushing that specific product with a reasoned discount and expected return vs. a full write-off. If no possibleProducts match exists for the most urgent item, recommend a direct clearance/discount action instead.
   b. If expiryContext.nearExpiringItems is EMPTY, use stockContext instead: call out a specific item trending toward a stockout (stockContext.understockRisk) or sitting overstocked (stockContext.overstockRisk), using its actual in/out/waste numbers, and suggest a concrete adjustment (reorder sooner, reduce next restock, or repurpose it into a recipe). If stockContext also has nothing meaningful, fall back to expiryContext.recentWaste and recommend a concrete restock-frequency or FIFO fix for the item with the most waste.

LANGUAGE & TONE — WRITE FOR A REGULAR SHOP OWNER, NOT A BUSINESS SCHOOL GRAD:
Imagine you're explaining this out loud to a 50-year-old bake shop owner who has never studied business or marketing — someone smart and experienced running their own shop, but who did not grow up with corporate or startup vocabulary. Write the way you'd actually talk to them face to face.
- Use short, plain sentences. One idea per sentence when possible.
- Use everyday, concrete words. AVOID business-jargon words like: leverage, momentum, contraction, capture, institute, expedite, impulse purchases, upsell, logistics, synergy, optimize, reconcile, cross-reference, mechanism, anchor. Say the plain-English version instead — e.g. instead of "leverage this upward momentum," say "sell more of it while it's in demand"; instead of "institute a clearance discount," say "put it on sale now."
- Skip the analyst framing (don't say things like "the forecast points to," "data indicates," "the model projects"). Just state what's happening and what to do about it, like a friend giving practical advice: "Tarpaulin orders are slowing down, so..." not "Forecast data indicates a contraction in tarpaulin demand..."
- Still be specific — keep the real numbers, product names, and dates. Being simple doesn't mean being vague; it means saying real things in plain words.
- Vary your phrasing and sentence openers between recommendations; avoid falling into the same boilerplate structure for every item.

Respond with ONLY valid JSON strictly following this exact shape:
{
  "salesOptimization": [ { "title": "...", "desc": "...", "type": "success" | "warning" | "danger" | "info" | "neutral" }, { "title": "...", "desc": "...", "type": "..." } ],
  "inventoryOptimization": [ { "title": "...", "desc": "...", "type": "..." }, { "title": "...", "desc": "...", "type": "..." } ]
}`;

  const userPrompt = `Business context (JSON): ${JSON.stringify(context)}`;
  return { systemPrompt, userPrompt };
}

// ==========================================
// RELIABILITY LAYER — deterministic checks, not just prompt wording.
// normalizeActionablePayload() above only checks SHAPE (does it have a
// title/desc/valid type). It says nothing about CONTENT quality — so a
// Gemini response that is well-formed JSON but full of vague, passive
// filler ("plan carefully", "keep things steady") or that silently
// skipped a required job (like the slow-mover + best-seller bundle
// pairing) would sail straight through and get cached as-is. This is
// why low-quality output could repeat run after run without anything
// ever catching it. validateActionablePayload() below re-checks the
// ACTUAL text against the same rules we gave Gemini, so failures are
// caught in code — not just hoped away by prompt wording.
// ==========================================

const AR_BANNED_PASSIVE_PHRASES = [
  "plan your prep carefully",
  "plan carefully",
  "keep an eye on",
  "monitor",
  "stay mindful",
  "watch closely",
  "be cautious",
  "keep things steady",
  "keep it steady",
  "stay consistent",
  "prepare accordingly",
  "adjust accordingly",
];

function findBannedPassivePhrase(text) {
  const lower = String(text || "").toLowerCase();
  return AR_BANNED_PASSIVE_PHRASES.find((phrase) => lower.includes(phrase)) || null;
}

// Re-derives, in plain code, whether job 1.b (the slow-mover +
// best-seller bundle pairing) was actually mandatory for this run's
// context — mirrors the "MANDATORY whenever..." rule given to Gemini in
// buildActionablePrompt, so we can verify Gemini actually followed it.
function validateActionablePayload(payload, context) {
  const issues = [];
  const salesRecs = payload?.salesOptimization || [];
  const invRecs = payload?.inventoryOptimization || [];

  for (const rec of [...salesRecs, ...invRecs]) {
    const bannedHit = findBannedPassivePhrase(rec.desc);
    if (bannedHit) {
      issues.push(`"${rec.title}" leans on a passive/vague phrase ("${bannedHit}") instead of stating a concrete action.`);
    }
    if (!/\d/.test(rec.desc)) {
      issues.push(`"${rec.title}" doesn't cite any concrete number (%, ₱, quantity, or date) — too generic to be data-grounded.`);
    }
  }

  const slowMovers = [
    ...(context?.reconciledSignals?.slowMovers?.confirmedDecline || []),
    ...(context?.reconciledSignals?.slowMovers?.otherSlowMovers || []),
  ];
  const bestSellers = context?.bundleContext?.bestSellers || [];
  if (slowMovers.length > 0 && bestSellers.length > 0) {
    const bestSellerNames = bestSellers
      .map((p) => String(p?.name || p?.product_name || "").toLowerCase())
      .filter(Boolean);
    const salesText = salesRecs.map((r) => r.desc).join(" ").toLowerCase();
    const hasBundleMention = bestSellerNames.some((name) => name && salesText.includes(name));
    if (!hasBundleMention) {
      issues.push("Required bundle/pairing recommendation (slow mover + best seller, job 1.b) is missing from salesOptimization — both recommendations look like variations of the same decline-mitigation angle instead.");
    }
  }

  return issues;
}

function normalizeActionablePayload(aiResult) {
  const normalizeArray = (arr) => {
    const list = Array.isArray(arr) ? arr : [];
    return list
      .filter(r => r && r.title && r.desc)
      .slice(0, AR_MAX_PER_CATEGORY)
      .map(r => ({
        title: String(r.title),
        desc: String(r.desc),
        type: AR_VALID_TYPES.includes(r.type) ? r.type : "neutral",
      }));
  };

  return {
    salesOptimization: normalizeArray(aiResult?.salesOptimization),
    inventoryOptimization: normalizeArray(aiResult?.inventoryOptimization),
  };
}

function emptyActionablePayload() {
  return { salesOptimization: [], inventoryOptimization: [] };
}

const ActionableRecommendationService = {
  // No longer takes a timeframe — recommendations are a single,
  // timeframe-independent set that internally reasons over whichever
  // forecast horizon(s) (7-day and/or 30-day) are actually ready.
  async getActionableRecommendations(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await AiCacheModel.getByKey(AR_CACHE_KEY);
      if (cached && cached.payload) {
        return { recommendations: cached.payload, insufficientData: false };
      }
      return {
        recommendations: emptyActionablePayload(),
        insufficientData: true,
        message: "No cached recommendations available. Awaiting Cron execution.",
      };
    }

    // GATE: recommendations are a downstream consumer of the Sales
    // Forecast AND Product Forecast. If NEITHER the 7-day NOR the 30-day
    // horizon is ready on both sides, there is no forecast to reason
    // over yet — no-op entirely rather than fall back to a past-data-only
    // recommendation.
    const forecastAvailability = await getForecastAvailability();
    if (!forecastAvailability.anyReady) {
      return {
        recommendations: emptyActionablePayload(),
        insufficientData: true,
        message: "Waiting for the sales and product forecast to finish generating before recommendations can be produced.",
      };
    }

    const historicalWindowDays = resolveHistoricalLookbackDays(forecastAvailability);

    try {
      const [ingredientToProducts, previousTitles] = await Promise.all([
        buildIngredientToProductsMap(),
        getPreviousRecommendationTitles(AR_CACHE_KEY),
      ]);
      const context = await getRecommendationContext(historicalWindowDays, ingredientToProducts, forecastAvailability);
      const { systemPrompt, userPrompt } = buildActionablePrompt(context, previousTitles);

      // RELIABILITY LOOP: up to 3 attempts. Each attempt is checked with
      // validateActionablePayload() (real content rules, not just JSON
      // shape). If an attempt fails, the NEXT attempt is told exactly
      // what was wrong and asked to fix it — and temperature is lowered
      // on retries to reduce variance and push Gemini toward the
      // instructions rather than a "creative" reinterpretation of them.
      const MAX_ATTEMPTS = 3;
      let payload = null;
      let issues = [];
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const retryNote = attempt > 1
          ? `\n\nIMPORTANT — YOUR PREVIOUS ATTEMPT FAILED THESE SPECIFIC CHECKS. FIX THEM THIS TIME:\n${issues.map((i) => `- ${i}`).join("\n")}\n`
          : "";
        const temperature = attempt === 1 ? 0.5 : 0.25;
        const aiResult = await callGeminiJSON({ systemPrompt, userPrompt: userPrompt + retryNote, temperature });
        const candidate = normalizeActionablePayload(aiResult);
        issues = validateActionablePayload(candidate, context);
        payload = candidate; // keep the latest attempt as the best-so-far fallback

        if (issues.length === 0) break;
        console.warn(`[ActionableRecommendationService] Attempt ${attempt}/${MAX_ATTEMPTS} failed validation:`, issues);
      }

      if (issues.length > 0) {
        // All attempts still failed content validation. Do NOT overwrite
        // a previously good cached result with something we know is
        // low-quality — keep serving the last known-good set instead,
        // and log loudly so this is visible in cron logs (not just
        // discovered later by eyeballing the dashboard).
        console.error(
          "[ActionableRecommendationService] All attempts failed validation — keeping previous cached recommendations instead of overwriting with low-quality output:",
          issues
        );
        const existingCache = await AiCacheModel.getByKey(AR_CACHE_KEY);
        if (existingCache && existingCache.payload) {
          return { recommendations: existingCache.payload, insufficientData: false };
        }
        // No previous good cache to fall back to (e.g. first-ever run) —
        // serve the best-effort payload anyway rather than an empty one.
      }

      await AiCacheModel.upsert(AR_CACHE_KEY, payload, AR_CACHE_TTL_MS);
      return { recommendations: payload, insufficientData: false };
    } catch (err) {
      console.error("[ActionableRecommendationService] Gemini recommendation failed:", err.message);
      return { recommendations: emptyActionablePayload(), insufficientData: true };
    }
  },
};

// ==========================================
// 2. PRODUCT FORECAST SERVICE (GEMINI-ANALYZED)
// ==========================================
// The system fetches full daily history, applies the per-product eligibility
// rules, and reconciles Gemini's forecast against actual recent unit totals.
const PF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PF_TIMEFRAME_LABELS = { "7d": "Next 7 Days", "30d": "Next 30 Days" };
const PRODUCT_COMBINED_CACHE_KEY = "product_forecast:combined";
const SUPABASE_DEFAULT_ROW_CAP = 1000;

// Supabase/PostgREST pinuputol ang resulta sa 1000 rows. Ang Sales Forecast ay
// 1 row kada ORDER kaya kasya; ang Product Forecast ay 1 row kada ORDER ITEM
// (mas marami ng ilang beses) kaya sa 90 araw ay maaari pa ring lumampas sa cap at
// NAPUPUTOL ang history (kulang ang recent days o ang lumang days) —
// kaya walang produktong lumalabas na eligible. Solusyon: hatiin ang date
// range; kapag ang isang hati ay eksaktong umabot sa cap, hatiin pa ulit.
async function fetchRangeUncapped(fetchFn, startISO, endISO) {
  const startMs = new Date(startISO).getTime();
  const endMs = new Date(endISO).getTime();
  const MIN_SPAN_MS = 60 * 60 * 1000; // hanggang 1 oras na lang ang pinakamaliit na hati

  const rows = await fetchFn(new Date(startMs).toISOString(), new Date(endMs).toISOString());
  const list = Array.isArray(rows) ? rows : [];
  if (list.length < SUPABASE_DEFAULT_ROW_CAP || endMs - startMs <= MIN_SPAN_MS) {
    if (list.length >= SUPABASE_DEFAULT_ROW_CAP) {
      console.warn(`[Forecast] ${list.length} rows sa loob lang ng ${new Date(startMs).toISOString()} → ${new Date(endMs).toISOString()} — posibleng may naputol pa rin.`);
    }
    return list;
  }

  const midMs = Math.floor((startMs + endMs) / 2);
  const left = await fetchRangeUncapped(fetchFn, new Date(startMs).toISOString(), new Date(midMs).toISOString());
  const right = await fetchRangeUncapped(fetchFn, new Date(midMs + 1).toISOString(), new Date(endMs).toISOString());
  return left.concat(right);
}

// Daily units kada produkto (Manila dates), mula sa unang araw na may
// benta hanggang kahapon. Walang fixed fetch window.
async function getProductDailySeries() {
  const todayKey = toManilaDateKey(new Date());
  const endKey = addDaysToKey(todayKey, -1);
  const startISO = new Date(0).toISOString();
  const endISO = new Date(`${endKey}T23:59:59.999+08:00`).toISOString();

  const items = await fetchRangeUncapped(
    (from, to) => OrderItemsModel.getByOrderDateRange(from, to, {
      columns: `product_id, product_name, quantity, products ( name, category ), orders!inner ( created_at, status )`,
      excludeCancelled: true,
    }),
    startISO,
    endISO
  );
  console.log(`[ProductForecastService] Fetched ${items.length} order-item rows for all available history.`);

  if (items.length > 0 && items.length % SUPABASE_DEFAULT_ROW_CAP === 0) {
    console.warn(`[ProductForecastService] Query returned exactly ${items.length} rows — baka naputol ng row limit ang history. I-check ang pagination ng OrderItemsModel.getByOrderDateRange.`);
  }

  const byProduct = {};
  let unnamedRows = 0;
  for (const row of items) {
    const createdAt = row.orders?.created_at;
    if (!createdAt) continue;

    // Prefer the saved order-item name, with the joined product name as a
    // fallback, so the forecast uses the same visible names as Recommendations.
    // Rows without either name are excluded.
    const name = String(row.product_name || row.products?.name || "").trim();
    if (!name) {
      unnamedRows += 1;
      continue;
    }
    const category = row.products?.category || "Uncategorized";
    const key = `name:${name.toLowerCase()}`;
    const day = toManilaDateKey(createdAt);
    if (day > endKey) continue;

    if (!byProduct[key]) byProduct[key] = { productName: name, category, qtyByDate: {} };
    byProduct[key].qtyByDate[day] = (byProduct[key].qtyByDate[day] || 0) + Number(row.quantity || 0);
  }

  if (unnamedRows > 0) {
    console.warn(`[ProductForecastService] ${unnamedRows} order-item row(s) walang product_name at walang naka-link na product — hindi isinama sa forecast.`);
  }

  const products = Object.values(byProduct)
    .map((p) => {
      const saleKeys = Object.keys(p.qtyByDate).filter((date) => p.qtyByDate[date] > 0);
      if (saleKeys.length === 0) return { productName: p.productName, category: p.category, series: [] };
      const firstSaleKey = saleKeys.reduce((a, b) => (a < b ? a : b));
      const full = [];
      for (let date = firstSaleKey; date <= endKey; date = addDaysToKey(date, 1)) {
        full.push({ date, value: p.qtyByDate[date] || 0 });
      }
      const firstSaleIndex = full.findIndex((pt) => pt.value > 0);
      return {
        productName: p.productName,
        category: p.category,
        series: firstSaleIndex === -1 ? [] : full.slice(firstSaleIndex),
      };
    })
    .filter((p) => p.series.length > 0);

  return { products, todayKey };
}

// Per-product sufficiency (hindi lang shop-wide).
function isProductEligible(series, horizonKey) {
  const rules = PRODUCT_FORECAST_RULES[horizonKey];
  const recentWindow = PRODUCT_RECENT_UNITS_WINDOW_DAYS[horizonKey];

  if (series.length < rules.minDaysSinceFirstSale) return false;
  if (series.filter((p) => p.value > 0).length < rules.minActiveDays) return false;

  const recentUnits = sumOf(series.slice(-recentWindow).map((p) => p.value));
  return recentUnits >= rules.minUnitsRecent;
}

function productInsufficientPart(timeframe, message) {
  return { ...emptyProductPayload(timeframe), insufficientData: true, message };
}

function emptyProductPayload(timeframe) {
  return { label: PF_TIMEFRAME_LABELS[timeframe] || PF_TIMEFRAME_LABELS["30d"], growth: [], risk: [] };
}

const FORECAST_AI_SYSTEM_PROMPT = `You are the forecasting analyst of a bake shop. The application only checks that the data
is sufficient. YOU analyze the data and compute the forecast yourself. Use only the data
provided. Do not invent products or dates. Respond with JSON only, matching the exact schema.`;
const FORECAST_AI_MAX_ATTEMPTS = 3;

async function callForecastGeminiWithRetries({ serviceName, systemPrompt, userPrompt, validate }) {
  let result = null;
  let issues = [];

  for (let attempt = 1; attempt <= FORECAST_AI_MAX_ATTEMPTS; attempt++) {
    const retryNote = attempt > 1
      ? `\n\nIMPORTANT — YOUR PREVIOUS ATTEMPT FAILED THESE SPECIFIC CHECKS. FIX THEM THIS TIME:\n${issues.map((issue) => `- ${issue}`).join("\n")}\n`
      : "";

    try {
      const candidate = await callGeminiJSON({
        systemPrompt,
        userPrompt: userPrompt + retryNote,
        temperature: attempt === 1 ? 0.4 : 0.2,
      });
      issues = validate(candidate);
      result = candidate;
    } catch (error) {
      result = null;
      issues = [`Gemini request or JSON parsing failed: ${error.message}`];
    }

    if (issues.length === 0) return { result, issues: [] };
    console.warn(`[${serviceName}] Attempt ${attempt}/${FORECAST_AI_MAX_ATTEMPTS} failed validation:`, issues);
  }

  return { result, issues };
}

function getProductRecentUnits(product, horizonKey) {
  const horizon = TIMEFRAME_DAYS[horizonKey];
  return sumOf(product.series.slice(-horizon).map((point) => point.value));
}

function getEligibleProducts(products, horizonKey) {
  return products.filter((product) => isProductEligible(product.series, horizonKey));
}

function buildProductHorizonPayload(products, aiProducts, horizonKey) {
  const horizon = TIMEFRAME_DAYS[horizonKey];
  const rules = PRODUCT_FORECAST_RULES[horizonKey];
  const eligible = getEligibleProducts(products, horizonKey);
  if (eligible.length === 0) {
    return productInsufficientPart(
      horizonKey,
      `No product has enough sales history yet for a ${horizon}-day trend (needs ${rules.minDaysSinceFirstSale}+ days since first sale, ${rules.minActiveDays}+ days with sales, and ${rules.minUnitsRecent}+ units recently).`
    );
  }

  const aiProductsByName = new Map(aiProducts.map((item) => [item.name, item]));
  const results = eligible.map((product) => {
    const aiProduct = aiProductsByName.get(product.productName);
    const forecast = Math.round(aiProduct.forecast);
    const recentQty = getProductRecentUnits(product, horizonKey);
    const diff = forecast - recentQty;
    const pct = recentQty > 0 ? Math.round((diff / recentQty) * 100) : null;
    return { name: product.productName, forecast, recentQty, diff, pct, classification: aiProduct.classification };
  });

  const toListItem = (r) => ({ name: r.name, pct: r.pct, diff: r.diff, forecast: r.forecast, recentQty: r.recentQty });
  const growth = results
    .filter((r) => r.classification === "growth")
    .sort((a, b) => b.diff - a.diff)
    .slice(0, PRODUCT_LIST_MAX)
    .map(toListItem);
  const risk = results
    .filter((r) => r.classification === "risk")
    .sort((a, b) => a.pct - b.pct)
    .slice(0, PRODUCT_LIST_MAX)
    .map(toListItem);

  const recentUnitsAll = sumOf(results.map((result) => result.recentQty));
  const forecastUnitsAll = sumOf(results.map((result) => result.forecast));
  const totals = {
    recentUnits: recentUnitsAll,
    forecastUnits: forecastUnitsAll,
    pct: recentUnitsAll > 0 ? Math.round(((forecastUnitsAll - recentUnitsAll) / recentUnitsAll) * 100) : null,
  };
  console.log(`[ProductForecastService][${horizonKey}] TOTAL units (eligible products): last ${horizon}d actual=${totals.recentUnits} -> next ${horizon}d forecast=${totals.forecastUnits} (${totals.pct}%)`);
  console.log(`[ProductForecastService][${horizonKey}] growth=${growth.length}, risk=${risk.length}`);

  return {
    label: PF_TIMEFRAME_LABELS[horizonKey],
    growth,
    risk,
    insufficientData: false,
    generatedAt: new Date().toISOString(),
    eligibleProducts: eligible.length,
    skippedProducts: products.length - eligible.length,
    totals,
    accuracy: null,
    method: {
      type: "AI-generated (Gemini)",
      historyDays: eligible.reduce((days, product) => Math.max(days, product.series.length), 0),
    },
  };
}

function validateProductForecastResponse(response, eligibleByHorizon) {
  const issues = [];
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return ["Response must be a JSON object."];
  }

  for (const horizonKey of ["7d", "30d"]) {
    const field = horizonKey === "7d" ? "sevenDay" : "thirtyDay";
    const expectedProducts = eligibleByHorizon[horizonKey];
    const forecasts = response[field];
    if (!Array.isArray(forecasts)) {
      issues.push(`${field} must be an array.`);
      continue;
    }

    const expectedNames = new Set(expectedProducts.map((product) => product.productName));
    const seenNames = new Set();
    for (const item of forecasts) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        issues.push(`${field} contains an invalid product entry.`);
        continue;
      }
      if (typeof item.name !== "string" || !expectedNames.has(item.name)) {
        issues.push(`${field} contains a product name that was not eligible in the input.`);
        continue;
      }
      if (seenNames.has(item.name)) {
        issues.push(`${field} contains duplicate product "${item.name}".`);
        continue;
      }
      seenNames.add(item.name);
      if (typeof item.forecast !== "number" || !Number.isFinite(item.forecast) || item.forecast < 0 || !Number.isInteger(item.forecast)) {
        issues.push(`${field} forecast for "${item.name}" must be a non-negative whole number.`);
        continue;
      }
      if (!["growth", "risk", "stable"].includes(item.classification)) {
        issues.push(`${field} classification for "${item.name}" must be growth, risk, or stable.`);
        continue;
      }

      const product = expectedProducts.find((candidate) => candidate.productName === item.name);
      const recentQty = getProductRecentUnits(product, horizonKey);
      const diff = item.forecast - recentQty;
      const pct = recentQty > 0 ? Math.round((diff / recentQty) * 100) : null;
      const rules = PRODUCT_FORECAST_RULES[horizonKey];
      const meaningfulGrowth = diff >= rules.minAbsChange && pct !== null && pct >= rules.minPctChange;
      const meaningfulRisk = diff <= -rules.minAbsChange && pct !== null && pct <= rules.riskPctCeiling;

      if (item.classification === "growth" && !meaningfulGrowth) {
        issues.push(`${field} classifies "${item.name}" as growth without a meaningful increase.`);
      } else if (item.classification === "risk" && !meaningfulRisk) {
        issues.push(`${field} classifies "${item.name}" as risk without a meaningful decrease.`);
      } else if (item.classification === "stable" && (meaningfulGrowth || meaningfulRisk)) {
        issues.push(`${field} classifies "${item.name}" as stable despite a meaningful change.`);
      }
    }

    for (const name of expectedNames) {
      if (!seenNames.has(name)) issues.push(`${field} is missing the eligible product "${name}".`);
    }
  }

  return issues;
}

function buildProductForecastPrompt(todayKey, eligibleByHorizon) {
  const productsForHorizon = (horizonKey) => eligibleByHorizon[horizonKey].map((product) => ({
    name: product.productName,
    dailyUnits: product.series.map(({ date, value }) => ({ date, units: value })),
    recentUnits: getProductRecentUnits(product, horizonKey),
  }));
  const input = {
    today: todayKey,
    horizons: {
      sevenDay: { days: TIMEFRAME_DAYS["7d"], eligibleProducts: productsForHorizon("7d") },
      thirtyDay: { days: TIMEFRAME_DAYS["30d"], eligibleProducts: productsForHorizon("30d") },
    },
  };
  const userPrompt = `Analyze the full daily units series for every supplied product. For each available horizon, return a forecast for every product marked eligible for that horizon, compared with its supplied recent actual units. You decide whether each product has a meaningful increase (growth), meaningful decrease (risk), or no meaningful change (stable). A product must appear exactly once per horizon and must never be both growth and risk.

Today in Manila: ${todayKey}
Horizons: 7 days and 30 days, starting today.
Each horizon's input contains only products that pass that horizon's eligibility rules. For a horizon with no eligible products, return an empty array.

Return exactly this JSON shape:
{"sevenDay":[{"name":"existing product name","forecast":0,"classification":"growth|risk|stable"}],"thirtyDay":[{"name":"existing product name","forecast":0,"classification":"growth|risk|stable"}]}
Forecasts must be non-negative whole units. Do not omit eligible products.

Input data: ${JSON.stringify(input)}`;

  return { systemPrompt: FORECAST_AI_SYSTEM_PROMPT, userPrompt };
}

// Cron/refresh entry point. One Gemini call analyzes both eligible horizons.
async function refreshProductForecast() {
  const sevenCheck = await checkForecastDataSufficiency("7d");
  const thirtyCheck = await checkForecastDataSufficiency("30d");

  if (!sevenCheck.sufficient) {
    const payload = {
      sevenDay: productInsufficientPart("7d", sevenCheck.message),
      thirtyDay: productInsufficientPart("30d", sevenCheck.message),
    };
    await AiCacheModel.upsert(PRODUCT_COMBINED_CACHE_KEY, payload, PF_CACHE_TTL_MS);
    return payload;
  }

  const includeThirty = thirtyCheck.sufficient;
  try {
    const { products, todayKey } = await getProductDailySeries();
    const eligibleByHorizon = {
      "7d": getEligibleProducts(products, "7d"),
      "30d": includeThirty ? getEligibleProducts(products, "30d") : [],
    };

    if (eligibleByHorizon["7d"].length === 0 && eligibleByHorizon["30d"].length === 0) {
      const noEligibleProducts = (horizonKey) => {
        const rules = PRODUCT_FORECAST_RULES[horizonKey];
        const horizon = TIMEFRAME_DAYS[horizonKey];
        return productInsufficientPart(
          horizonKey,
          `No product has enough sales history yet for a ${horizon}-day trend (needs ${rules.minDaysSinceFirstSale}+ days since first sale, ${rules.minActiveDays}+ days with sales, and ${rules.minUnitsRecent}+ units recently).`
        );
      };
      const payload = {
        sevenDay: noEligibleProducts("7d"),
        thirtyDay: includeThirty ? noEligibleProducts("30d") : productInsufficientPart("30d", thirtyCheck.message),
      };
      await AiCacheModel.upsert(PRODUCT_COMBINED_CACHE_KEY, payload, PF_CACHE_TTL_MS);
      return payload;
    }

    const { systemPrompt, userPrompt } = buildProductForecastPrompt(todayKey, eligibleByHorizon);
    const { result, issues } = await callForecastGeminiWithRetries({
      serviceName: "ProductForecastService",
      systemPrompt,
      userPrompt,
      validate: (candidate) => validateProductForecastResponse(candidate, eligibleByHorizon),
    });

    if (issues.length > 0) {
      console.error("[ProductForecastService] All Gemini attempts failed validation — keeping previous cached forecast:", issues);
      const existing = await AiCacheModel.getByKey(PRODUCT_COMBINED_CACHE_KEY);
      if (existing?.payload) return existing.payload;

      const failedPart = (horizonKey) => productInsufficientPart(horizonKey, "Forecast generation failed validation. Will retry on next cron run.");
      return {
        sevenDay: eligibleByHorizon["7d"].length
          ? failedPart("7d")
          : productInsufficientPart("7d", "No eligible products are available for this forecast."),
        thirtyDay: includeThirty
          ? (eligibleByHorizon["30d"].length ? failedPart("30d") : productInsufficientPart("30d", "No eligible products are available for this forecast."))
          : productInsufficientPart("30d", thirtyCheck.message),
      };
    }

    const payload = {
      sevenDay: eligibleByHorizon["7d"].length
        ? buildProductHorizonPayload(products, result.sevenDay, "7d")
        : productInsufficientPart("7d", "No product has enough sales history yet for a 7-day trend."),
      thirtyDay: includeThirty
        ? (eligibleByHorizon["30d"].length
          ? buildProductHorizonPayload(products, result.thirtyDay, "30d")
          : productInsufficientPart("30d", "No product has enough sales history yet for a 30-day trend."))
        : productInsufficientPart("30d", thirtyCheck.message),
    };
    await AiCacheModel.upsert(PRODUCT_COMBINED_CACHE_KEY, payload, PF_CACHE_TTL_MS);
    return payload;
  } catch (err) {
    console.error("[ProductForecastService] Forecast refresh failed:", err.message);
    const existing = await AiCacheModel.getByKey(PRODUCT_COMBINED_CACHE_KEY);
    if (existing?.payload) return existing.payload;
    const failMessage = "Forecast generation failed. Will retry on next cron run.";
    return {
      sevenDay: productInsufficientPart("7d", failMessage),
      thirtyDay: productInsufficientPart("30d", includeThirty ? failMessage : thirtyCheck.message),
    };
  }
}

// Read-only lookup used by the frontend routes.
async function getProductForecastRead(timeframe) {
  const validTimeframe = TIMEFRAME_DAYS[timeframe] ? timeframe : "30d";
  const cached = await AiCacheModel.getByKey(PRODUCT_COMBINED_CACHE_KEY);
  const part = cached?.payload?.[validTimeframe === "7d" ? "sevenDay" : "thirtyDay"];

  if (part && !part.insufficientData) {
    return { ...part, insufficientData: false };
  }

  return {
    ...emptyProductPayload(validTimeframe),
    insufficientData: true,
    message: part?.message || "No cached forecast available. Awaiting Cron execution.",
  };
}

const ProductForecastService = {
  async getProductTrendsByTimeframe(timeframe = "30d", forceRefresh = false) {
    if (typeof timeframe === 'boolean') {
      forceRefresh = timeframe;
      timeframe = '30d';
    }

    const validTimeframe = TIMEFRAME_DAYS[timeframe] ? timeframe : "30d";

    if (forceRefresh) {
      await refreshProductForecast();
    }

    return getProductForecastRead(validTimeframe);
  },

  // Explicit cron entry point — tawagin ONCE (kinukuwenta ang 7d at 30d nang sabay).
  refreshProductForecast,
};

// ==========================================
// 3. SALES FORECAST SERVICE (GEMINI-ANALYZED)
// ==========================================
// The system supplies full daily sales history and actual recent totals.
// Gemini generates both horizon forecasts; code only validates and shapes them.
const SF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function buildSalesCacheKey(timeframe) {
  return `sales_forecast:${timeframe}`;
}

// amount_paid (aktwal na natanggap na bayad) — parehong basehan ng KPI at
// Performance Summary. Manila dates, kumpletong araw lang (hanggang kahapon),
// at nagsisimula sa unang araw na may benta ang shop.
//
// DYNAMIC: walang fixed na bilang ng araw. Kinukuha ang LAHAT ng orders
// hanggang kahapon, hinahanap ang aktwal na unang araw na may benta, at
// doon nagsisimula ang series. Ang REQUIRED_HISTORY_DAYS ay gate na lang
// (assurance na sapat ang history) — hindi na ito ang naglilimita sa
// binabasa ng forecast.
async function getSalesDailySeries() {
  const todayKey = toManilaDateKey(new Date());
  const endKey = addDaysToKey(todayKey, -1);
  const startISO = new Date(0).toISOString();
  const endISO = new Date(`${endKey}T23:59:59.999+08:00`).toISOString();

  const orders = await fetchRangeUncapped(
    (from, to) => OrdersModel.getByDateRange(from, to, {
      columns: "amount_paid, created_at",
      excludeCancelled: true,
      ascending: true,
    }),
    startISO,
    endISO
  );

  if (orders.length > 0 && orders.length % SUPABASE_DEFAULT_ROW_CAP === 0) {
    console.warn(`[SalesForecastService] Query returned exactly ${orders.length} rows — baka naputol ng row limit ang history. I-check ang pagination ng OrdersModel.getByDateRange.`);
  }

  const totalsByDate = {};
  for (const order of orders) {
    if (!order.created_at) continue;
    const day = toManilaDateKey(order.created_at);
    totalsByDate[day] = (totalsByDate[day] || 0) + Number(order.amount_paid || 0);
  }

  // Unang araw na may benta (YYYY-MM-DD kaya tama ang string comparison).
  const saleKeys = Object.keys(totalsByDate).filter((k) => totalsByDate[k] > 0 && k <= endKey);
  if (saleKeys.length === 0) return { series: [], todayKey };
  const firstKey = saleKeys.reduce((a, b) => (a < b ? a : b));

  // Buuin ang tuloy-tuloy na araw mula sa unang benta hanggang kahapon.
  // Ang mga araw na walang order pagkatapos ng unang benta ay tunay na 0.
  const series = [];
  for (let key = firstKey; key <= endKey; key = addDaysToKey(key, 1)) {
    series.push({ date: key, value: totalsByDate[key] || 0 });
  }
  return { series, todayKey };
}

function insufficientSalesPayload(message) {
  return {
    chartData: [],
    insufficientData: true,
    message: message || "No cached forecast available. Awaiting Cron execution.",
  };
}

function buildSalesHorizonPayload(forecasts, series, horizonKey) {
  const horizon = TIMEFRAME_DAYS[horizonKey];
  const chartData = forecasts.map((item, i) => {
    const forecastSales = Math.round(item.forecastSales);
    return {
      date: item.date,
      label: formatForecastLabel(item.date),
      isToday: i === 0,
      forecastSales,
      lower: Math.max(0, Math.round(item.lower)),
      upper: Math.round(item.upper),
    };
  });

  const recentTotal = sumOf(series.slice(-horizon).map((point) => point.value));
  const forecastTotal = sumOf(chartData.map((d) => d.forecastSales));
  const totals = {
    recentTotal,
    forecastTotal,
    pct: recentTotal > 0 ? Math.round(((forecastTotal - recentTotal) / recentTotal) * 100) : null,
  };
  console.log(`[SalesForecastService][${horizonKey}] TOTAL sales: last ${horizon}d actual=${totals.recentTotal} -> next ${horizon}d forecast=${totals.forecastTotal} (${totals.pct}%)`);

  return {
    chartData,
    insufficientData: false,
    generatedAt: new Date().toISOString(),
    totals,
    accuracy: null,
    method: { type: "AI-generated (Gemini)", historyDays: series.length },
  };
}

function validateSalesForecastResponse(response, todayKey, availableHorizons) {
  const issues = [];
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return ["Response must be a JSON object."];
  }

  for (const horizonKey of ["7d", "30d"]) {
    const field = horizonKey === "7d" ? "sevenDay" : "thirtyDay";
    const horizon = TIMEFRAME_DAYS[horizonKey];
    const forecasts = response[field];
    if (!Array.isArray(forecasts)) {
      issues.push(`${field} must be an array.`);
      continue;
    }

    if (!availableHorizons[horizonKey]) {
      if (forecasts.length !== 0) issues.push(`${field} must be empty because this horizon did not pass its data gate.`);
      continue;
    }

    const expectedDates = buildFutureDateKeys(todayKey, horizon);
    if (forecasts.length !== horizon) {
      issues.push(`${field} must contain exactly ${horizon} dates.`);
    }
    forecasts.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        issues.push(`${field} contains an invalid forecast entry at index ${index}.`);
        return;
      }
      if (item.date !== expectedDates[index]) {
        issues.push(`${field} date at index ${index} must be ${expectedDates[index] || "omitted"}.`);
      }
      for (const key of ["forecastSales", "lower", "upper"]) {
        if (typeof item[key] !== "number" || !Number.isFinite(item[key]) || item[key] < 0) {
          issues.push(`${field} ${key} at index ${index} must be a non-negative finite number.`);
        }
      }
      if (
        typeof item.forecastSales === "number"
        && Number.isFinite(item.forecastSales)
        && typeof item.lower === "number"
        && Number.isFinite(item.lower)
        && typeof item.upper === "number"
        && Number.isFinite(item.upper)
        && (item.lower > item.forecastSales || item.forecastSales > item.upper)
      ) {
        issues.push(`${field} bounds at index ${index} must satisfy lower <= forecastSales <= upper.`);
      }
    });
  }

  return issues;
}

function buildSalesForecastPrompt(series, todayKey, availableHorizons) {
  const horizonFacts = ["7d", "30d"].map((horizonKey) => ({
    key: horizonKey,
    days: TIMEFRAME_DAYS[horizonKey],
    available: availableHorizons[horizonKey],
    recentActualTotal: sumOf(series.slice(-TIMEFRAME_DAYS[horizonKey]).map((point) => point.value)),
  }));
  const userPrompt = `Analyze the full daily sales series for its level, trend, weekday pattern, outliers, and growth or decline. Forecast daily sales for every available horizon. Each horizon starts today in Manila. Use the actual recent totals below as facts; do not change them.

Today in Manila: ${todayKey}
Horizons and recent actual totals: ${JSON.stringify(horizonFacts)}
For a horizon marked unavailable, return an empty array.

Return exactly this JSON shape:
{"sevenDay":[{"date":"YYYY-MM-DD","forecastSales":0,"lower":0,"upper":0}],"thirtyDay":[{"date":"YYYY-MM-DD","forecastSales":0,"lower":0,"upper":0}]}
Each available horizon must contain exactly its specified number of consecutive dates, starting today. Values and bounds must be non-negative numbers, with lower <= forecastSales <= upper.

Raw daily sales series: ${JSON.stringify(series)}`;
  return { systemPrompt: FORECAST_AI_SYSTEM_PROMPT, userPrompt };
}

// Cron/refresh entry point. Tawagin ONCE bawat cron run.
async function refreshSalesForecast() {
  const sevenCheck = await checkForecastDataSufficiency("7d");
  const thirtyCheck = await checkForecastDataSufficiency("30d");

  if (!sevenCheck.sufficient) {
    const payload = insufficientSalesPayload(sevenCheck.message);
    await Promise.all([
      AiCacheModel.upsert(buildSalesCacheKey("30d"), payload, SF_CACHE_TTL_MS),
      AiCacheModel.upsert(buildSalesCacheKey("7d"), payload, SF_CACHE_TTL_MS),
    ]);
    return payload;
  }

  const includeThirty = thirtyCheck.sufficient;
  try {
    const { series, todayKey } = await getSalesDailySeries();
    const activeDays = series.filter((point) => point.value > 0).length;
    const availableHorizons = {
      "7d": activeDays >= SALES_MIN_ACTIVE_DAYS["7d"],
      "30d": includeThirty && activeDays >= SALES_MIN_ACTIVE_DAYS["30d"],
    };

    if (!availableHorizons["7d"]) {
      const activeMessage = `Not enough sales activity yet — only ${activeDays} day(s) with sales in the available history (a 7-day forecast needs at least ${SALES_MIN_ACTIVE_DAYS["7d"]}).`;
      const payload = {
        sevenDay: insufficientSalesPayload(activeMessage),
        thirtyDay: insufficientSalesPayload(includeThirty
          ? `Not enough sales activity yet — only ${activeDays} day(s) with sales in the available history (a 30-day forecast needs at least ${SALES_MIN_ACTIVE_DAYS["30d"]}).`
          : thirtyCheck.message),
      };
      await Promise.all([
        AiCacheModel.upsert(buildSalesCacheKey("7d"), payload.sevenDay, SF_CACHE_TTL_MS),
        AiCacheModel.upsert(buildSalesCacheKey("30d"), payload.thirtyDay, SF_CACHE_TTL_MS),
      ]);
      return includeThirty ? payload.thirtyDay : payload.sevenDay;
    }

    const { systemPrompt, userPrompt } = buildSalesForecastPrompt(series, todayKey, availableHorizons);
    const { result, issues } = await callForecastGeminiWithRetries({
      serviceName: "SalesForecastService",
      systemPrompt,
      userPrompt,
      validate: (candidate) => validateSalesForecastResponse(candidate, todayKey, availableHorizons),
    });

    if (issues.length > 0) {
      console.error("[SalesForecastService] All Gemini attempts failed validation — keeping previous cached forecasts:", issues);
      const [existingSeven, existingThirty] = await Promise.all([
        AiCacheModel.getByKey(buildSalesCacheKey("7d")),
        AiCacheModel.getByKey(buildSalesCacheKey("30d")),
      ]);
      const fallback = includeThirty ? existingThirty?.payload : existingSeven?.payload;
      return fallback || insufficientSalesPayload("Forecast generation failed validation. Will retry on next cron run.");
    }

    const sevenPayload = buildSalesHorizonPayload(result.sevenDay, series, "7d");
    const thirtyPayload = availableHorizons["30d"]
      ? buildSalesHorizonPayload(result.thirtyDay, series, "30d")
      : insufficientSalesPayload(includeThirty
        ? `Not enough sales activity yet — only ${activeDays} day(s) with sales in the available history (a 30-day forecast needs at least ${SALES_MIN_ACTIVE_DAYS["30d"]}).`
        : thirtyCheck.message);

    await Promise.all([
      AiCacheModel.upsert(buildSalesCacheKey("7d"), sevenPayload, SF_CACHE_TTL_MS),
      AiCacheModel.upsert(buildSalesCacheKey("30d"), thirtyPayload, SF_CACHE_TTL_MS),
    ]);
    return includeThirty ? thirtyPayload : sevenPayload;
  } catch (err) {
    console.error("[SalesForecastService] Forecast refresh failed:", err.message);
    const [existingSeven, existingThirty] = await Promise.all([
      AiCacheModel.getByKey(buildSalesCacheKey("7d")),
      AiCacheModel.getByKey(buildSalesCacheKey("30d")),
    ]);
    const fallback = includeThirty ? existingThirty?.payload : existingSeven?.payload;
    return fallback || insufficientSalesPayload("Forecast generation failed. Will retry on next cron run.");
  }
}

// Read-only lookup used by the frontend routes. Never recomputes.
async function getSalesForecastRead(timeframe) {
  const validTimeframe = TIMEFRAME_DAYS[timeframe] ? timeframe : "30d";
  const cached = await AiCacheModel.getByKey(buildSalesCacheKey(validTimeframe));
  const payload = cached?.payload;

  if (payload && !payload.insufficientData && payload.chartData?.length) {
    return {
      chartData: payload.chartData,
      insufficientData: false,
      totals: payload.totals ?? null,
      accuracy: payload.accuracy ?? null,
      method: payload.method ?? null,
      generatedAt: payload.generatedAt ?? null,
    };
  }

  return insufficientSalesPayload(payload?.message);
}

const SalesForecastService = {
  async getSalesTrendsByTimeframe(timeframe = "30d", forceRefresh = false) {
    if (typeof timeframe === 'boolean') {
      forceRefresh = timeframe;
      timeframe = '30d';
    }

    const validTimeframe = TIMEFRAME_DAYS[timeframe] ? timeframe : "30d";

    if (forceRefresh) {
      await refreshSalesForecast();
    }

    return getSalesForecastRead(validTimeframe);
  },

  // Explicit cron entry point — tawagin ONCE (kinukuwenta ang 7d at 30d nang sabay).
  refreshSalesForecast,
};

// ==========================================
// 4. PERFORMANCE SUMMARY SERVICE (AI-GENERATED TEXT SUMMARY)
// ==========================================
const PS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PS_MASTER_CACHE_KEY = "performance_summary_master";
const PS_PERIOD_DAYS = 7;
const PS_TOP_PRODUCTS_COUNT = 3;

// FIX: gamitin ang amount_paid (aktwal na natanggap na bayad), hindi ang
// grand_total (buong committed value ng order) — parehong basehan gaya ng
// ginagamit na ni FourKpiService.calculateMetrics sa analytics.service.js.
// Kung hindi ito i-match, hindi tutugma ang "Total Sales" ng weekly AI
// summary laban sa Total Sales KPI card kahit magkaparehong "Past 7 Days"
// window ang ginagamit ng dalawa (halimbawa: Confirmed order na 50%
// Deposit pa lang ang bayad — grand_total 5000 pero amount_paid 2500).
function sumSalesAndExpenses(orders, inventoryLogs) {
  const totalSales = (orders || []).reduce((sum, order) => sum + Number(order.amount_paid || 0), 0);
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
  // 1. Fetch current boundaries exactly how the KPI does
  const { startDate: currentStart, endDate: currentEnd } = getDateRange('Past 7 Days');
  
  // 2. Calculate prior boundaries using the exact same duration math as FourKpiService
  const start = new Date(currentStart);
  const end = new Date(currentEnd);
  const duration = end.getTime() - start.getTime(); 
  
  const priorEndDate = new Date(start.getTime() - 1); 
  const priorStartDate = new Date(start.getTime() - duration);

  const priorStart = priorStartDate.toISOString();
  const priorEnd = priorEndDate.toISOString();

  const [currentOrders, currentInventoryLogs, priorOrders, priorInventoryLogs, topProducts] = await Promise.all([
    OrdersModel.getByDateRange(currentStart, currentEnd, { columns: "amount_paid, created_at", excludeCancelled: true }),
    InventoryLogsModel.getByDateRange(currentStart, currentEnd),
    OrdersModel.getByDateRange(priorStart, priorEnd, { columns: "amount_paid, created_at", excludeCancelled: true }),
    InventoryLogsModel.getByDateRange(priorStart, priorEnd),
    getTopProductsForRange(currentStart, currentEnd),
  ]);

  const currentMetrics = sumSalesAndExpenses(currentOrders, currentInventoryLogs);
  const priorMetrics = sumSalesAndExpenses(priorOrders, priorInventoryLogs);

  return {
    periodInfo: "Comparing the current 7-day period (the past 7 days excluding today) against the prior 7-day period (the 7 days before that).",
    current: currentMetrics,
    prior: priorMetrics,
    topProducts,
  };
}

function buildSummaryPrompt(context) {
  const systemPrompt = `You are a meticulous business report analyst speaking directly to the owner of a bake shop, like a trusted advisor giving the boss a quick briefing.
You are given ALREADY-COMPUTED figures comparing the business's current 7-day performance (the past 7 days excluding today) against the prior 7-day period (the 7 days before that).

CRITICAL RULES:
1. Write a 2 to 3 sentence executive summary in clear, simple, friendly English describing the performance. Address the reader directly as the owner (e.g. "boss", "you") — never refer to the business by a system or platform name.
2. Explicitly compare the current 7 days against the previous 7 days. State clearly if the performance improved or declined based on the provided current vs prior metrics. (e.g. "Sales went up from ₱4,000 last week to ₱5,000 this week...").
3. Incorporate the computed Total Sales, Gross Profit, and Total Expenses. Format currency correctly (e.g. ₱5,000). You do not need to list exact percentage formulas unless it makes the narrative sound natural, but focus on comparing the real monetary values.
4. HIGHLIGHT key figures by wrapping them in double asterisks so they become bold (e.g. **₱5,000**).
5. Do NOT alter any numeric value.
6. Preserve the exact topProducts array in the JSON response.
7. You MUST explicitly state in your opening sentence that this analysis covers the "past 7 days" (or "this week"). This is a strict requirement so the reader immediately understands the exact timeframe being summarized, regardless of any other filters on their dashboard.

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