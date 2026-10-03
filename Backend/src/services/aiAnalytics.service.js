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

// Ang laki ng trend/level window ng Sales at Product Forecast ay nasa
// FORECAST_MODEL (SHARED ENGINE) — iisang config para sa dalawa.

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
//   - "7d" forecasts require at least 120 days (~4 months) of history.
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
// SHARED: DETERMINISTIC FORECAST ENGINE (SALES + PRODUCT)
// ==========================================
// Ang Sales Forecast at Product Forecast ay gumagamit na ng IISANG paraan
// at IISANG set ng constants (FORECAST_MODEL sa baba). Wala nang Gemini sa
// pagkuwenta ng forecast — code na ang nagku-compute, kaya:
//   - pareho ang resulta sa tuwing tatakbo para sa parehong data,
//   - makikita (at masusubukan) ang bawat hakbang,
//   - at masusukat ang accuracy sa pamamagitan ng backtest (sa baba).
//
// METHOD (per series — total sales ng shop, o benta ng isang produkto):
//   1. OUTLIER GUARD: i-clamp (winsorize) ang mga freak na araw, PERO
//      ikinukumpara lang ang araw sa kapareho niyang weekday (Lunes vs
//      Lunes), para hindi mawala ang totoong weekend/holiday peak.
//   2. LEVEL: average kada araw sa huling `levelWindowDays`.
//   3. WEEKDAY INDEX: average ng bawat weekday ÷ overall average, sa buong
//      history window (120d para sa 7d, 180d para sa 30d).
//   4. TREND: huling `trendWindowDays` vs ang `trendWindowDays` bago nito,
//      na i-clamp (0.7–1.3) at i-damp (50%) para hindi ma-overreact sa
//      isang magandang/pangit na linggo.
//   5. FORECAST(araw k) = level × weekdayIndex × (1 + (trendFactor−1) × k/H)
//
// Para sa 7d: level 28 araw, trend 7 vs 7. Para sa 30d: level 56 araw,
// trend 28 vs 28 (buong linggo — para hindi mabias ang weekday mix ng
// dalawang window).
const MANILA_TZ = "Asia/Manila";
const manilaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FORECAST_MODEL = {
  levelWindowDays: { "7d": 28, "30d": 56 },
  trendWindowDays: { "7d": 7, "30d": 28 },
  trendDamping: 0.5,
  trendClamp: { min: 0.7, max: 1.3 },
  minWeekdaySamples: 4,
  backtest: {
    minTrainDays: 56,
    maxOrigins: { "7d": 12, "30d": 4 },
    originStepDays: 7,
    minPairsForRange: 14,
    rangeLowerQuantile: 0.1,
    rangeUpperQuantile: 0.9,
  },
};

// Sales: ilang araw na may benta ang kailangan sa loob ng history window
// bago mag-forecast (hindi lang "may isang order noon").
const SALES_MIN_ACTIVE_DAYS = { "7d": 30, "30d": 60 };

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
    minUnitsRecent: 3,        // units sa huling levelWindowDays
    minAbsChange: 2,          // units — pinakamaliit na diff na papasok sa GROWTH list
    minPctChange: 0,          // walang minimum % (growth)
    // FIX: dati, "at risk" ay literal na `diff < 0` LANG, kasabay pa ng
    // parehong minAbsChange/minPctChange gate na ginagamit ng growth list.
    // Problema: kapag palaging tumataas ang kabuuang volume (lumalaki ang
    // negosyo / papasok pa lang ang mga bagong produkto), halos hindi na
    // mangyari ang literal na pagbaba kahit stagnant/malumanay na lang
    // ang isang produkto — kaya laging walang laman ang risk list kahit
    // marami nang "sumasama" na produkto. riskPctCeiling ay nagbubukas ng
    // risk sa kahit anong produktong ang forecasted na pagbabago (pct) ay
    // mababa pa o katumbas lang ng ceiling na ito — kasama na rin ang mga
    // halos walang laki (stagnant), hindi lang literal na dip.
    riskPctCeiling: 5,
    seasonalityMinActiveDays: 20,
  },
  "30d": {
    minDaysSinceFirstSale: 14,
    minActiveDays: 2,
    minUnitsRecent: 3,
    minAbsChange: 2,
    minPctChange: 0,
    riskPctCeiling: 5,
    seasonalityMinActiveDays: 40,
  },
};
const PRODUCT_LIST_MAX = 5;

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

function weekdayOfKey(key) {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

function formatForecastLabel(key) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function buildFutureDateKeys(todayKey, count) {
  return Array.from({ length: count }, (_, i) => addDaysToKey(todayKey, i));
}

// Kumpletong mga araw lang ang gagamitin sa training: mula `days` araw
// ang nakalipas HANGGANG KAHAPON (Manila). Hindi kasama ang "ngayon"
// dahil hindi pa tapos ang araw — ang kalahating araw ay magmumukhang
// biglang pagbaba ng benta.
function getManilaHistoryWindow(days) {
  const todayKey = toManilaDateKey(new Date());
  const endKey = addDaysToKey(todayKey, -1);
  const startKey = addDaysToKey(endKey, -(days - 1));
  return {
    todayKey,
    dateKeys: Array.from({ length: days }, (_, i) => addDaysToKey(startKey, i)),
    startISO: new Date(`${startKey}T00:00:00+08:00`).toISOString(),
    endISO: new Date(`${endKey}T23:59:59.999+08:00`).toISOString(),
  };
}

const sumOf = (arr) => arr.reduce((a, b) => a + b, 0);
const meanOf = (arr) => (arr.length ? sumOf(arr) / arr.length : 0);
const round1 = (n) => Math.round(n * 10) / 10;

// ---------- Step 1: outlier guard, per weekday ----------
// Series: [{ date, value }]. Hinahambing ang bawat araw sa kapareho niyang
// weekday lang. Ginagamit ang winsorizeSeries (IQR) sa bawat weekday group.
function winsorizeByWeekday(series) {
  const groups = Array.from({ length: 7 }, () => []);
  series.forEach((point, i) => groups[weekdayOfKey(point.date)].push(i));

  const adjusted = series.map((p) => p.value);
  let outlierCount = 0;
  for (const indexes of groups) {
    const { adjusted: groupAdjusted, outlierCount: c } = winsorizeSeries(indexes.map((i) => series[i].value));
    outlierCount += c;
    indexes.forEach((seriesIndex, k) => { adjusted[seriesIndex] = groupAdjusted[k]; });
  }
  return { adjusted, outlierCount };
}

function getModelOptions(horizonKey) {
  return {
    levelWindow: FORECAST_MODEL.levelWindowDays[horizonKey],
    trendWindow: FORECAST_MODEL.trendWindowDays[horizonKey],
    useSeasonality: true,
  };
}

// ---------- Steps 2–5 ----------
// series: kumpletong araw, oldest -> newest.  futureDates: ['YYYY-MM-DD', ...]
// Wala itong ginagamit na data lampas sa dulo ng `series`, kaya ligtas
// itong gamitin sa backtest.
function runForecastModel(series, futureDates, { levelWindow, trendWindow, useSeasonality = true }) {
  const { adjusted, outlierCount } = winsorizeByWeekday(series);
  const n = adjusted.length;

  const level = meanOf(adjusted.slice(-Math.min(levelWindow, n)));

  let weekdayIndex = Array(7).fill(1);
  const overall = meanOf(adjusted);
  if (useSeasonality && overall > 0) {
    weekdayIndex = weekdayIndex.map((_, w) => {
      const values = adjusted.filter((_, i) => weekdayOfKey(series[i].date) === w);
      return values.length >= FORECAST_MODEL.minWeekdaySamples ? meanOf(values) / overall : 1;
    });
    const avgIndex = meanOf(weekdayIndex) || 1;
    weekdayIndex = weekdayIndex.map((x) => x / avgIndex);
  }

  let trendRatio = 1;
  if (n >= trendWindow * 2) {
    const recentAvg = meanOf(adjusted.slice(-trendWindow));
    const priorAvg = meanOf(adjusted.slice(-trendWindow * 2, -trendWindow));
    if (priorAvg > 0) trendRatio = recentAvg / priorAvg;
  }
  const { min, max } = FORECAST_MODEL.trendClamp;
  const clampedRatio = Math.min(max, Math.max(min, trendRatio));
  const trendFactor = 1 + (clampedRatio - 1) * FORECAST_MODEL.trendDamping;

  const horizon = futureDates.length;
  const values = futureDates.map((dateKey, k) => {
    const ramp = (k + 1) / horizon;
    const multiplier = 1 + (trendFactor - 1) * ramp;
    return Math.max(0, level * weekdayIndex[weekdayOfKey(dateKey)] * multiplier);
  });

  return {
    values,
    meta: {
      level: Math.round(level * 100) / 100,
      trendRatio: Math.round(trendRatio * 1000) / 1000,
      trendFactor: Math.round(trendFactor * 1000) / 1000,
      weekdayIndex: Object.fromEntries(WEEKDAY_NAMES.map((name, w) => [name, Math.round(weekdayIndex[w] * 100) / 100])),
      outliersCapped: outlierCount,
    },
  };
}

// ---------- Backtest (accuracy measure) ----------
// "Rolling origin": ibinabalik sa nakaraan, forecast gamit LANG ang data
// bago ang puntong iyon, tapos ikinukumpara sa totoong nangyari. Ikinukumpara
// rin sa simpleng baseline (kaparehong weekday noong nakaraang linggo) —
// kung hindi natatalo ng model ang baseline, hindi ito nakakatulong.
function backtestSeriesModel(series, horizonKey, opts) {
  const horizon = TIMEFRAME_DAYS[horizonKey];
  const { minTrainDays, maxOrigins, originStepDays } = FORECAST_MODEL.backtest;
  const n = series.length;
  const pairs = [];
  let origins = 0;

  for (let j = 0; j < maxOrigins[horizonKey]; j++) {
    const originEnd = n - horizon - originStepDays * j;
    if (originEnd < minTrainDays) break;

    const train = series.slice(0, originEnd);
    const test = series.slice(originEnd, originEnd + horizon);
    const { values } = runForecastModel(train, test.map((p) => p.date), opts);

    test.forEach((point, k) => {
      const baselineIndex = originEnd + k - 7 * Math.ceil((k + 1) / 7);
      pairs.push({ actual: point.value, forecast: values[k], baseline: series[baselineIndex].value });
    });
    origins += 1;
  }

  return { pairs, origins };
}

function summarizeBacktestPairs(pairs, origins) {
  const totalActual = sumOf(pairs.map((p) => p.actual));
  if (!pairs.length || totalActual <= 0) return null;

  const wape = sumOf(pairs.map((p) => Math.abs(p.actual - p.forecast))) / totalActual;
  const baselineWape = sumOf(pairs.map((p) => Math.abs(p.actual - p.baseline))) / totalActual;
  const bias = (sumOf(pairs.map((p) => p.forecast)) - totalActual) / totalActual;

  return {
    wapePct: round1(wape * 100),               // average error (mas mababa = mas maganda)
    baselineWapePct: round1(baselineWape * 100),
    biasPct: round1(bias * 100),               // + = sobra ang forecast, − = kulang
    beatsBaseline: wape <= baselineWape,
    sampleDays: pairs.length,
    origins,
  };
}

// Range (hal. "₱3,000–5,000") mula sa AKTWAL na mga error ng backtest,
// hindi hula-hula: P10 at P90 ng (actual − forecast).
function computeResidualBand(pairs) {
  const { minPairsForRange, rangeLowerQuantile, rangeUpperQuantile } = FORECAST_MODEL.backtest;
  if (pairs.length < minPairsForRange) return null;
  const residuals = pairs.map((p) => p.actual - p.forecast).sort((a, b) => a - b);
  return {
    low: computePercentile(residuals, rangeLowerQuantile),
    high: computePercentile(residuals, rangeUpperQuantile),
  };
}

// ---------- Method summary na ipinapakita/ina-save kasama ng forecast ----------
function describeForecastMethod(horizonKey, historyDays, meta) {
  return {
    type: "weekday-seasonal level + damped trend (computed in code, no AI)",
    historyDays,
    levelWindowDays: FORECAST_MODEL.levelWindowDays[horizonKey],
    trendWindowDays: FORECAST_MODEL.trendWindowDays[horizonKey],
    trendDamping: FORECAST_MODEL.trendDamping,
    ...(meta || {}),
  };
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
// 2. PRODUCT FORECAST SERVICE (CODE-COMPUTED, SAME RULES AS SALES)
// ==========================================
// Parehong engine, parehong history window, parehong level/trend window
// sa Sales Forecast (tingnan ang FORECAST_MODEL at REQUIRED_HISTORY_DAYS):
//   - 7d  -> 120 araw na history, level 28d, trend 7d vs 7d
//   - 30d -> 180 araw na history, level 56d, trend 28d vs 28d
// Wala nang 14-day / 60-day "mini window" na hiwalay sa sales.
//
// Ang "pct" at "diff" ay kinukumpara na ngayon sa PANTAY NA HABA:
//   recentQty = aktwal na units na naibenta sa HULING 7 (o 30) na araw
//   forecast  = projected units sa SUSUNOD NA 7 (o 30) na araw
// (Dati: forecast ng 7 araw laban sa sum ng 14 na araw — kaya halos lahat
// ng produkto ay lumalabas na "bumababa".)
const PF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PF_TIMEFRAME_LABELS = { "7d": "Next 7 Days", "30d": "Next 30 Days" };
const PRODUCT_COMBINED_CACHE_KEY = "product_forecast:combined";
const SUPABASE_DEFAULT_ROW_CAP = 1000;

// Supabase/PostgREST pinuputol ang resulta sa 1000 rows. Ang Sales Forecast ay
// 1 row kada ORDER kaya kasya; ang Product Forecast ay 1 row kada ORDER ITEM
// (mas marami ng ilang beses) kaya sa 180 araw ay lumalampas sa cap at
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

// Daily units kada produkto (Manila dates), mula KAHAPON pabalik. Ang
// bilang ay nagsisimula sa FIRST SALE ng produkto — hindi nilalagyan ng 0
// ang mga araw bago pa ito lumabas, kaya hindi nasisira ang average ng
// bagong produkto.
async function getProductDailySeries(days) {
  const { dateKeys, startISO, endISO, todayKey } = getManilaHistoryWindow(days);

  const items = await fetchRangeUncapped(
    (from, to) => OrderItemsModel.getByOrderDateRange(from, to, {
      columns: `quantity, products ( name, category ), orders!inner ( created_at, status )`,
      excludeCancelled: true,
    }),
    startISO,
    endISO
  );
  console.log(`[ProductForecastService] Fetched ${items.length} order-item rows for ${days}-day window.`);

  if (items.length > 0 && items.length % SUPABASE_DEFAULT_ROW_CAP === 0) {
    console.warn(`[ProductForecastService] Query returned exactly ${items.length} rows — baka naputol ng row limit ang history. I-check ang pagination ng OrderItemsModel.getByOrderDateRange.`);
  }

  const byProduct = {};
  for (const row of items) {
    const createdAt = row.orders?.created_at;
    if (!createdAt) continue;

    const name = row.products?.name || "Unknown Product";
    const category = row.products?.category || "Uncategorized";
    const key = `${name}|||${category}`;
    const day = toManilaDateKey(createdAt);

    if (!byProduct[key]) byProduct[key] = { productName: name, category, qtyByDate: {} };
    byProduct[key].qtyByDate[day] = (byProduct[key].qtyByDate[day] || 0) + Number(row.quantity || 0);
  }

  const products = Object.values(byProduct)
    .map((p) => {
      const full = dateKeys.map((date) => ({ date, value: p.qtyByDate[date] || 0 }));
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
  const levelWindow = FORECAST_MODEL.levelWindowDays[horizonKey];

  if (series.length < rules.minDaysSinceFirstSale) return false;
  if (series.filter((p) => p.value > 0).length < rules.minActiveDays) return false;

  const recentUnits = sumOf(series.slice(-levelWindow).map((p) => p.value));
  return recentUnits >= rules.minUnitsRecent;
}

// Forecast ng isang produkto para sa isang horizon.
function forecastOneProduct(series, horizonKey, futureDates) {
  const horizon = TIMEFRAME_DAYS[horizonKey];
  const rules = PRODUCT_FORECAST_RULES[horizonKey];
  const activeDays = series.filter((p) => p.value > 0).length;

  const { values } = runForecastModel(series, futureDates, {
    ...getModelOptions(horizonKey),
    // Kalat-kalat ang benta ng produkto -> magulo ang weekday pattern,
    // kaya flat ang weekday index kapag kulang ang araw na may benta.
    useSeasonality: activeDays >= rules.seasonalityMinActiveDays,
  });

  const forecast = Math.round(sumOf(values));
  const recentQty = sumOf(series.slice(-horizon).map((p) => p.value));
  const diff = forecast - recentQty;
  const pct = recentQty > 0 ? Math.round((diff / recentQty) * 100) : null;

  return { forecast, recentQty, diff, pct };
}

function isMeaningfulChange(result, horizonKey) {
  const rules = PRODUCT_FORECAST_RULES[horizonKey];
  return result.pct !== null
    && Math.abs(result.diff) >= rules.minAbsChange
    && Math.abs(result.pct) >= rules.minPctChange;
}

// Backtest para sa product lists: gaano kalapit ang forecast na total
// units sa totoong nangyari, at TAMA BA ANG DIREKSYON ng mga produktong
// nilagay sa growth/risk (directionHitPct).
function backtestProductHorizon(products, horizonKey) {
  const horizon = TIMEFRAME_DAYS[horizonKey];
  const rules = PRODUCT_FORECAST_RULES[horizonKey];
  const { maxOrigins, originStepDays } = FORECAST_MODEL.backtest;

  let totalActual = 0;
  let totalError = 0;
  let totalBaselineError = 0;
  let samples = 0;
  let flagged = 0;
  let directionHits = 0;

  for (let j = 0; j < maxOrigins[horizonKey]; j++) {
    for (const product of products) {
      const originEnd = product.series.length - horizon - originStepDays * j;
      if (originEnd < rules.minDaysSinceFirstSale) continue;

      const train = product.series.slice(0, originEnd);
      const test = product.series.slice(originEnd, originEnd + horizon);
      if (test.length < horizon || !isProductEligible(train, horizonKey)) continue;

      const result = forecastOneProduct(train, horizonKey, test.map((p) => p.date));
      const actual = sumOf(test.map((p) => p.value));

      totalActual += actual;
      totalError += Math.abs(result.forecast - actual);
      totalBaselineError += Math.abs(result.recentQty - actual); // baseline: "uulitin lang ang nakaraang linggo/buwan"
      samples += 1;

      if (isMeaningfulChange(result, horizonKey)) {
        flagged += 1;
        const actualDiff = actual - result.recentQty;
        if (actualDiff !== 0 && Math.sign(actualDiff) === Math.sign(result.diff)) directionHits += 1;
      }
    }
  }

  if (!samples || totalActual <= 0) return null;

  return {
    wapePct: round1((totalError / totalActual) * 100),
    baselineWapePct: round1((totalBaselineError / totalActual) * 100),
    beatsBaseline: totalError <= totalBaselineError,
    directionHitPct: flagged ? round1((directionHits / flagged) * 100) : null,
    flaggedChecks: flagged,
    sampleCount: samples,
  };
}

function productInsufficientPart(timeframe, message) {
  return { ...emptyProductPayload(timeframe), insufficientData: true, message };
}

function emptyProductPayload(timeframe) {
  return { label: PF_TIMEFRAME_LABELS[timeframe] || PF_TIMEFRAME_LABELS["30d"], growth: [], risk: [] };
}

function buildProductHorizonPayload(products, horizonKey, todayKey) {
  const horizon = TIMEFRAME_DAYS[horizonKey];
  const rules = PRODUCT_FORECAST_RULES[horizonKey];
  const historyDays = REQUIRED_HISTORY_DAYS[horizonKey];

  // Parehong history window ng Sales Forecast para sa horizon na ito.
  const scoped = products
    .map((p) => ({ ...p, series: p.series.slice(-historyDays) }))
    .filter((p) => p.series.length > 0);
  const eligible = scoped.filter((p) => isProductEligible(p.series, horizonKey));

  // DIAGNOSTIC LOG (walang epekto sa forecast): ipakita kung bakit pumasa/bagsak
  // ang bawat produkto, para makita kung aling rule ang humaharang.
  {
    const lw = FORECAST_MODEL.levelWindowDays[horizonKey];
    const rows = scoped
      .map((p) => {
        const days = p.series.length;
        const active = p.series.filter((x) => x.value > 0).length;
        const recent = sumOf(p.series.slice(-lw).map((x) => x.value));
        const fails = [];
        if (days < rules.minDaysSinceFirstSale) fails.push(`days ${days}<${rules.minDaysSinceFirstSale}`);
        if (active < rules.minActiveDays) fails.push(`active ${active}<${rules.minActiveDays}`);
        if (recent < rules.minUnitsRecent) fails.push(`recent ${recent}<${rules.minUnitsRecent}`);
        return { name: p.productName, total: sumOf(p.series.map((x) => x.value)), days, active, recent, fails };
      })
      .sort((a, b) => b.total - a.total);
    console.log(`[ProductForecastService][${horizonKey}] ${eligible.length}/${scoped.length} products eligible. Top 15 by units:`);
    for (const r of rows.slice(0, 15)) {
      console.log(`  - ${r.name}: total=${r.total}, daysSinceFirstSale=${r.days}, activeDays=${r.active}, recentUnits=${r.recent} -> ${r.fails.length ? 'FAIL (' + r.fails.join(', ') + ')' : 'OK'}`);
    }
  }

  if (eligible.length === 0) {
    return productInsufficientPart(
      horizonKey,
      `No product has enough sales history yet for a ${horizon}-day trend (needs ${rules.minDaysSinceFirstSale}+ days since first sale, ${rules.minActiveDays}+ days with sales, and ${rules.minUnitsRecent}+ units recently).`
    );
  }

  const futureDates = buildFutureDateKeys(todayKey, horizon);
  const results = eligible.map((p) => ({
    name: p.productName,
    ...forecastOneProduct(p.series, horizonKey, futureDates),
  }));

  const toListItem = (r) => ({ name: r.name, pct: r.pct, diff: r.diff, forecast: r.forecast, recentQty: r.recentQty });

  const growth = results
    .filter((r) => r.diff > 0 && isMeaningfulChange(r, horizonKey))
    .sort((a, b) => b.diff - a.diff)
    .slice(0, PRODUCT_LIST_MAX)
    .map(toListItem);

  // FIX: "at risk" ay hindi na nangangailangan ng literal na pagbaba
  // (diff < 0) kasabay pa ng mahigpit na meaningful-change gate — kasama
  // na ngayon ang kahit anong eligible na produkto na ang forecasted %
  // na pagbabago ay nasa (o mas mababa sa) riskPctCeiling, declining man
  // o halos-walang-laki (stagnant) lang. Hindi dumadaan sa parehong
  // isMeaningfulChange minAbsChange gate dahil karamihan sa mga
  // "stagnant" na produkto ay maliit talaga ang diff — kung ipipilit ang
  // parehong gate, mawawala rin sila sa risk list, bumabalik lang tayo
  // sa dating problema.
  const risk = results
    .filter((r) => r.pct !== null && r.pct <= rules.riskPctCeiling)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, PRODUCT_LIST_MAX)
    .map(toListItem);

  console.log(`[ProductForecastService][${horizonKey}] growth=${growth.length} (diff>0 & meaningful: >=${rules.minAbsChange} units & >=${rules.minPctChange}%), risk=${risk.length} (pct<=${rules.riskPctCeiling}%)`);

  return {
    label: PF_TIMEFRAME_LABELS[horizonKey],
    growth,
    risk,
    insufficientData: false,
    generatedAt: new Date().toISOString(),
    eligibleProducts: eligible.length,
    skippedProducts: scoped.length - eligible.length,
    accuracy: backtestProductHorizon(scoped, horizonKey),
    method: {
      type: "recent run-rate + weekday shape + damped trend (computed in code, no AI)",
      historyDays,
      levelWindowDays: FORECAST_MODEL.levelWindowDays[horizonKey],
      trendWindowDays: FORECAST_MODEL.trendWindowDays[horizonKey],
      trendDamping: FORECAST_MODEL.trendDamping,
      rules,
      comparison: `forecast of next ${horizon} days vs actual units sold in the last ${horizon} days`,
    },
  };
}

// Cron/refresh entry point — wala nang Gemini call dito. Pareho pa rin ang
// gating (7d / 30d sufficiency) at ang cache key/shape na binabasa ng
// frontend at ng Recommendations.
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
  const fetchDays = includeThirty ? REQUIRED_HISTORY_DAYS["30d"] : REQUIRED_HISTORY_DAYS["7d"];

  let payload;
  try {
    const { products, todayKey } = await getProductDailySeries(fetchDays);

    if (products.length === 0) {
      const noActivityMessage = "No product sales activity found in the historical window.";
      payload = {
        sevenDay: productInsufficientPart("7d", noActivityMessage),
        thirtyDay: productInsufficientPart("30d", includeThirty ? noActivityMessage : thirtyCheck.message),
      };
    } else {
      payload = {
        sevenDay: buildProductHorizonPayload(products, "7d", todayKey),
        thirtyDay: includeThirty
          ? buildProductHorizonPayload(products, "30d", todayKey)
          : productInsufficientPart("30d", thirtyCheck.message),
      };
    }
  } catch (err) {
    console.error("[ProductForecastService] Forecast computation failed:", err.message);
    const failMessage = "Forecast generation failed. Will retry on next cron run.";
    payload = {
      sevenDay: productInsufficientPart("7d", failMessage),
      thirtyDay: productInsufficientPart("30d", includeThirty ? failMessage : thirtyCheck.message),
    };
  }

  await AiCacheModel.upsert(PRODUCT_COMBINED_CACHE_KEY, payload, PF_CACHE_TTL_MS);
  return payload;
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
// 3. SALES FORECAST SERVICE (CODE-COMPUTED, SAME ENGINE AS PRODUCT)
// ==========================================
// Dating "TRUE ARIMA" ang label pero Gemini ang nagku-kuwenta ng numero.
// Ngayon, ang forecast ay kinukuwenta ng runForecastModel() (tingnan ang
// SHARED ENGINE) at may kasamang:
//   - accuracy  : backtest laban sa aktwal na nangyari + simpleng baseline
//   - lower/upper: range mula sa aktwal na error ng backtest
//   - method    : mga parametro/numero na ginamit (level, trend, weekday index)
// Ang 7d at 30d ay parehong native na kinukuwenta gamit ang sarili nilang
// history/level/trend windows (kapareho ng Product Forecast), kaya maaaring
// bahagyang magkaiba ang magkakapatong na petsa nila — sinadya 'yon.
const SF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function buildSalesCacheKey(timeframe) {
  return `sales_forecast:${timeframe}`;
}

// amount_paid (aktwal na natanggap na bayad) — parehong basehan ng KPI at
// Performance Summary. Manila dates, kumpletong araw lang (hanggang kahapon),
// at nagsisimula sa unang araw na may benta ang shop.
async function getSalesDailySeries(days) {
  const { dateKeys, startISO, endISO, todayKey } = getManilaHistoryWindow(days);

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

  const full = dateKeys.map((date) => ({ date, value: totalsByDate[date] || 0 }));
  const firstSaleIndex = full.findIndex((p) => p.value > 0);
  return { series: firstSaleIndex === -1 ? [] : full.slice(firstSaleIndex), todayKey };
}

function insufficientSalesPayload(message) {
  return {
    chartData: [],
    insufficientData: true,
    message: message || "No cached forecast available. Awaiting Cron execution.",
  };
}

function buildSalesHorizonPayload(series, horizonKey, todayKey) {
  const horizon = TIMEFRAME_DAYS[horizonKey];
  const historyDays = REQUIRED_HISTORY_DAYS[horizonKey];
  const history = series.slice(-historyDays);

  const activeDays = history.filter((p) => p.value > 0).length;
  const requiredActive = SALES_MIN_ACTIVE_DAYS[horizonKey];
  if (activeDays < requiredActive) {
    return insufficientSalesPayload(
      `Not enough sales activity yet — only ${activeDays} day(s) with sales in the last ${historyDays} days (a ${horizon}-day forecast needs at least ${requiredActive}).`
    );
  }

  const opts = getModelOptions(horizonKey);
  const futureDates = buildFutureDateKeys(todayKey, horizon);
  const { values, meta } = runForecastModel(history, futureDates, opts);

  const { pairs, origins } = backtestSeriesModel(history, horizonKey, opts);
  const accuracy = summarizeBacktestPairs(pairs, origins);
  const band = computeResidualBand(pairs);

  const chartData = futureDates.map((date, i) => {
    const forecastSales = Math.round(values[i]);
    return {
      date,
      label: formatForecastLabel(date),
      isToday: i === 0,
      forecastSales,
      lower: band ? Math.max(0, Math.round(forecastSales + band.low)) : null,
      upper: band ? Math.round(forecastSales + band.high) : null,
    };
  });

  return {
    chartData,
    insufficientData: false,
    generatedAt: new Date().toISOString(),
    accuracy,
    method: describeForecastMethod(horizonKey, history.length, meta),
  };
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
  const fetchDays = includeThirty ? REQUIRED_HISTORY_DAYS["30d"] : REQUIRED_HISTORY_DAYS["7d"];

  let sevenPayload;
  let thirtyPayload;
  try {
    const { series, todayKey } = await getSalesDailySeries(fetchDays);
    sevenPayload = buildSalesHorizonPayload(series, "7d", todayKey);
    thirtyPayload = includeThirty
      ? buildSalesHorizonPayload(series, "30d", todayKey)
      : insufficientSalesPayload(thirtyCheck.message);
  } catch (err) {
    console.error("[SalesForecastService] Forecast computation failed:", err.message);
    const failed = insufficientSalesPayload("Forecast generation failed. Will retry on next cron run.");
    sevenPayload = failed;
    thirtyPayload = includeThirty ? failed : insufficientSalesPayload(thirtyCheck.message);
  }

  await Promise.all([
    AiCacheModel.upsert(buildSalesCacheKey("7d"), sevenPayload, SF_CACHE_TTL_MS),
    AiCacheModel.upsert(buildSalesCacheKey("30d"), thirtyPayload, SF_CACHE_TTL_MS),
  ]);

  return includeThirty ? thirtyPayload : sevenPayload;
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