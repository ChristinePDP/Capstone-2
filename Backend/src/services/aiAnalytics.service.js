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
//   - "7d" forecasts require at least 60 days (2 months) of history.
//   - "30d" forecasts require at least 180 days (6 months) of history.
// If the requirement isn't met, the caller must skip Gemini entirely,
// skip the cache write entirely, and effectively no-op the cron run.
const REQUIRED_HISTORY_DAYS = { "7d": 120, "30d": 180 };

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
// SHARED: OUTLIER GUARD (IQR WINSORIZATION)
// ==========================================
// Applies to the raw historical series fed into Gemini for BOTH Sales
// Forecast and Product Forecast. Both prompts derive their trend by
// comparing "recent half vs earlier half" averages of the raw numbers —
// a single freak day (a huge bulk/event order, a data-entry glitch, an
// unexpected closure) would otherwise swing that whole comparison and
// get read as a real trend. This clamps (winsorizes) values that fall
// outside the IQR fence to the nearest acceptable bound INSTEAD OF
// deleting them, so the day sequence/array length stays intact and the
// series still reflects "something happened" that day, just not at a
// magnitude that distorts the trend math.
const OUTLIER_MIN_SAMPLE_SIZE = 8; // too few points to trust a spread calc below this
const OUTLIER_IQR_MULTIPLIER = 1.5; // standard Tukey fence

function computePercentile(sortedValues, percentile) {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * percentile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

// values: numeric-only array (caller must strip null/undefined first).
// Returns null when the sample is too small, or has zero spread (IQR
// === 0 — e.g. a slow-mover product that's almost always 0), to safely
// judge outliers from — in both cases, no capping should happen.
function computeIqrBounds(values) {
  if (values.length < OUTLIER_MIN_SAMPLE_SIZE) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const q1 = computePercentile(sorted, 0.25);
  const q3 = computePercentile(sorted, 0.75);
  const iqr = q3 - q1;
  if (iqr === 0) return null;

  return {
    lowerBound: q1 - OUTLIER_IQR_MULTIPLIER * iqr,
    upperBound: q3 + OUTLIER_IQR_MULTIPLIER * iqr,
  };
}

// Winsorizes a numeric series, preserving order/length. `null`/`undefined`
// entries (e.g. "today" with no sales recorded yet) pass through
// untouched and are excluded from the bound calculation itself.
function winsorizeSeries(values) {
  const numericValues = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  const bounds = computeIqrBounds(numericValues);

  if (!bounds) {
    return { adjusted: [...values], outlierCount: 0 };
  }

  let outlierCount = 0;
  const adjusted = values.map((v) => {
    if (v === null || v === undefined || Number.isNaN(v)) return v;
    if (v > bounds.upperBound) {
      outlierCount += 1;
      return Math.round(bounds.upperBound);
    }
    if (v < bounds.lowerBound) {
      outlierCount += 1;
      return Math.max(0, Math.round(bounds.lowerBound));
    }
    return v;
  });

  return { adjusted, outlierCount };
}

// ==========================================
// 1. ACTIONABLE RECOMMENDATIONS SERVICE (FORECAST-DRIVEN, TIMEFRAME-INDEPENDENT)
// ==========================================
// Recommendations are no longer split into a per-timeframe route/cache.
// There is ONE recommendation set, generated by cross-referencing
// whichever forecast horizon(s) are actually ready (7-day and/or
// 30-day) against the matching historical lookback:
//   - 180 days of history when the 30-day horizon is ready.
//   - 120 days of history when only the 7-day horizon is ready.
// If NEITHER horizon has a ready forecast (sales AND product forecast,
// on both sides), recommendations do not run at all — there is nothing
// forward-looking to reason over yet, so we no-op rather than fall back
// to a past-data-only guess.
const AR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const AR_VALID_TYPES = ["success", "warning", "danger", "info", "neutral"];
const AR_CACHE_KEY = "actionable_recommendations_v5";
const AR_MAX_PER_CATEGORY = 2;

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

// 180 days of historical context when the 30-day horizon is ready
// (richer, more stable signal); otherwise 120 days, matching whatever
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

BUSINESS CONSTRAINTS (these are real operational facts, not style preferences — never violate them):
- Pick-up only. No delivery, no third-party logistics (Grab/Foodpanda). Strategies work through walk-ins, advance pre-orders for pick-up, and on-site upselling.
- No dine-in / hospitality angle — this is a retail cake shop, not a café.
- Stay within the bakery/celebration product line (cakes, pastries, celebration add-ons like candles/tarpaulins). Don't suggest unrelated items (drinks, meals) or generic promos that don't fit a bakeshop (e.g. "back to school").
- Ground every recommendation in the actual numbers, product names, and items present in the context — never invent data.

CRITICAL QUALITY GATE — DO NOT PAD WITH GENERIC ADVICE:
Only write a recommendation when it is anchored to something NOTICEABLE in the forecast or historical data — a real surge, a real decline, a real sustained trend, a real near-expiry item, or a real stock imbalance. A flat, unremarkable pattern is NOT a recommendation opportunity on its own. Every recommendation must cite the specific number, product, or item that justifies it (e.g. an actual forecasted pct/diff, an actual near-expiry date, an actual slow-mover vs best-seller pairing). Never invent or exaggerate a "noticeable" trend that the numbers don't actually support — if the strongest available signal is modest, describe it honestly as modest.
${avoidRepeatBlock}
Produce exactly TWO categories, each with EXACTLY 2 recommendations — the 2 most important and most immediately attainable for that category, ranked by how noticeable/urgent the underlying signal is. Never return 0, 1, 3, or 4 for a category unless the underlying context for that entire category is truly empty (in which case return as many as the data honestly supports, but do not fabricate to hit 2).

1. "salesOptimization" (Sales Optimization) — cover BOTH of these jobs across the 2 recommendations (they don't need to be split 1-and-1, but both angles should be represented across your two picks unless the data for one is clearly stronger):
   a. A sales-growth or sales-risk strategy anchored primarily in the forecast (forecast.*.salesForecastSnippet, and reconciledSignals.growth/risk for product-level detail) — especially one lining up with an upcoming noticeable date (Filipino payday 15th/30th, or a PH seasonal window like summer / habagat-typhoon season / 'Ber' months-Christmas) if the forecast actually shows that pattern. Use salesGrowthContext.recentSalesTrend only to narrate whether the move has already begun — never as a substitute for the forecast itself. If sales are flat or declining (per the forecast), say so plainly and give a real mitigation strategy instead of dressing it up as growth.
   b. From reconciledSignals.slowMovers, prefer a product from "confirmedDecline" (a slow mover the forecast also expects to keep declining — this is your most urgent pick); only use "otherSlowMovers" if confirmedDecline is empty, and note explicitly that it's a historical-only slow mover with no forecasted continuation. Pair it with a genuinely fast-moving product from bundleContext.bestSellers — prefer one that also appears in reconciledSignals.growth — in a specific bundle/add-on/discount mechanic, explaining why the pairing fits a bakery/celebration business.

2. "inventoryOptimization" (Inventory Optimization):
   a. If expiryContext.nearExpiringItems is non-empty: pick the most urgent near-expiring item(s). For ones with a possibleProducts match, recommend producing/pushing that specific product with a reasoned discount and expected return vs. a full write-off. If no possibleProducts match exists for the most urgent item, recommend a direct clearance/discount action instead.
   b. If expiryContext.nearExpiringItems is EMPTY, use stockContext instead: call out a specific item trending toward a stockout (stockContext.understockRisk) or sitting overstocked (stockContext.overstockRisk), using its actual in/out/waste numbers, and suggest a concrete adjustment (reorder sooner, reduce next restock, or repurpose it into a recipe). If stockContext also has nothing meaningful, fall back to expiryContext.recentWaste and recommend a concrete restock-frequency or FIFO fix for the item with the most waste.

LANGUAGE & TONE: Write in clear, simple, friendly English — like an experienced business consultant talking directly to the shop owner. Keep sentences easy to read and avoid technical jargon. Vary your phrasing and sentence openers between recommendations; avoid falling into the same boilerplate structure for every item.

Respond with ONLY valid JSON strictly following this exact shape:
{
  "salesOptimization": [ { "title": "...", "desc": "...", "type": "success" | "warning" | "danger" | "info" | "neutral" }, { "title": "...", "desc": "...", "type": "..." } ],
  "inventoryOptimization": [ { "title": "...", "desc": "...", "type": "..." }, { "title": "...", "desc": "...", "type": "..." } ]
}`;

  const userPrompt = `Business context (JSON): ${JSON.stringify(context)}`;
  return { systemPrompt, userPrompt };
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
      // Slightly higher than default: this call generates business advice,
      // not a deterministic forecast, so some creative variance between
      // refreshes is desirable (paired with the anti-repeat instruction
      // above, which keeps it from just being noise).
      const aiResult = await callGeminiJSON({ systemPrompt, userPrompt, temperature: 0.7 });
      const payload = normalizeActionablePayload(aiResult);

      await AiCacheModel.upsert(AR_CACHE_KEY, payload, AR_CACHE_TTL_MS);
      return { recommendations: payload, insufficientData: false };
    } catch (err) {
      console.error("[ActionableRecommendationService] Gemini recommendation failed:", err.message);
      return { recommendations: emptyActionablePayload(), insufficientData: true };
    }
  },
};

// ==========================================
// 2. PRODUCT FORECAST SERVICE (SINGLE CALL, BOTH HORIZONS TOGETHER)
// ==========================================
// Unlike Sales Forecast, we can't just slice a 30-day RESULT down to get
// the 7-day one — each product's "forecast" number here is a CUMULATIVE
// TOTAL over its whole horizon (not a per-day series), and the growth/
// risk lists can legitimately contain different products at 7 days vs
// 30 days (different momentum, different window). So both horizons are
// requested from Gemini in ONE call/reasoning pass — that keeps it to a
// single Gemini call per cron run while still giving each horizon its
// own real, horizon-specific numbers (no fake derivation).
const PF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PF_TIMEFRAME_LABELS = { "7d": "Next 7 Days", "30d": "Next 30 Days" };
const PRODUCT_COMBINED_CACHE_KEY = "product_forecast:combined";

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

  // dateSequence runs oldest -> newest, so dailyQty[last] is always
  // "yesterday"/"today" — this ordering matters for the recency slice
  // taken below (sliceRecentDays uses dailyQty.slice(-days)).
  let totalOutlierDays = 0;
  const result = Object.values(byProduct).map((p) => {
    const rawDailyQty = dateSequence.map((d) => p.qtyByDate[d] || 0);

    // OUTLIER GUARD: winsorized PER PRODUCT (each product has its own
    // scale/volume) so one freak-order day for a single item can't
    // distort that item's own recent-half-vs-earlier-half trend calc.
    // Products with mostly-zero history (true slow movers) naturally
    // get skipped by computeIqrBounds (IQR === 0), so this never
    // flattens a genuinely sparse-but-real sales pattern.
    const { adjusted, outlierCount } = winsorizeSeries(rawDailyQty);
    totalOutlierDays += outlierCount;

    return {
      productName: p.productName,
      category: p.category,
      dailyQty: adjusted,
    };
  });

  if (totalOutlierDays > 0) {
    console.log(`[ProductForecastService] Outlier guard capped ${totalOutlierDays} product-day value(s) across the ${days}-day history window.`);
  }

  return result;
}

// Takes the tail end (most recent `days` entries) of each product's
// dailyQty array. Used to carve the 7-day-horizon's own lookback window
// out of a longer fetched history, so the 7-day trend calc stays
// recency-weighted even when we fetched extra days for the 30-day part.
function sliceRecentDays(productSalesHistory, days) {
  return productSalesHistory.map((p) => ({
    productName: p.productName,
    category: p.category,
    dailyQty: p.dailyQty.slice(-days),
  }));
}

// UPDATED: single prompt now requests BOTH horizons at once (Option C).
// thirtyDayHistory is only included when 30-day history is sufficient —
// when it's omitted, the prompt asks for "sevenDay" only.
function buildProductPrompt({ sevenDayHistory, thirtyDayHistory }) {
  const sevenDays = TIMEFRAME_DAYS["7d"];
  const thirtyDays = TIMEFRAME_DAYS["30d"];
  const includeThirty = Array.isArray(thirtyDayHistory);

  const horizonBlock = includeThirty
    ? `TWO independent horizons:
1. "sevenDay" — forecast horizon of ${sevenDays} days, using ONLY the data in "sevenDayHistory" below.
2. "thirtyDay" — forecast horizon of ${thirtyDays} days, using ONLY the data in "thirtyDayHistory" below (a longer, separate lookback window — do NOT mix it with sevenDayHistory).`
    : `ONE horizon:
1. "sevenDay" — forecast horizon of ${sevenDays} days, using ONLY the data in "sevenDayHistory" below. (There is not yet enough history for a reliable 30-day horizon, so do not attempt "thirtyDay" — omit it entirely.)`;

  const systemPrompt = `You are a product-level sales trend assistant for Cakelytics, a small Philippine bakeshop.

TASK: Given each product's recent daily quantity history, identify which products are trending UP ("growth") and which are trending DOWN ("risk"), for ${horizonBlock}

Follow this method PRECISELY, in order, for EACH product, WITHIN EACH horizon it applies to, so your output stays consistent given the same input:
1. Sum the product's quantities over that horizon's full history window — this is its recentQty for that horizon.
2. Compare the average daily quantity in the most recent half of that horizon's window against the average daily quantity in the earlier half, to determine trend direction and rough magnitude.
3. Project that trend forward across that horizon's forecast length (${sevenDays} days for sevenDay${includeThirty ? `, ${thirtyDays} days for thirtyDay` : ""}) to estimate a forecasted total quantity (forecast).
4. Compute diff = forecast - recentQty, and pct = round((diff / recentQty) * 100). If recentQty is 0, treat pct as 100 if forecast > 0, otherwise 0.
5. Do NOT invent growth or decline that isn't supported by the historical numbers — if a product's history is flat within a horizon, it does not belong in either list for that horizon.
6. Within each horizon, select at most the 5 products with the strongest positive diff for "growth", and at most the 5 with the strongest negative diff for "risk". Do not include the same product in both lists of the same horizon.

IMPORTANT: sevenDay${includeThirty ? " and thirtyDay are computed completely independently from their own history window" : ""} — a product can appear in one horizon's list and not the other's, or with a different pct, and that is EXPECTED, not an error. Do NOT force the horizons to agree with each other.

CONSISTENCY RULE: Do NOT introduce random variation — same input data must always produce the same output.

NOTE: the daily quantity history below has already had extreme outlier days (e.g. a single freak bulk order for that product) capped to a reasonable bound, on a per-product basis. Treat the given numbers as authoritative — do not try to further discount, smooth, or "correct" them for outliers yourself.

ALL numbers (forecast, diff, pct) MUST be integers.

Respond with ONLY valid JSON${includeThirty ? "" : " (omit the \"thirtyDay\" key entirely — do not include it, even as null or empty)"}:
{
  "sevenDay": { "growth": [{ "name": "Product Name", "pct": number, "diff": number, "forecast": number }], "risk": [...] }${includeThirty ? `,
  "thirtyDay": { "growth": [...], "risk": [...] }` : ""}
}`;

  const userPrompt = `sevenDayHistory (oldest to newest, per product): ${JSON.stringify(sevenDayHistory)}` +
    (includeThirty ? `\nthirtyDayHistory (oldest to newest, per product): ${JSON.stringify(thirtyDayHistory)}` : "");

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

function normalizeProductHorizon(aiResultPart, timeframe) {
  return {
    label: PF_TIMEFRAME_LABELS[timeframe] || PF_TIMEFRAME_LABELS["30d"],
    growth: normalizeList(aiResultPart?.growth),
    risk: normalizeList(aiResultPart?.risk),
    insufficientData: false,
  };
}

function emptyProductPayload(timeframe) {
  return { label: PF_TIMEFRAME_LABELS[timeframe] || PF_TIMEFRAME_LABELS["30d"], growth: [], risk: [] };
}

// Cron/refresh entry point — generation is unified: ONE Gemini call
// produces both horizons together whenever both have enough history;
// only "sevenDay" is requested when 30-day history isn't there yet.
async function refreshProductForecast() {
  const sevenCheck = await checkForecastDataSufficiency("7d");
  const thirtyCheck = await checkForecastDataSufficiency("30d");

  // Neither horizon has enough history (7d's requirement is the lower
  // bar, so failing it means 30d fails too) — no-op, real reason cached.
  if (!sevenCheck.sufficient) {
    const payload = {
      sevenDay: { ...emptyProductPayload("7d"), insufficientData: true, message: sevenCheck.message },
      thirtyDay: { ...emptyProductPayload("30d"), insufficientData: true, message: sevenCheck.message },
    };
    await AiCacheModel.upsert(PRODUCT_COMBINED_CACHE_KEY, payload, PF_CACHE_TTL_MS);
    return payload;
  }

  const includeThirty = thirtyCheck.sufficient;
  const fetchDays = includeThirty ? REQUIRED_HISTORY_DAYS["30d"] : REQUIRED_HISTORY_DAYS["7d"];

  const fullHistory = await getRawProductSalesHistory(fetchDays);
  const hasSales = fullHistory.some((p) => p.dailyQty.some((q) => q > 0));

  if (!hasSales) {
    const noActivityMessage = "No product sales activity found in the historical window.";
    const payload = {
      sevenDay: { ...emptyProductPayload("7d"), insufficientData: true, message: noActivityMessage },
      thirtyDay: {
        ...emptyProductPayload("30d"),
        insufficientData: true,
        message: includeThirty ? noActivityMessage : thirtyCheck.message,
      },
    };
    await AiCacheModel.upsert(PRODUCT_COMBINED_CACHE_KEY, payload, PF_CACHE_TTL_MS);
    return payload;
  }

  const sevenDayHistory = sliceRecentDays(fullHistory, REQUIRED_HISTORY_DAYS["7d"]);
  const thirtyDayHistory = includeThirty ? fullHistory : null;

  let payload;
  try {
    const { systemPrompt, userPrompt } = buildProductPrompt({ sevenDayHistory, thirtyDayHistory });
    // Lowered temperature to reduce sampling randomness and make output
    // more reproducible given the same data (same rationale as Sales).
    const aiResult = await callGeminiJSON({ systemPrompt, userPrompt, temperature: 0.1 });

    payload = {
      sevenDay: normalizeProductHorizon(aiResult?.sevenDay, "7d"),
      thirtyDay: includeThirty
        ? normalizeProductHorizon(aiResult?.thirtyDay, "30d")
        : { ...emptyProductPayload("30d"), insufficientData: true, message: thirtyCheck.message },
    };
  } catch (err) {
    console.error("[ProductForecastService] Gemini forecast failed:", err.message);
    const failMessage = "Forecast generation failed. Will retry on next cron run.";
    payload = {
      sevenDay: { ...emptyProductPayload("7d"), insufficientData: true, message: failMessage },
      thirtyDay: {
        ...emptyProductPayload("30d"),
        insufficientData: true,
        message: includeThirty ? failMessage : thirtyCheck.message,
      },
    };
  }

  await AiCacheModel.upsert(PRODUCT_COMBINED_CACHE_KEY, payload, PF_CACHE_TTL_MS);
  return payload;
}

// Read-only lookup used by the frontend routes. Never calls Gemini.
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
  // Kept the same (timeframe, forceRefresh) signature — forceRefresh now
  // triggers the unified combined resolution above regardless of which
  // timeframe route called it, then reads back the requested horizon.
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

  // Explicit cron entry point — wire your cron job to call this ONCE
  // instead of hitting /product-forecast/7d?refresh=true AND
  // /product-forecast/30d?refresh=true separately (that would trigger
  // two separate combined-resolution runs, i.e. two Gemini calls for
  // no benefit).
  refreshProductForecast,
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

  const rawSeries = allDates.map((date) => {
    let sales = totalsByDate[date];
    if (date === todayStr && !sales) return { date, totalSales: null, isToday: true };
    return { date, totalSales: sales || 0, isToday: date === todayStr };
  });

  // OUTLIER GUARD: clamp freak days (a huge one-off bulk/event order, a
  // data-entry glitch) BEFORE this history reaches the forecasting
  // prompt, so it can't distort the recent-half-vs-earlier-half trend
  // comparison the prompt relies on. "today" (null placeholder) is left
  // untouched by winsorizeSeries automatically.
  const { adjusted, outlierCount } = winsorizeSeries(rawSeries.map((d) => d.totalSales));
  if (outlierCount > 0) {
    console.log(`[SalesForecastService] Outlier guard capped ${outlierCount} day(s) in the ${days}-day history window.`);
  }

  return rawSeries.map((d, i) => ({ ...d, totalSales: adjusted[i] }));
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
- NOTE: the historical data below has already had extreme outlier days (e.g. a single freak bulk order) capped to a reasonable bound. Treat the given numbers as authoritative — do not try to further discount, smooth, or "correct" them for outliers yourself.

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

// ------------------------------------------
// UNIFIED RESOLUTION (replaces per-timeframe generation)
// ------------------------------------------
// Instead of independently asking Gemini to forecast 7d AND 30d (two
// separate calls that can legitimately disagree on the same overlapping
// dates), we generate ONE series per cron run:
//   1. If there's enough history for a 30-day forecast, generate ONLY
//      that. The 7-day view is then just the first 7 entries of the
//      SAME array — so 7d and 30d can never contradict each other.
//   2. If 30-day history isn't sufficient but 7-day history is,
//      generate the 7-day forecast instead, and explicitly record why
//      30d isn't available (real reason, not a generic "no cache yet").
//   3. If neither has enough history, both are marked insufficient with
//      the real reason.
async function resolveSalesForecastTimeframe() {
  const thirtyCheck = await checkForecastDataSufficiency("30d");
  if (thirtyCheck.sufficient) {
    return { resolvedTimeframe: "30d", message: thirtyCheck.message };
  }

  const sevenCheck = await checkForecastDataSufficiency("7d");
  if (sevenCheck.sufficient) {
    return { resolvedTimeframe: "7d", thirtyDayMessage: thirtyCheck.message };
  }

  return { resolvedTimeframe: null, message: sevenCheck.message };
}

function insufficientSalesPayload(message) {
  return {
    chartData: [],
    insufficientData: true,
    message: message || "No cached forecast available. Awaiting Cron execution.",
  };
}

// Cron/refresh entry point. Call this ONCE per cron run (not once per
// timeframe route) — it decides internally which single forecast is
// worth generating and writes the appropriate cache keys.
async function refreshSalesForecast() {
  const resolution = await resolveSalesForecastTimeframe();

  if (!resolution.resolvedTimeframe) {
    const payload = insufficientSalesPayload(resolution.message);
    // Neither timeframe has enough history — write the real reason to
    // BOTH keys so reads never show a stale/generic "awaiting cron"
    // message when the true cause is insufficient history.
    await Promise.all([
      AiCacheModel.upsert(buildSalesCacheKey("30d"), payload, SF_CACHE_TTL_MS),
      AiCacheModel.upsert(buildSalesCacheKey("7d"), payload, SF_CACHE_TTL_MS),
    ]);
    return payload;
  }

  const validTimeframe = resolution.resolvedTimeframe;
  const requiredDays = REQUIRED_HISTORY_DAYS[validTimeframe];
  const requestedDays = TIMEFRAME_DAYS[validTimeframe];

  let finalPayload;
  try {
    const historicalSales = await getRawSalesHistory(requiredDays);
    const { systemPrompt, userPrompt } = buildSalesPrompt(validTimeframe, historicalSales);

    // UPDATED: lowered temperature (0.4 -> 0.1) to reduce sampling
    // randomness and make output more reproducible given the same data.
    const aiResult = await callGeminiJSON({ systemPrompt, userPrompt, temperature: 0.1 });
    const payload = normalizeSalesPayload(aiResult, requestedDays);
    finalPayload = { ...payload, insufficientData: false };
  } catch (err) {
    console.error("[SalesForecastService] Gemini forecast failed:", err.message);
    finalPayload = insufficientSalesPayload("Forecast generation failed. Will retry on next cron run.");
  }

  await AiCacheModel.upsert(buildSalesCacheKey(validTimeframe), finalPayload, SF_CACHE_TTL_MS);

  // If we only resolved 7d (30d truly isn't ready yet), record the real
  // reason under the 30d key too, instead of leaving it to fall back to
  // a generic "awaiting cron" message on read.
  if (validTimeframe === "7d") {
    await AiCacheModel.upsert(
      buildSalesCacheKey("30d"),
      insufficientSalesPayload(resolution.thirtyDayMessage),
      SF_CACHE_TTL_MS
    );
  } else {
    // validTimeframe === "30d": also keep the standalone "7d" cache key
    // in sync (sliced from this same 30d result), instead of leaving it
    // untouched. Previously we relied entirely on read-time derivation
    // (getSalesForecastRead / getForecastAvailability) to paper over the
    // untouched key — but that left a visibly stale row sitting in
    // ai_cache indefinitely, and anything reading sales_forecast:7d
    // directly (bypassing the derivation helpers) would see old data.
    // Writing it here means there is no stale copy left anywhere after
    // a 30d refresh.
    await AiCacheModel.upsert(
      buildSalesCacheKey("7d"),
      { chartData: finalPayload.chartData.slice(0, 7), insufficientData: finalPayload.insufficientData },
      SF_CACHE_TTL_MS
    );
  }

  return finalPayload;
}

// Read-only lookup used by the frontend routes. Never calls Gemini.
async function getSalesForecastRead(timeframe) {
  const validTimeframe = TIMEFRAME_DAYS[timeframe] ? timeframe : "30d";

  if (validTimeframe === "30d") {
    const cached = await AiCacheModel.getByKey(buildSalesCacheKey("30d"));
    if (cached?.payload && !cached.payload.insufficientData && cached.payload.chartData?.length) {
      return { chartData: cached.payload.chartData, insufficientData: false };
    }
    return insufficientSalesPayload(cached?.payload?.message);
  }

  // "7d": prefer deriving from the 30d cache — same source array as the
  // 30d view, so the two views can never disagree on overlapping dates.
  const thirtyCached = await AiCacheModel.getByKey(buildSalesCacheKey("30d"));
  if (thirtyCached?.payload && !thirtyCached.payload.insufficientData && thirtyCached.payload.chartData?.length >= 7) {
    return { chartData: thirtyCached.payload.chartData.slice(0, 7), insufficientData: false };
  }

  const sevenCached = await AiCacheModel.getByKey(buildSalesCacheKey("7d"));
  if (sevenCached?.payload && !sevenCached.payload.insufficientData && sevenCached.payload.chartData?.length) {
    return { chartData: sevenCached.payload.chartData, insufficientData: false };
  }

  return insufficientSalesPayload(sevenCached?.payload?.message || thirtyCached?.payload?.message);
}

const SalesForecastService = {
  // Kept the same (timeframe, forceRefresh) signature so the existing
  // routes/controller don't need to change shape. The difference is
  // internal: forceRefresh now triggers the UNIFIED resolution above
  // (regardless of which timeframe route called it), then reads back
  // whatever the requested timeframe should display.
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

  // Explicit cron entry point — prefer wiring your cron job to call this
  // directly (once) instead of hitting both /sales-forecast/7d?refresh=true
  // and /sales-forecast/30d?refresh=true (which would just run the same
  // unified resolution twice and waste a Gemini call).
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