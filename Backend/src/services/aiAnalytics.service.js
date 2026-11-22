import { OrdersModel } from "../model/orders.model.js";
import { OrderItemsModel } from "../model/orderItems.model.js";
import { InventoryLogModel as InventoryLogsModel } from "../model/inventoryLog.model.js";
import { WasteLogsModel } from "../model/wasteLogs.model.js";
import { AiCacheModel } from "../model/AiCache.model.js";
import { RecipeModel } from "../model/recipe.model.js";
import { IngredientModel } from "../model/ingredient.model.js";
import { MaterialModel } from "../model/material.model.js";

import { callGeminiJSON } from "../utils/analytics/geminiForecast.util.js";
import { getLookbackDateRange } from "../utils/analytics/ForecastTimeframe.utils.js";
import { getDateRange } from "../utils/analytics/PerformancetTimeframeHelper.utils.js";

const TIMEFRAME_DAYS = { "30d": 30 };

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
// back at least 60 calendar days from "now" — not just this many days'
// worth of transactions, but real elapsed days.
// If the requirement isn't met, the caller must skip Gemini entirely,
// skip the cache write entirely, and effectively no-op the cron run.
// NOTE: ang 60 na ito ay lookback window na lang ng Actionable Recommendations
// (hindi ginalaw). Ang Sales at Product FORECAST ay gumagamit na ng
// FORECAST_HISTORY_DAYS sa baba.
const REQUIRED_HISTORY_DAYS = { "30d": 60 };

// ==========================================
// FORECAST: HOLT-WINTERS + FULL HISTORY (MIN 90 DAYS)
// ==========================================
// Ang Sales Forecast at Product Forecast ay parehong:
//   - nangangailangan ng at least 90 araw na history bago mag-forecast
//     (gate bago tumawag kay Gemini o sumulat sa cache), at
//   - ipinapadala kay Gemini ang BUONG history (mula sa unang araw na may
//     benta hanggang kahapon, Asia/Manila), daily aggregated, at ang araw na
//     walang benta ay 0. Walang 90-day cap sa data.
// Ang FORECAST_HISTORY_DAYS ay MINIMUM na history na kailangan bago mag-forecast
// (hindi window size).
const FORECAST_HISTORY_DAYS = { "30d": 90 };

// Ang forecasting algorithm na INAATAS kay Gemini. Additive ang seasonality
// at trend dahil may mga araw na 0 ang benta (hindi valid ang multiplicative
// kapag may zero). Period = 7 dahil weekly ang pattern ng daily data.
const HOLT_WINTERS_SPEC = {
  algorithm: "Holt-Winters (triple exponential smoothing: level + trend + seasonality)",
  seasonalPeriod: 7,
  trend: "additive",
  seasonality: "additive",
  initialization: "level, trend and the 7 seasonal indices from the first 14 days of the series",
  smoothing: "alpha, beta, gamma in (0,1) chosen to minimise one-step-ahead squared error over the whole series",
  forecastFormula: "forecast(h) = level + h * trend + seasonalIndex(weekday of that date)",
  floorAtZero: true,
  interval: "approx. 80% interval = forecast -/+ 1.28 x standard deviation of in-sample one-step residuals, lower bound floored at 0",
};

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
    dateColumn: "created_at",
  });

  return Array.isArray(priorOrders) && priorOrders.length > 0;
}

async function checkForecastDataSufficiency(timeframe) {
  const requiredDays = FORECAST_HISTORY_DAYS[timeframe] || FORECAST_HISTORY_DAYS["30d"];
  const label = "30-day";
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
// SHARED: STATISTICAL REFERENCE ENGINE (SALES + PRODUCT)
// ==========================================
// PAALALA: si Gemini na ang nag-aanalyze at nagfo-forecast ng Sales at Product
// Forecast (tingnan ang "SHARED: AI FORECAST GUARD" sa baba). Ang engine na
// ito ay HINDI na ang pinagmumulan ng forecast. Ginagamit na lang ito para sa:
//   - outlier guard (winsorizeByWeekday) ng data bago ipadala kay Gemini,
//   - reference statistics (level / trend / weekday index) na ibinibigay kay
//     Gemini bilang konteksto,
//   - sanity check ng sagot ni Gemini (total laban sa baseline),
//   - baseline accuracy (backtest) na reference lang.
//
// METHOD ng baseline (per series — total sales ng shop, o benta ng isang produkto):
//   1. OUTLIER GUARD: i-clamp (winsorize) ang mga freak na araw, PERO
//      ikinukumpara lang ang araw sa kapareho niyang weekday (Lunes vs
//      Lunes), para hindi mawala ang totoong weekend/holiday peak.
//   2. LEVEL: average kada araw sa huling `levelWindowDays`.
//   3. WEEKDAY INDEX: average ng bawat weekday ÷ overall average, sa buong
//      history (lahat ng available na araw).
//   4. TREND: huling `trendWindowDays` vs ang `trendWindowDays` bago nito,
//      na i-clamp (0.7–1.3) at i-damp (50%) para hindi ma-overreact sa
//      isang magandang/pangit na linggo.
//   5. FORECAST(araw k) = level × weekdayIndex × (1 + (trendFactor−1) × k/H)
//
// Para sa 30d: level 30 araw at trend 28 vs 28 (buong linggo — para
// hindi mabias ang weekday mix ng dalawang window).
const MANILA_TZ = "Asia/Manila";
const manilaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MANILA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FORECAST_MODEL = {
  // Sinukat sa backtest: 28/56 ay under-forecast ng ~23% (30d) kapag lumalaki ang
  // negosyo dahil laging mas luma ang level kaysa sa kinukumparang huling window.
  // 14/30 ang pinakabalanse. Pareho ito para sa Sales AT Product forecast.
  levelWindowDays: { "30d": 30 },
  trendWindowDays: { "30d": 28 },
  trendDamping: 0.5,
  trendClamp: { min: 0.7, max: 1.3 },
  minWeekdaySamples: 4,
  backtest: {
    minTrainDays: 35,
    maxOrigins: { "30d": 4 },
    originStepDays: 7,
    minPairsForRange: 14,
    rangeLowerQuantile: 0.1,
    rangeUpperQuantile: 0.9,
  },
};

// Sales: ilang araw na may benta ang kailangan sa loob ng history window
// bago mag-forecast (hindi lang "may isang order noon").
const SALES_MIN_ACTIVE_DAYS = { "30d": 30 };

// Product: bawat produkto ay dumadaan sa sarili niyang eligibility check.
// Hindi isinasama sa forecast ang produktong bago, kaunti ang benta, o
// kalat-kalat — dahil ingay lang ang lalabas na "+200%" mula sa 1→3 units.
const PRODUCT_FORECAST_RULES = {
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

// ---------- Step 1: outlier guard, per weekday (trend-aware) ----------
// Series: [{ date, value }]. Hinahambing ang bawat araw sa kapareho niyang
// weekday lang.
//
// FIX: dati, ang IQR bounds ay kinukuwenta mula sa MISMONG halaga ng buong
// history ng bawat weekday. Kapag lumalaki ang benta (o produkto), ang
// pinakabago at pinakamataas na halaga ang lumalampas sa upper bound at
// pinuputol bilang "outlier" — kaya ang tunay na paglaki ay binubura bago pa
// ma-forecast (walang growth na lumalabas, at ang tumataas na produkto ay
// lumalabas na "at risk"). Ngayon, ang ikinukumpara ay ang RATIO ng araw sa
// average ng mga katabing araw nito (hindi kasama ang sarili), kaya ang
// tuloy-tuloy na pag-akyat o pagbaba ay hindi na "outlier" — ang biglaang
// spike lang (hal. isang malaking event order) ang naka-cap.
const OUTLIER_TREND_WINDOW_DAYS = 14;

function winsorizeByWeekday(series) {
  const n = series.length;
  const raw = series.map((p) => p.value);
  const half = Math.floor(OUTLIER_TREND_WINDOW_DAYS / 2);

  // Local baseline ng bawat araw: average ng mga katabing araw, hindi kasama ang sarili.
  const baseline = raw.map((v, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
      if (j === i || !Number.isFinite(raw[j])) continue;
      sum += raw[j];
      count += 1;
    }
    return count ? sum / count : 0;
  });

  const groups = Array.from({ length: 7 }, () => []);
  series.forEach((point, i) => groups[weekdayOfKey(point.date)].push(i));

  const adjusted = [...raw];
  let outlierCount = 0;
  for (const indexes of groups) {
    // Kalat-kalat na series (halos puro 0): ang isang benta ay hindi "spike".
    // Parehong proteksyon ng dating bersyon — walang cap kapag zero ang IQR.
    if (!computeIqrBounds(indexes.map((i) => raw[i]).filter((v) => Number.isFinite(v)))) continue;

    const usable = indexes.filter((i) => Number.isFinite(raw[i]) && baseline[i] > 0);
    const bounds = computeIqrBounds(usable.map((i) => raw[i] / baseline[i]));
    if (!bounds) continue;

    for (const i of usable) {
      const ratio = raw[i] / baseline[i];
      if (ratio > bounds.upperBound) {
        adjusted[i] = Math.round(baseline[i] * bounds.upperBound);
        outlierCount += 1;
      } else if (ratio < bounds.lowerBound) {
        adjusted[i] = Math.max(0, Math.round(baseline[i] * bounds.lowerBound));
        outlierCount += 1;
      }
    }
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
    type: "Holt-Winters (additive trend, additive weekly seasonality, period 7) executed by Gemini AI over the full daily history (first sale date to yesterday; at least 90 days required) aggregated by the system (missing days = 0); statistical baseline kept only as a sanity reference",
    model: HOLT_WINTERS_SPEC,
    historyDays,
    minHistoryDays: FORECAST_HISTORY_DAYS[horizonKey],
    levelWindowDays: FORECAST_MODEL.levelWindowDays[horizonKey],
    trendWindowDays: FORECAST_MODEL.trendWindowDays[horizonKey],
    trendDamping: FORECAST_MODEL.trendDamping,
    ...(meta || {}),
  };
}

// ==========================================
// SHARED: AI FORECAST GUARD (GEMINI)
// ==========================================
// Si Gemini na ang nag-aanalyze at nagfo-forecast ng Sales at Product
// Forecast. Ang system ay:
//   1. GATEKEEPER — bago tumawag: sufficiency gate, per-product eligibility,
//      outlier cap, at bilang lang (petsa + amount/units + pangalan ng
//      produkto) ang ipinapadala. Walang customer info, order ID, o contact.
//   2. VALIDATOR — pagkatapos: tinitingnan ang sagot ni Gemini laban sa
//      shape, limits, at sa statistical baseline ng system. Hindi pumasa =
//      hindi isinusulat sa cache.
//   3. SAFETY NET — para hindi mag-loop at hindi lumampas sa token limit:
//      - ISANG Gemini call lang kada refresh. WALANG retry / "ulitin hanggang
//        tama" na loop dito, kahit invalid ang output.
//      - Kapag pumalya (error / timeout / invalid output / 429): cooldown na
//        lumalaki (15 min -> hanggang 3 oras; 1 oras kapag rate-limit).
//        Habang may cooldown, WALANG tawag kay Gemini.
//      - Single-flight: kapag may tumatakbong refresh na, sasabay lang ang
//        bagong tawag sa kasalukuyan — hindi gagawa ng pangalawang call.
//      - Prompt token budget: kapag lampas, binabawasan ang bilang ng produkto
//        (may hangganan), at kapag hindi pa rin kasya, hindi tatawag.
//      - Kapag pumalya, HINDI ino-overwrite ang huling magandang cache.
const AI_FORECAST_GUARD = {
  maxPromptTokens: 20000, // estimate (chars / 3) — sinadyang konserbatibo
  timeoutMs: 60 * 1000,
  maxOutputTokens: 4096, // forecast output ay maliit; cap para hindi kumain ng quota
  temperature: 0.2,
  cooldownMs: { normal: 15 * 60 * 1000, rateLimited: 60 * 60 * 1000, max: 3 * 60 * 60 * 1000 },
  minProductsInPrompt: 10,
  shrinkFactor: 0.75,
};

// Shared sa Sales at Product (iisang Gemini key/quota) — kapag pumalya ang
// isa, nagpapahinga rin ang isa.
const aiForecastState = { cooldownUntil: 0, consecutiveFailures: 0 };
// Invalid OUTPUT (hindi quota/API error) ay hindi dapat magpatigil sa ibang service,
// kaya hiwalay at maikli ang cooldown nito (per label).
const VALIDATION_COOLDOWN_MS = 5 * 60 * 1000;
const labelCooldownUntil = new Map();
const inFlightRefreshes = new Map();

function singleFlight(key, fn) {
  if (inFlightRefreshes.has(key)) return inFlightRefreshes.get(key);
  const promise = Promise.resolve()
    .then(fn)
    .finally(() => inFlightRefreshes.delete(key));
  inFlightRefreshes.set(key, promise);
  return promise;
}

const estimateTokens = (text) => Math.ceil(String(text || "").length / 3);

function isRateLimitError(err) {
  const msg = String(err?.message || "");
  return err?.status === 429
    || err?.code === 429
    || /\b429\b|quota|rate.?limit|RESOURCE_EXHAUSTED|too many requests/i.test(msg);
}

function registerAiForecastFailure(err) {
  const { normal, rateLimited, max } = AI_FORECAST_GUARD.cooldownMs;
  aiForecastState.consecutiveFailures += 1;
  const base = isRateLimitError(err) ? rateLimited : normal;
  const wait = Math.min(max, base * 2 ** (aiForecastState.consecutiveFailures - 1));
  aiForecastState.cooldownUntil = Date.now() + wait;
  console.error(
    `[AIForecast] Failure #${aiForecastState.consecutiveFailures}: ${err?.message} | ` +
    `Cooldown ${Math.round(wait / 60000)} min — walang retry hanggang matapos ito.`
  );
}

// ISANG tawag lang. `parseResult` ay tumatakbo sa loob ng guard, kaya ang
// invalid output ay binibilang din na failure (cooldown), hindi inuulit.
async function callGeminiForecastOnce(label, { systemPrompt, userPrompt, responseSchema }, parseResult) {
  const now = Date.now();
  const blockedUntil = Math.max(aiForecastState.cooldownUntil, labelCooldownUntil.get(label) || 0);
  if (now < blockedUntil) {
    const minsLeft = Math.ceil((blockedUntil - now) / 60000);
    throw new Error(`[${label}] Gemini on cooldown (~${minsLeft} min left) — skipped, walang tinawag.`);
  }

  const estTokens = estimateTokens(systemPrompt) + estimateTokens(userPrompt);
  if (estTokens > AI_FORECAST_GUARD.maxPromptTokens) {
    throw new Error(`[${label}] Prompt too large (~${estTokens} tokens > ${AI_FORECAST_GUARD.maxPromptTokens}) — skipped, walang tinawag.`);
  }

  let timer;
  try {
    const raw = await Promise.race([
      callGeminiJSON({ systemPrompt, userPrompt, temperature: AI_FORECAST_GUARD.temperature, responseSchema, maxOutputTokens: AI_FORECAST_GUARD.maxOutputTokens }),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Gemini timeout after ${AI_FORECAST_GUARD.timeoutMs / 1000}s`)),
          AI_FORECAST_GUARD.timeoutMs
        );
      }),
    ]);
    if (!raw || typeof raw !== "object") throw new Error("Gemini returned an empty or non-object result.");

    let parsed;
    try {
      parsed = parseResult(raw);
    } catch (validationErr) {
      validationErr.isValidation = true;
      throw validationErr;
    }
    aiForecastState.consecutiveFailures = 0;
    aiForecastState.cooldownUntil = 0;
    labelCooldownUntil.delete(label);
    return parsed;
  } catch (err) {
    if (err.isValidation) {
      labelCooldownUntil.set(label, Date.now() + VALIDATION_COOLDOWN_MS);
      console.error(`[AIForecast] ${label} output rejected: ${err.message} | Cooldown ${VALIDATION_COOLDOWN_MS / 60000} min (para sa ${label} lang).`);
    } else {
      registerAiForecastFailure(err);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Array ng eksaktong `length` na finite numbers (negatibo -> 0), o null.
function toNumberArray(value, length) {
  if (!Array.isArray(value) || value.length < length) return null;
  const out = value.slice(0, length).map((v) => Number(v));
  return out.every((n) => Number.isFinite(n)) ? out.map((n) => Math.max(0, n)) : null;
}

// "May magandang cache ba na pwedeng ipagpatuloy?" — para hindi ma-overwrite
// ng error ang huling tamang forecast.
const isUsableSalesCache = (cached) =>
  !!(cached?.payload && !cached.payload.insufficientData && cached.payload.chartData?.length);
const isUsableProductCache = (cached) =>
  !!(cached?.payload?.thirtyDay && cached.payload.thirtyDay.insufficientData === false);

// ==========================================
// 1. ACTIONABLE RECOMMENDATIONS SERVICE (FORECAST-DRIVEN, TIMEFRAME-INDEPENDENT)
// ==========================================
// One recommendation set uses the 30-day sales and product forecasts with
// matching historical context. It does not run if either forecast is unavailable.
const AR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const AR_VALID_TYPES = ["success", "warning", "danger", "info", "neutral"];
const AR_CACHE_KEY = "actionable_recommendations_v11";
const AR_MAX_PER_CATEGORY = 2;
// Product Bundling: fast/slow movers come from ACTUAL sales of the past 30 days (historical, not the forecast).
const BUNDLE_WINDOW_DAYS = 30;
// The Product Forecast card shows only the top 2 of each list; recommendations must match it.
const FORECAST_SIGNALS_MAX = 2;
const AR_VALID_KINDS = ["improvement", "bundle", "expiry", "stock"];

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

// Waste logs ay laging 7 araw ang tinitingnan (hindi sumusunod sa 60-day
// historical window), para tama ang "in the past 7 days" sa recommendation.
const WASTE_WINDOW_DAYS = 7;
const WASTE_SUMMARY_MAX_ITEMS = 10;
const WASTE_SUMMARY_MAX_REASONS = 6;

// Pinagsasama ang LAHAT ng waste log sa window — per item, per reason at per
// waste_type — para ang AI ay sumulat tungkol sa PATTERN (maraming log, iba't
// ibang dahilan), hindi sa isang log lang. Columns ng waste_logs: waste_type,
// item_name, quantity, unit, reason, notes, cost, logged_at.
function summarizeWasteLogs(wasteLogs) {
  const logs = Array.isArray(wasteLogs) ? wasteLogs : [];
  const byItemMap = {};
  const reasonCounts = {};
  const typeCounts = {};
  let totalCost = 0;

  const bump = (bucket, text) => {
    const key = text.toLowerCase();
    if (!bucket[key]) bucket[key] = { text, count: 0 };
    bucket[key].count += 1;
  };
  const topOf = (bucket, limit) =>
    Object.values(bucket).sort((a, b) => b.count - a.count).slice(0, limit);

  for (const log of logs) {
    const itemName = String(log?.item_name ?? "").trim();
    if (!itemName) continue;
    const quantity = Number(log?.quantity ?? 0) || 0;
    const unit = String(log?.unit ?? "").trim();
    const cost = Number(log?.cost ?? 0) || 0;
    const wasteType = String(log?.waste_type ?? "").trim();
    const reason = String(log?.reason ?? "").trim();
    const note = String(log?.notes ?? "").trim().slice(0, 120);

    const key = itemName.toLowerCase();
    if (!byItemMap[key]) {
      byItemMap[key] = { itemName, unit, totalQuantity: 0, totalCost: 0, logCount: 0, reasons: {}, notes: {} };
    }
    const entry = byItemMap[key];
    entry.totalQuantity += quantity;
    entry.totalCost += cost;
    entry.logCount += 1;
    totalCost += cost;

    if (reason) {
      bump(entry.reasons, reason);
      bump(reasonCounts, reason);
    }
    if (note) bump(entry.notes, note);
    if (wasteType) bump(typeCounts, wasteType);
  }

  const round2 = (n) => Math.round(n * 100) / 100;

  const byItem = Object.values(byItemMap)
    .sort((a, b) => b.totalCost - a.totalCost || b.logCount - a.logCount) // pinakamalaking nawala (₱) muna
    .slice(0, WASTE_SUMMARY_MAX_ITEMS)
    .map((i) => ({
      itemName: i.itemName,
      unit: i.unit,
      totalQuantity: round2(i.totalQuantity),
      totalCost: round2(i.totalCost),
      logCount: i.logCount,
      reasons: topOf(i.reasons, 3).map((r) => ({ reason: r.text, count: r.count })),
      notes: topOf(i.notes, 2).map((n) => n.text),
    }));

  return {
    windowDays: WASTE_WINDOW_DAYS,
    totalLogs: logs.length,
    itemsAffected: Object.keys(byItemMap).length,
    totalCost: round2(totalCost),
    wasteTypes: topOf(typeCounts, WASTE_SUMMARY_MAX_REASONS).map((t) => ({ type: t.text, count: t.count })),
    reasons: topOf(reasonCounts, WASTE_SUMMARY_MAX_REASONS).map((r) => ({ reason: r.text, count: r.count })),
    byItem,
  };
}

async function getExpiryAdvisoryContext(days, ingredientToProducts) {
  const { startDate: activityStart, endDate: activityEnd } = getLookbackDateRange(days);
  const { startDate: wasteStart, endDate: wasteEnd } = getLookbackDateRange(WASTE_WINDOW_DAYS);

  const [nearExpiringRaw, inventoryLogs, recentWaste, ingredientResult, materialResult] = await Promise.all([
    InventoryLogsModel.getNearExpiring(days),
    InventoryLogsModel.getByDateRange(activityStart, activityEnd),
    WasteLogsModel.getRecent(wasteStart, wasteEnd),
    IngredientModel.findAll(),
    MaterialModel.findAll(),
  ]);
  if (ingredientResult.error) throw ingredientResult.error;
  if (materialResult.error) throw materialResult.error;
  const currentStockItems = [
    ...(ingredientResult.data || []).map((item) => ({ ...item, itemType: "ingredient" })),
    ...(materialResult.data || [])
      .filter((item) => item.material_type === "product")
      .map((item) => ({ ...item, itemType: "material" })),
  ];

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

  return { nearExpiringItems, inventoryActivitySummary, currentStockItems, recentWaste, wasteSummary: summarizeWasteLogs(recentWaste) };
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

  // totalsByProduct = buong listahan (hindi ipinapadala sa prompt) para magamit sa
  // pag-rank ng mga product na pwedeng gumamit ng near-expiring ingredient.
  return { bestSellers, slowMovers, totalsByProduct: totals };
}

// FALLBACK for Inventory Optimization when there are no near-expiring
// items to react to. Derived purely from existing inventory movement
// logs (IN vs OUT vs WASTE, already summarized as inventoryActivitySummary
// by getExpiryAdvisoryContext) — no new model method needed. Flags items
// trending toward a stockout (heavy usage, little restock => negative net
// movement) and items sitting overstocked (heavy restock, little usage,
// not yet wasted).
function getStockLevelContext(inventoryActivitySummary, currentStockItems = []) {
  const activityByName = new Map(
    Object.entries(inventoryActivitySummary || {}).map(([name, activity]) => [name.trim().toLowerCase(), activity])
  );
  const understockRisk = (currentStockItems || [])
    .map((item) => {
      const activity = activityByName.get(String(item.name || "").trim().toLowerCase()) || {};
      return {
        itemName: item.name,
        itemType: item.itemType,
        currentStock: Number(item.stock_quantity ?? 0),
        minimumStock: Number(item.minimum_stock ?? 0),
        unit: item.unit || "",
        inRestock: Number(activity.in_restock || 0),
        outUsed: Number(activity.out_used || 0),
      };
    })
    .filter((item) => item.currentStock <= 0 || (item.minimumStock > 0 && item.currentStock <= item.minimumStock))
    .sort((a, b) => {
      const aRatio = a.minimumStock > 0 ? a.currentStock / a.minimumStock : 0;
      const bRatio = b.minimumStock > 0 ? b.currentStock / b.minimumStock : 0;
      return aRatio - bRatio;
    })
    .slice(0, 5);

  return { understockRisk, overstockRisk: [] };
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

// Recommendations require usable 30-day sales and product forecasts.
async function getForecastAvailability() {
  const [sales30, productCombinedCached] = await Promise.all([
    getSalesForecastRead("30d"),
    AiCacheModel.getByKey(PRODUCT_COMBINED_CACHE_KEY),
  ]);

  const productThirty = productCombinedCached?.payload?.thirtyDay;

  const sales30Ready = !!(sales30 && sales30.insufficientData === false && sales30.chartData?.length);
  const product30Ready = !!(productThirty && productThirty.insufficientData === false);

  const anyReady = sales30Ready && product30Ready;

  return {
    anyReady,
    productForecastGeneratedAt: productThirty?.generatedAt ?? null,
    thirtyDay: anyReady
      ? {
          salesForecastSnippet: sales30.chartData.slice(0, 14),
          productForecast: { growth: productThirty.growth || [], risk: productThirty.risk || [] },
        }
      : null,
  };
}

// Use 60 days of historical context for the 30-day forecast.
function resolveHistoricalLookbackDays() {
  return REQUIRED_HISTORY_DAYS["30d"];
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

// Reconciles historical product trends against the 30-day product forecast.
function reconcileGrowthAndRisk(growthAndRisk, forecastAvailability) {
  const activeForecast = forecastAvailability.thirtyDay;

  if (!activeForecast) {
    // Defensive guard: the anyReady gate upstream should guarantee a forecast.
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

// NEAR-EXPIRY x DEMAND: ang ingredient ay maaaring gamitin ng maraming
// product (possibleProducts), pero hindi lahat ay mabilis maibenta. Kapag slow
// mover ang ibe-bake para maubos ang ingredient, madadagdagan lang ang
// hindi mabebentang stock. Kaya dito nire-rank ang bawat possibleProduct ayon sa
// aktwal na benta (bundleContext window) at minamarkahan kung fast/moderate/slow.
// bestProductToBake = pinakamabentang product na HINDI slow (o null kung wala).
// bestProductsToBake = hanggang 2 product (ang pangalawa ay isinasama lang kung "fast" din).
function enrichNearExpiringWithDemand(nearExpiringItems, bundleContext) {
  const totals = bundleContext?.totalsByProduct || {};
  const unitsByName = {};
  for (const [name, qty] of Object.entries(totals)) unitsByName[String(name).trim().toLowerCase()] = Number(qty) || 0;

  const fastNames = new Set((bundleContext?.bestSellers || []).map((p) => String(p.name).trim().toLowerCase()));
  const slowNames = new Set((bundleContext?.slowMovers || []).map((p) => String(p.name).trim().toLowerCase()));

  const demandOf = (name, units) => {
    const key = String(name).trim().toLowerCase();
    if (fastNames.has(key)) return "fast";
    if (slowNames.has(key) || units === 0) return "slow";
    return "moderate";
  };

  return (nearExpiringItems || []).map((item) => {
    const possibleProducts = (item.possibleProducts || [])
      .map((name) => {
        const unitsSold = unitsByName[String(name).trim().toLowerCase()] || 0;
        return { name, unitsSold, demand: demandOf(name, unitsSold) };
      })
      .sort((a, b) => b.unitsSold - a.unitsSold);

    const best = possibleProducts.find((p) => p.demand !== "slow") || null;
    // Hanggang 2 product: ang pinakamabenta, at ang pangalawa LANG kung "fast" din
    // (dalawang pinakamabilis). Kung isa lang ang fast/moderate, isa lang ang ibibigay.
    const bestList = [];
    if (best) {
      bestList.push(best.name);
      const second = possibleProducts.find((p) => p.name !== best.name && p.demand === "fast");
      if (second) bestList.push(second.name);
    }

    return {
      ...item,
      salesWindowDays: BUNDLE_WINDOW_DAYS,
      possibleProducts,
      bestProductToBake: best ? best.name : null,
      bestProductsToBake: bestList,
    };
  });
}

async function getRecommendationContext(historicalWindowDays, ingredientToProducts, forecastAvailability) {
  const [recentSalesTrend, expiryContext, bundleContext] = await Promise.all([
    getRecentSalesTrend(historicalWindowDays),
    getExpiryAdvisoryContext(historicalWindowDays, ingredientToProducts),
    getBundleOpportunityContext(BUNDLE_WINDOW_DAYS),
  ]);

  // Stock levels are always computed now: the "Stock & Waste Control" item is
  // a separate topic from "Expiry Management", so it needs its own data even
  // when something is near-expiring.
  const stockContext = getStockLevelContext(expiryContext.inventoryActivitySummary, expiryContext.currentStockItems);

  return {
    historicalWindowDays,
    // recentSalesTrend is overall daily sales only (no products) — narrative
    // color. Historical product lists are deliberately NOT in the context.
    salesGrowthContext: {
      recentSalesTrend,
    },
    // Exactly what the Product Forecast card shows: "Expected to Rise" =
    // productForecast.growth, "Expected to Drop" = productForecast.risk.
    // Each item: { name, recentQty, forecast, diff, pct }.
    forecastSignals: {
      rise: (forecastAvailability.thirtyDay?.productForecast?.growth || []).slice(0, FORECAST_SIGNALS_MAX),
      drop: (forecastAvailability.thirtyDay?.productForecast?.risk || []).slice(0, FORECAST_SIGNALS_MAX),
    },
    forecast: {
      thirtyDay: forecastAvailability.thirtyDay,
    },
    bundleContext: { bestSellers: bundleContext.bestSellers, slowMovers: bundleContext.slowMovers },
    expiryContext: {
      nearExpiringItems: enrichNearExpiringWithDemand(expiryContext.nearExpiringItems, bundleContext),
      // Pinagsama-samang buod ng LAHAT ng waste log sa nakaraang 7 araw.
      wasteSummary: expiryContext.wasteSummary,
      // Raw logs (capped) para sa mga specific na detalye/notes.
      recentWaste: (expiryContext.recentWaste || []).slice(0, 40),
    },
    stockContext,
  };
}

function buildActionablePrompt(context, previousTitles = []) {
  const todayDate = new Date().toLocaleString("en-US", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });

  const horizonsAvailable = context.forecast.thirtyDay ? "30-day" : "none";

  const avoidRepeatBlock = previousTitles.length
    ? `\nAVOID REPEATING YOURSELF: here are the recommendation titles you gave last time: ${JSON.stringify(previousTitles)}. The underlying data may look similar again, but do not reuse these titles or restate them with only minor wording changes. Find a different specific angle in the current data (a different product, a different number, a different combination) — if the data genuinely supports the same core idea, at least ground it in a new specific detail so it doesn't read as a copy-paste.\n`
    : "";

  const systemPrompt = `You are a Decision Support System (DSS) advisor for Cakelytics, analyzing "Aileen and Cake Max," a local cake and bake shop in the Philippines. Today's date is ${todayDate}.

This analysis uses ${context.historicalWindowDays} days of historical data (salesGrowthContext, expiryContext / stockContext), plus bundleContext = actual units sold per product in the past ${BUNDLE_WINDOW_DAYS} days, plus the ${horizonsAvailable} forecast in "forecast".

PRODUCT FORECAST IS THE ONLY BASIS FOR SALES IMPROVEMENT — READ THIS CAREFULLY:
"forecastSignals" is a copy of the Product Forecast card the owner sees: "forecastSignals.rise" is the "Expected to Rise" list and "forecastSignals.drop" is the "Expected to Drop" list. Each entry has: name, recentQty (units sold in the last 30 days), forecast (units expected in the next 30 days), diff (change in units) and pct (change in percent).
The Sales Improvement recommendation (job 1.a below) may use ONLY the products in these two lists. There is no historical product list for it — do not look for one elsewhere in the context.

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
Follow the per-category counts below; never pad with unsupported recommendations. For inventoryOptimization, include one expiry item only when near-expiring ingredients exist, and one stock item only when waste logs or meaningful stock risks exist.

1. "salesOptimization" (Sales Optimization) — a FIXED structure of EXACTLY 2 items, in this order: first the Sales Improvement (job a, "kind": "improvement"), then the Product Bundling (job b, "kind": "bundle"). NEVER return two items of the same kind, and never drop the bundle item when job (b) has data to work with.
   a. Sales Improvement — "kind": "improvement". Built ONLY from forecastSignals.rise ("Expected to Rise") and forecastSignals.drop ("Expected to Drop"). These lists are exactly the products shown on the Product Forecast card (at most 2 in each).
      - Write ONE paragraph in "desc" (no line breaks, no bullet list) that covers EVERY product in forecastSignals.rise and forecastSignals.drop, with one short, concrete action per product. Use each product's name exactly as written in the list.
      - For each product, quote its numbers exactly as given: recentQty units in the last 30 days -> forecast units in the next 30 days, and the change (diff). Do not round differently, recompute, or invent numbers.
      - It MUST NOT mention any product that is not in forecastSignals.rise or forecastSignals.drop, even if that product appears elsewhere in the context (for example in bundleContext).
      - For a "rise" product the action should be concrete, such as baking or stocking more ahead of a specific date (Filipino payday 15th/30th, or a PH seasonal window) if that date is relevant. For a "drop" product, the action should be concrete, such as cutting production by a specific amount or running a specific promo. Do not use the bundle pairing here — that belongs to job (b).
      - If BOTH forecastSignals.rise and forecastSignals.drop are empty, give a sales-level recommendation from forecast.thirtyDay.salesForecastSnippet WITHOUT naming any product.
      - salesGrowthContext.recentSalesTrend is overall daily sales only; use it just to say whether overall sales have already started moving, never to pick a product.
   b. Product Bundling — "kind": "bundle". Based on HISTORICAL sales (bundleContext), not the forecast. bundleContext.bestSellers are the fast-moving products and bundleContext.slowMovers are the slow-moving ones, by actual units sold in the last ${BUNDLE_WINDOW_DAYS} days. This is a flexible, practical suggestion, not a strict formula:
      - Best case: pair a slow mover with a fast mover from bundleContext, name both, and give a simple discount or add-on idea that fits a bakery/celebration business.
      - If there is no slow mover, pair any two bestSellers as a combo instead (do not call them slow). Any sensible combo from bundleContext is fine.
      - Keep it simple and doable this week. Use numbers only if they come from bundleContext (with their window, e.g. "in the last ${BUNDLE_WINDOW_DAYS} days"); a discount or add-on term you propose is your own idea, so just keep it reasonable.
      - If bundleContext.bestSellers has only 1 product and no slow mover, suggest a simple add-on or celebration extra with it (no invented numbers). Only if bundleContext.bestSellers is empty leave the bundle item out and return only the Sales Improvement item.

2. "inventoryOptimization" (Inventory Optimization) — a FIXED structure. Every item covers ONE topic only and carries a "kind":
   - "expiry" = Expiry Management: ONLY about near-expiring ingredients (job a).
   - "stock" = Stock & Waste Control: ONLY about stock levels or waste logs (job b). There is at most ONE "expiry" item and at most ONE "stock" item — the dashboard has exactly two fixed slots, one per kind.
   NEVER mix the two topics inside one item. An "expiry" item must not talk about waste, spoilage, losses or storage habits. A "stock" item must not give advice about current near-expiry dates. When discussing waste logs, it may state that an item was logged as expired; treat that only as a past waste reason, not current expiry advice.

   a. Expiry Management — "kind": "expiry" — the FIRST item. Only when expiryContext.nearExpiringItems is non-empty: pick the most urgent near-expiring item(s). Each item has possibleProducts (the products that use that ingredient, each with unitsSold in the last salesWindowDays days and a demand label of fast / moderate / slow) and bestProductsToBake (the 1 or 2 best-selling products to use).
      - USE THE FAST SELLERS, NEVER THE SLOW ONES: recommend baking/pushing the products listed in bestProductsToBake — these are the best-selling products that use the ingredient. If bestProductsToBake has TWO products, recommend BOTH (for example split the batch between them, or bake one of each) and name both. If it has only ONE, recommend just that one. Never add a third. Say why in plain words using each product's unitsSold (for example "it sold 49 units in the last 30 days, so it will move fast"), add a reasoned discount or counter push if useful, and compare the expected return vs. a full write-off.
      - NEVER recommend baking or pushing a product whose demand is "slow" just to use up the ingredient. Baking more of something that barely sells only creates more unsold stock and does not solve the expiry problem.
      - If bestProductsToBake is empty (no possibleProducts, or every possible product is slow), do NOT name a slow product to bake. Recommend a direct action instead: put the near-expiring item on a quick sale or clearance, use it up in the regular bakes already planned, or use a small batch only if the owner already has orders for it.
      - Keep this consistent with the Product Bundling recommendation: never call the same product slow in one place and tell the owner to bake more of it in another.
      - STAY ON EXPIRY ONLY: talk about the near-expiring item, its expiry date, and what to bake or sell. Do NOT mention waste logs, spoilage, pesos lost, or fridge/storage handling in this item — that belongs to the Stock & Waste Control item.

   b. Stock & Waste Control — "kind": "stock" — the SECOND item. It is about stock levels or waste ONLY. Do NOT mention expiry dates or near-expiring items here (job a covers them), and do not pick an item just because it is near expiry. Choose the source in this order:
      1) If expiryContext.wasteSummary.totalLogs is more than 0: write about waste, following the WASTE LOGS rules below.
      2) Otherwise use stockContext.understockRisk only when currentStock is at or below minimumStock. State both exact values and the unit before recommending a reorder. Inventory movement totals (inRestock/outUsed) describe past activity only; they do NOT prove current stock is low or overstocked. Never claim an item is low, nearly out, or needs an immediate order based only on movement totals. If no item is below its minimum, leave this stock item out. Waste is reported only from wasteSummary.
      3) If neither has anything meaningful, leave this item out and return only the Expiry Management item.

   c. If expiryContext.nearExpiringItems is EMPTY: there is NO "expiry" item — leave it out completely. Return ONLY ONE item, "kind": "stock" (Stock & Waste Control), following job b. Never return two "stock" items and never return an item with a missing or different kind.

   d. WASTE LOGS — LOOK AT THE WHOLE PAST ${WASTE_WINDOW_DAYS} DAYS, NOT ONE LOG (applies to the "stock" item):
      expiryContext.wasteSummary combines EVERY waste log from the past ${WASTE_WINDOW_DAYS} days (totalLogs, itemsAffected, totalCost in pesos, wasteTypes, reasons overall, and byItem with logCount/totalQuantity/totalCost/reasons/notes). expiryContext.recentWaste holds the raw logs behind it. There can be many logs with different reasons (spoiled, left unrefrigerated, expired, dropped, and so on).
      - Whenever an item talks about waste or losses, it MUST say the time window in plain words, such as "in the past ${WASTE_WINDOW_DAYS} days" or "over the last ${WASTE_WINDOW_DAYS} days". Never write "recently" or "lately" alone.
      - Base it on the PATTERN across the logs, not on a single log. If wasteSummary.totalLogs is more than 1, describe the bigger picture first (for example how many items or logs were affected and the most common reasons, using the real numbers from wasteSummary), and only then name the one or two items that lost the most. Do not build the whole recommendation around just one log or one reason when other logs exist.
      - If MANY different items were wasted (for example 5 or more), do NOT list them all. Say how many items were affected and the total cost, name only the top 1 or 2 items by totalCost, and group the rest as "and N other items" (N = itemsAffected minus the ones you named). Focus the fix on the most common reason across all items.
      - Give ONE practical fix that addresses the most common reason or the item with the most logs. If there are several different reasons, you may name the top two together in one short sentence, each with its own quick fix.
      - Only use a reason/note for the item it was logged against; do not apply it to a different item. If reasons are empty, do not guess a cause.

WHO IS READING THIS — SPEAK TO THE OWNER ONLY, NEVER TO A "TEAM":
The ONLY reader is the owner of this small shop. This is the owner's own business, so do not picture employees, departments, or a chain of command. Talk straight to the owner with "you", and write every action as something the owner does or decides personally.
- NEVER write "your team," "the team," "your staff," "your crew," "your employees," "your workers," "your helpers," "your bakers," "your people," "everyone," or any phrase that hands the job to someone else (e.g. "tell your team to...," "make sure your staff...," "have your bakers...," "remind everyone to..."). Do not assume the shop has any employees at all.
- Write the action directly instead. Say "Put the tubs straight back in the fridge as soon as you finish frosting" — NOT "Make sure your team puts the tubs back in the fridge." Say "Bake a batch of Sliced Egg Pie today" — NOT "Have your bakers make Sliced Egg Pie."
- Do not blame or lecture anyone. When a waste log shows a loss, state what was lost and give the simple fix for the owner to apply.

LANGUAGE & TONE — WRITE FOR A REGULAR SHOP OWNER, NOT A BUSINESS SCHOOL GRAD:
Imagine you're explaining this out loud to a 50-year-old bake shop owner who has never studied business or marketing — someone smart and experienced running their own shop, but who did not grow up with corporate or startup vocabulary. Write the way you'd actually talk to them face to face.
- Use short, plain sentences. One idea per sentence when possible.
- Use everyday, concrete words. AVOID business-jargon words like: leverage, momentum, contraction, capture, institute, expedite, impulse purchases, upsell, logistics, synergy, optimize, reconcile, cross-reference, mechanism, anchor. Say the plain-English version instead — e.g. instead of "leverage this upward momentum," say "sell more of it while it's in demand"; instead of "institute a clearance discount," say "put it on sale now."
- Skip the analyst framing (don't say things like "the forecast points to," "data indicates," "the model projects"). Just state what's happening and what to do about it, like a friend giving practical advice: "Tarpaulin orders are slowing down, so..." not "Forecast data indicates a contraction in tarpaulin demand..."
- Still be specific — keep the real numbers, product names, and dates. Being simple doesn't mean being vague; it means saying real things in plain words.
- Vary your phrasing and sentence openers between recommendations; avoid falling into the same boilerplate structure for every item.

Respond with ONLY valid JSON strictly following this exact shape:
{
  "salesOptimization": [ { "title": "...", "desc": "...", "type": "success" | "warning" | "danger" | "info" | "neutral", "kind": "improvement" | "bundle" }, { "title": "...", "desc": "...", "type": "...", "kind": "improvement" | "bundle" } ],
  "inventoryOptimization": [ { "title": "...", "desc": "...", "type": "...", "kind": "expiry" | "stock" }, { "title": "...", "desc": "...", "type": "...", "kind": "expiry" | "stock" } ]
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

// AUDIENCE GUARD: ang nagbabasa ng recommendations ay ang OWNER lang, hindi
// isang team. Hindi dapat mag-utos ang AI sa "team/staff/crew" — ang bawat
// aksyon ay dapat nakasulat para sa owner mismo ("you"). Code check ito,
// hindi lang prompt wording, kaya kapag pumalya ay mare-retry at hindi ma-cache.
const AR_BANNED_AUDIENCE_REGEX =
  /\b(team(?:s|mates?)?|staffs?|crew|employees?|workers?|helpers?|personnel|co-?workers?|colleagues?|everyone|everybody|your people|your bakers?|your assistants?)\b/i;

const AR_WASTE_TOPIC_REGEX = /\b(waste logs?|logged|spoil\w*|unrefrigerated|loss of|lost|fridge|refrigerat\w*|storage)\b/i;
const AR_EXPIRY_TOPIC_REGEX = /\b(near[- ]?expir\w*|expir(?:y|ation)\s+(?:date|is|on|by|within)|expir(?:es|ing)\b|best[- ]before|use[- ]by)\b/i;
const AR_WASTE_TALK_REGEX = /\b(lost|wasted|waste logs?|logged|spoil\w*|thrown|discard\w*|unrefrigerated)\b/i;
const AR_WASTE_WINDOW_REGEX = /\b(past|last)\s+(7|seven)\s+days\b|\bpast\s+week\b/i;

function findBannedAudienceWord(text) {
  const match = String(text || "").match(AR_BANNED_AUDIENCE_REGEX);
  return match ? match[0] : null;
}

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
    const wasteLogCount = Number(context?.expiryContext?.wasteSummary?.totalLogs || 0);
    if (invRecs.includes(rec) && rec.kind === "stock" && wasteLogCount > 0 && AR_WASTE_TALK_REGEX.test(rec.desc) && !AR_WASTE_WINDOW_REGEX.test(rec.desc)) {
      issues.push(`"${rec.title}" talks about waste/losses but doesn't say the time window. Say "in the past ${WASTE_WINDOW_DAYS} days" and describe the pattern across the waste logs (not just one log).`);
    }
    // Near-expiry: huwag mag-suggest mag-bake ng SLOW na product para maubos ang ingredient.
    if (invRecs.includes(rec)) {
      const text = `${rec.title} ${rec.desc}`.toLowerCase();
      for (const item of context?.expiryContext?.nearExpiringItems || []) {
        for (const prod of item.possibleProducts || []) {
          if (prod.demand === "slow" && text.includes(String(prod.name).trim().toLowerCase())) {
            const alt = item.bestProductToBake
              ? `Use "${item.bestProductToBake}" instead — it sells much faster.`
              : "There is no fast-selling product that uses it, so recommend a quick sale/clearance instead of baking more.";
            issues.push(`"${rec.title}" tells the owner to use "${prod.name}" for the near-expiring ${item.itemName}, but "${prod.name}" is a slow seller (only ${prod.unitsSold} sold). ${alt}`);
          }
        }
      }
    }
    if (invRecs.includes(rec)) {
      const text2 = `${rec.title} ${rec.desc}`.toLowerCase();
      for (const item of context?.expiryContext?.nearExpiringItems || []) {
        const picks = item.bestProductsToBake || [];
        if (picks.length === 2) {
          const [first, second] = picks.map((n) => String(n).trim().toLowerCase());
          if (text2.includes(first) && !text2.includes(second)) {
            issues.push(`"${rec.title}" only names "${picks[0]}" for the near-expiring ${item.itemName}, but "${picks[1]}" is also a fast seller that uses it. Recommend BOTH products (e.g. split the batch).`);
          }
        }
      }
    }
    // Inventory: isang topic lang bawat item (expiry O stock/waste, hindi pinaghalo).
    if (invRecs.includes(rec)) {
      const rtext = `${rec.title} ${rec.desc}`;
      if (rec.kind === "expiry" && AR_WASTE_TOPIC_REGEX.test(rtext)) {
        issues.push(`"${rec.title}" is an Expiry Management item but talks about waste/spoilage/losses/storage. Keep it ONLY about the near-expiring item and what to bake or sell; waste belongs in the separate Stock & Waste Control item.`);
      }
      if (rec.kind === "stock" && AR_EXPIRY_TOPIC_REGEX.test(rtext)) {
        issues.push(`"${rec.title}" is a Stock & Waste Control item but talks about expiry/near-expiring items. Keep it ONLY about stock levels or waste logs; expiry belongs in the separate Expiry Management item.`);
      }
      if (rec.kind === "stock" && /\b(low stock|(?:very )?low|running (?:very )?low|nearly out|run out|running out|reorder now|order now|order.{0,20}(?:right away|immediately)|(?:right away|immediately).{0,20}order)\b/i.test(rtext)) {
        const stockSignals = context?.stockContext?.understockRisk || [];
        const namedItem = (context?.expiryContext?.currentStockItems || []).find((item) =>
          item.name && rtext.toLowerCase().includes(String(item.name).trim().toLowerCase())
        );
        const signal = namedItem && stockSignals.find((item) =>
          String(item.itemName).trim().toLowerCase() === String(namedItem.name).trim().toLowerCase()
        );
        if (!signal) {
          issues.push(`"${rec.title}" claims an item is low or needs an immediate reorder without current stock being at or below its minimum. Movement totals alone do not support this claim.`);
        } else {
          const exactStock = String(signal.currentStock);
          const exactMinimum = String(signal.minimumStock);
          if (!rtext.includes(exactStock) || !rtext.includes(exactMinimum)) {
            issues.push(`"${rec.title}" claims low stock for "${signal.itemName}" but must state its exact current stock (${exactStock} ${signal.unit}) and minimum (${exactMinimum} ${signal.unit}).`);
          }
        }
      }
    }
    const audienceHit = findBannedAudienceWord(`${rec.title} ${rec.desc}`);
    if (audienceHit) {
      issues.push(`"${rec.title}" refers to "${audienceHit}". The reader is the shop owner only — remove any mention of a team/staff/crew/employees and write the action directly to the owner (use "you", e.g. "Put the tubs back in the fridge right after frosting").`);
    }
    if (!/\d/.test(rec.desc)) {
      issues.push(`"${rec.title}" doesn't cite any concrete number (%, ₱, quantity, or date) — too generic to be data-grounded.`);
    }
  }

  // INVENTORY STRUCTURE: Expiry Management (kind "expiry") ay para lang sa near-expiring;
  // Stock & Waste Control (kind "stock") ay para lang sa stock/waste.
  {
    const hasNear = (context?.expiryContext?.nearExpiringItems || []).length > 0;
    const hasWaste = Number(context?.expiryContext?.wasteSummary?.totalLogs || 0) > 0;
    const hasStock = (context?.stockContext?.understockRisk || []).length + (context?.stockContext?.overstockRisk || []).length > 0;
    const expiryRecs = invRecs.filter((r) => r.kind === "expiry");
    const stockWasteRecs = invRecs.filter((r) => r.kind === "stock");

    if (invRecs.some((r) => r.kind !== "expiry" && r.kind !== "stock")) {
      issues.push('Every inventoryOptimization item needs "kind": "expiry" (Expiry Management) or "kind": "stock" (Stock & Waste Control).');
    }
    if (hasNear && expiryRecs.length !== 1) {
      issues.push(`inventoryOptimization must contain exactly ONE "expiry" item (about the near-expiring ingredients) — found ${expiryRecs.length}.`);
    }
    if (!hasNear && expiryRecs.length > 0) {
      issues.push('There are no near-expiring items, so leave out the "expiry" item and return only the one "stock" item.');
    }
    // Dalawang fixed na slot ang dashboard: isa lang bawat kind, hindi hihigit.
    if ((hasWaste || hasStock) && stockWasteRecs.length !== 1) {
      issues.push(`inventoryOptimization must contain exactly ONE "stock" item (Stock & Waste Control — stock levels or waste logs only) — found ${stockWasteRecs.length}.`);
    }
  }

  const slowMovers = context?.bundleContext?.slowMovers || [];
  const bestSellers = context?.bundleContext?.bestSellers || [];
  const rise = context?.forecastSignals?.rise || [];
  const drop = context?.forecastSignals?.drop || [];

  const norm = (v) => String(v || "").trim().toLowerCase();
  const displayNameByKey = {};
  const addKnown = (list) => {
    for (const p of list || []) {
      const key = norm(p?.name || p?.product_name);
      if (key && !displayNameByKey[key]) displayNameByKey[key] = String(p?.name || p?.product_name).trim();
    }
  };
  addKnown(rise);
  addKnown(drop);
  addKnown(bestSellers);
  addKnown(slowMovers);

  // Longest names first, masking each match, so a short name that sits
  // inside a longer one (e.g. "Cake" in "Chocolate Cake") is not counted.
  const findMentions = (text) => {
    let rest = norm(text);
    const found = new Set();
    for (const key of Object.keys(displayNameByKey).sort((a, b) => b.length - a.length)) {
      if (rest.includes(key)) {
        found.add(key);
        rest = rest.split(key).join(" ");
      }
    }
    return found;
  };
  const keysOf = (list) => new Set((list || []).map((p) => norm(p?.name || p?.product_name)).filter(Boolean));

  // FIXED STRUCTURE: exactly one "improvement" and, whenever bundle data
  // exists, exactly one "bundle". Matching names alone is not enough.
  const improvementRecs = salesRecs.filter((r) => r.kind === "improvement");
  const bundleRecs = salesRecs.filter((r) => r.kind === "bundle");
  const bundleAvailable = bestSellers.length >= 1;

  if (improvementRecs.length !== 1) {
    issues.push(`salesOptimization must contain exactly ONE item with kind "improvement" (Sales Improvement, job 1.a) — found ${improvementRecs.length}.`);
  }
  if (bundleAvailable && bundleRecs.length !== 1) {
    issues.push(`salesOptimization must contain exactly ONE item with kind "bundle" (Product Bundling, job 1.b) — found ${bundleRecs.length}. Do not return two Sales Improvement items instead of the bundle.`);
  }
  if (!bundleAvailable && bundleRecs.length > 0) {
    issues.push("There is no sales history for a Product Bundling item yet — leave the bundle item out.");
  }

  // Sales Improvement: ONLY the Product Forecast rise/drop products, and ALL of them.
  if (improvementRecs.length === 1 && (rise.length > 0 || drop.length > 0)) {
    const rec = improvementRecs[0];
    const allowed = keysOf([...rise, ...drop]);
    const mentioned = findMentions(`${rec.title} ${rec.desc}`);

    for (const k of mentioned) {
      if (!allowed.has(k)) {
        issues.push(`"${rec.title}" mentions "${displayNameByKey[k]}", which is not in the Product Forecast rise/drop lists.`);
      }
    }
    for (const k of allowed) {
      if (!mentioned.has(k)) {
        issues.push(`"${rec.title}" does not cover "${displayNameByKey[k]}" from the Product Forecast — give one action for every product in the rise/drop lists, in one paragraph.`);
      }
    }
  }

  // Product Bundling is intentionally NOT name-checked: the structure check
  // above (exactly one "bundle" item when bundle data exists) is the only
  // hard rule. Which products are paired is left to the prompt's guidance.

  return issues;
}

function buildExpiryOnlyPrompt(nearExpiringItems, previousTitles = []) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: MANILA_TZ });
  const systemPrompt = `You write one concise production action for a bakery owner based only on the provided ingredients that expire soon. The item list is ordered by nearest expiry first; use only the first item. Use only that item, its expiration date, and its listed product sales. Use every name in bestProductsToBake: when the list has two products, name BOTH exact product names in the description; when it has one, name that one. Copy the product spelling exactly and never name a slow product. If no suitable product is listed, suggest a quick sale or using the ingredient only in batches already planned. Keep the recommendation strictly about this ingredient, its date, and what to make or sell. Do not introduce any other topic. Include the exact date and the sales counts supplied. Return only JSON: {"title":"...","desc":"...","type":"warning","kind":"expiry"}. Today's date in Manila is ${today}.`;
  const userPrompt = JSON.stringify({
    task: 'Create exactly one expiry recommendation. Do not add any other recommendation category. Name every required product below exactly as written; if there are two, include both.',
    requiredProducts: nearExpiringItems[0]?.bestProductsToBake || [],
    previousTitles,
    nearExpiringItems: nearExpiringItems.map((item) => ({
      itemName: item.itemName,
      expirationDate: item.expirationDate,
      bestProductsToBake: item.bestProductsToBake || [],
      possibleProducts: (item.possibleProducts || []).map(({ name, unitsSold, demand }) => ({ name, unitsSold, demand })),
      salesWindowDays: item.salesWindowDays || BUNDLE_WINDOW_DAYS,
    })),
  });
  return { systemPrompt, userPrompt };
}

function validateExpiryOnlyRecommendation(recommendation, nearExpiringItems) {
  const issues = [];
  if (!recommendation?.title || !recommendation?.desc) return ['Missing recommendation title or description.'];

  const text = `${recommendation.title} ${recommendation.desc}`;
  if (AR_WASTE_TOPIC_REGEX.test(text)) {
    issues.push('Keep this expiry recommendation only about the near-expiring ingredient and what to make or sell.');
  }
  if (!/\d/.test(recommendation.desc)) issues.push('Include the exact expiry date or a supplied sales count.');

  const item = nearExpiringItems[0];
  if (item) {
    const lowerText = text.toLowerCase();
    if (!lowerText.includes(String(item.itemName || '').trim().toLowerCase())) {
      issues.push(`Name the near-expiring ingredient exactly: ${item.itemName}.`);
    }
    if (item.expirationDate && !recommendation.desc.includes(String(item.expirationDate))) {
      issues.push(`Include its exact expiry date: ${item.expirationDate}.`);
    }
    for (const name of item.bestProductsToBake || []) {
      if (!lowerText.includes(String(name).trim().toLowerCase())) {
        issues.push(`Use the listed fast-selling product: ${name}.`);
      }
    }
  }
  return issues;
}

async function generateExpiryOnlyRecommendation(context, previousTitles = []) {
  const nearExpiringItems = context?.expiryContext?.nearExpiringItems || [];
  if (!nearExpiringItems.length) return null;

  const { systemPrompt, userPrompt } = buildExpiryOnlyPrompt(nearExpiringItems, previousTitles);
  let issues = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    const retryNote = attempt > 1
      ? `\nREQUIRED: include every product name exactly as written: ${JSON.stringify(nearExpiringItems[0]?.bestProductsToBake || [])}. If there are two names, include both in the same description. Fix these validation issues without adding another topic:\n${issues.map((issue) => `- ${issue}`).join('\n')}`
      : '';
    const result = await callGeminiJSON({
      systemPrompt,
      userPrompt: userPrompt + retryNote,
      temperature: attempt === 1 ? 0.2 : 0.1,
    });
    const recommendation = result?.recommendation || result;
    issues = validateExpiryOnlyRecommendation(recommendation, nearExpiringItems);
    if (!issues.length) {
      return {
        title: String(recommendation.title),
        desc: String(recommendation.desc),
        type: AR_VALID_TYPES.includes(recommendation.type) ? recommendation.type : 'warning',
        kind: 'expiry',
      };
    }
    console.warn(`[ActionableRecommendationService] Isolated expiry attempt ${attempt}/3 failed validation:`, JSON.stringify({ issues, title: recommendation?.title, desc: recommendation?.desc }));
  }
  throw new Error('Isolated expiry recommendation failed validation after 3 attempts.');
}
function normalizeActionablePayload(aiResult) {
  const normalizeArray = (arr, withKind = false) => {
    const list = Array.isArray(arr) ? arr : [];
    return list
      .filter(r => r && r.title && r.desc)
      .slice(0, AR_MAX_PER_CATEGORY)
      .map(r => ({
        title: String(r.title),
        desc: String(r.desc),
        type: AR_VALID_TYPES.includes(r.type) ? r.type : "neutral",
        // kind is internal (used by validateActionablePayload), not shown in the UI.
        ...(withKind && AR_VALID_KINDS.includes(r.kind) ? { kind: r.kind } : {}),
      }));
  };

  return {
    salesOptimization: normalizeArray(aiResult?.salesOptimization, true),
    inventoryOptimization: normalizeArray(aiResult?.inventoryOptimization, true),
  };
}

function emptyActionablePayload() {
  return { salesOptimization: [], inventoryOptimization: [] };
}

const isUsableActionableCache = (cached) =>
  !!(cached?.payload && (cached.payload.salesOptimization?.length || cached.payload.inventoryOptimization?.length));

const ActionableRecommendationService = {
  // No longer takes a timeframe — recommendations are a single,
  // timeframe-independent set that internally reasons over whichever
  // 30-day forecasts are ready.
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

    return singleFlight("actionable_recommendations", async () => {
      // GATE: recommendations require both 30-day Sales and Product Forecasts.
      // If either is unavailable, there is no forecast to reason
      // over yet — no-op entirely rather than fall back to a past-data-only
      // recommendation.
      const forecastAvailability = await getForecastAvailability();
      if (!forecastAvailability.anyReady) {
        console.warn(`[ActionableRecommendationService] Skipping generation: sales forecast ready=${forecastAvailability.sales30Ready}, product forecast ready=${forecastAvailability.product30Ready}.`);
        return {
          recommendations: emptyActionablePayload(),
          insufficientData: true,
          message: "Waiting for the sales and product forecast to finish generating before recommendations can be produced.",
        };
      }

      const historicalWindowDays = resolveHistoricalLookbackDays();

      try {
        const [ingredientToProducts, previousTitles] = await Promise.all([
          buildIngredientToProductsMap(),
          getPreviousRecommendationTitles(AR_CACHE_KEY),
        ]);
        const context = await getRecommendationContext(historicalWindowDays, ingredientToProducts, forecastAvailability);
        const expiryRecommendation = await generateExpiryOnlyRecommendation(context, previousTitles);
        const nonExpiryContext = {
          ...context,
          expiryContext: { ...context.expiryContext, nearExpiringItems: [] },
        };
        const { systemPrompt, userPrompt } = buildActionablePrompt(nonExpiryContext, previousTitles);

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
          if (attempt > 1) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
          }
          const retryNote = attempt > 1
            ? `\n\nIMPORTANT — YOUR PREVIOUS ATTEMPT FAILED THESE SPECIFIC CHECKS. FIX THEM THIS TIME:\n${issues.map((i) => `- ${i}`).join("\n")}\n`
            : "";
          const temperature = attempt === 1 ? 0.5 : 0.25;
          const aiResult = await callGeminiJSON({ systemPrompt, userPrompt: userPrompt + retryNote, temperature });
          const mainCandidate = normalizeActionablePayload(aiResult);
          const candidate = {
            ...mainCandidate,
            inventoryOptimization: [
              ...(expiryRecommendation ? [expiryRecommendation] : []),
              ...mainCandidate.inventoryOptimization.filter((recommendation) => recommendation.kind === "stock"),
            ],
          };
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
          if (isUsableActionableCache(existingCache)) {
            console.warn(`[ActionableRecommendationService] Kept cached recommendations after validation failed: ${JSON.stringify(existingCache.payload)}`);
            return { recommendations: existingCache.payload, insufficientData: false };
          }
          // No previous good cache to fall back to (e.g. first-ever run) —
          // serve the best-effort payload anyway rather than an empty one.
        }

        // Record which Product Forecast these recommendations were built from.
        payload = { ...payload, forecastGeneratedAt: forecastAvailability.productForecastGeneratedAt };

        await AiCacheModel.upsert(AR_CACHE_KEY, payload, AR_CACHE_TTL_MS);
        console.log(`[ActionableRecommendationService] Fresh recommendations generated and cached: ${JSON.stringify({ forecastGeneratedAt: payload.forecastGeneratedAt, salesOptimization: payload.salesOptimization, inventoryOptimization: payload.inventoryOptimization })}`);
        return { recommendations: payload, insufficientData: false };
      } catch (err) {
        console.error("[ActionableRecommendationService] Gemini recommendation failed:", err.message);
        const existingCache = await AiCacheModel.getByKey(AR_CACHE_KEY).catch(() => null);
        if (isUsableActionableCache(existingCache)) {
          console.warn(`[ActionableRecommendationService] Kept previous cached recommendations: ${JSON.stringify(existingCache.payload)}`);
          return { recommendations: existingCache.payload, insufficientData: false };
        }
        return {
          recommendations: emptyActionablePayload(),
          insufficientData: true,
          message: "AI recommendations unavailable right now. Will retry on next cron run.",
        };
      }
    });
  },
};

// ==========================================
// 2. PRODUCT FORECAST SERVICE (GEMINI AI OVER SYSTEM-FILTERED DATA)
// ==========================================
// Si Gemini ang nag-fo-forecast ng units kada produkto. Ang system ang
// nag-fi-filter (per-product eligibility, outlier cap, token budget) at
// nagva-validate ng sagot; ang growth/risk lists at totals ay kinukuwenta ng
// system mula sa forecast ni Gemini gamit ang PRODUCT_FORECAST_RULES.
// Isang Gemini request ang gumagawa ng 30-day product forecast. Kinukumpara
// ito sa aktuwal na units sa nakaraang 30 araw.
const PF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PF_TIMEFRAME_LABELS = { "30d": "Next 30 Days" };
const PRODUCT_COMBINED_CACHE_KEY = "product_forecast:combined";
const SUPABASE_DEFAULT_ROW_CAP = 1000;

// Supabase/PostgREST pinuputol ang resulta sa 1000 rows. Ang Sales Forecast ay
// 1 row kada ORDER kaya kasya; ang Product Forecast ay 1 row kada ORDER ITEM
// (mas marami ng ilang beses) kaya sa buong history ay maaari pa ring lumampas sa cap at
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

// Daily units kada produkto (Manila dates), BUONG history hanggang KAHAPON.
// Ang bilang ay nagsisimula sa FIRST SALE ng produkto — hindi nilalagyan ng 0
// ang mga araw bago pa ito lumabas, kaya hindi nasisira ang average ng
// bagong produkto. Walang window cap: kinukuha mula epoch.
async function getProductDailySeries() {
  const { dateKeys: [yesterdayKey], endISO, todayKey } = getManilaHistoryWindow(1);
  const startISO = new Date(0).toISOString();

  const items = await fetchRangeUncapped(
    (from, to) => OrderItemsModel.getByOrderDateRange(from, to, {
      columns: `product_id, product_name, quantity, products ( name, category ), orders!inner ( created_at, status )`,
      excludeCancelled: true,
    }),
    startISO,
    endISO
  );
  console.log(`[ProductForecastService] Fetched ${items.length} order-item rows for full history.`);

  if (items.length > 0 && items.length % SUPABASE_DEFAULT_ROW_CAP === 0) {
    console.warn(`[ProductForecastService] Query returned exactly ${items.length} rows — baka naputol ng row limit ang history. I-check ang pagination ng OrderItemsModel.getByOrderDateRange.`);
  }

  const byProduct = {};
  let unnamedRows = 0;
  for (const row of items) {
    const createdAt = row.orders?.created_at;
    if (!createdAt) continue;

    // FIX: dati, ang pangalan ay galing LANG sa `products` join. Kapag null ang
    // join (walang product_id — custom order, bundle, package, o na-delete na
    // produkto), lahat ng iyon ay napupunta sa iisang "Unknown Product" na
    // bucket kaya iisang "produkto" lang ang na-forecast. Ngayon: unahin ang
    // product_name na naka-save mismo sa order item (parehong source ng
    // getProductGrowthAndRisk, kaya tugma ang pangalan sa Recommendations),
    // tapos products.name bilang fallback. Walang pangalan = hindi isinasama.
    const name = String(row.product_name || row.products?.name || "").trim();
    if (!name) {
      unnamedRows += 1;
      continue;
    }
    const category = row.products?.category || "Uncategorized";
    const key = row.product_id ? `id:${row.product_id}` : `name:${name.toLowerCase()}`;
    const day = toManilaDateKey(createdAt);

    if (!byProduct[key]) byProduct[key] = { productName: name, category, qtyByDate: {} };
    byProduct[key].qtyByDate[day] = (byProduct[key].qtyByDate[day] || 0) + Number(row.quantity || 0);
  }

  if (unnamedRows > 0) {
    console.warn(`[ProductForecastService] ${unnamedRows} order-item row(s) walang product_name at walang naka-link na product — hindi isinama sa forecast.`);
  }

  const products = Object.values(byProduct)
    .map((p) => {
      const firstSaleKey = Object.keys(p.qtyByDate).filter((d) => p.qtyByDate[d] > 0 && d <= yesterdayKey).sort()[0];
      const series = [];
      if (firstSaleKey) {
        for (let d = firstSaleKey; d <= yesterdayKey; d = addDaysToKey(d, 1)) {
          series.push({ date: d, value: p.qtyByDate[d] || 0 });
        }
      }
      return {
        productName: p.productName,
        category: p.category,
        series,
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

// Forecast ng isang produkto para sa isang comparison horizon, optionally
// using the longer model and taking only its first comparison-horizon days.
function forecastOneProduct(series, horizonKey, futureDates, modelHorizonKey = horizonKey) {
  const horizon = TIMEFRAME_DAYS[horizonKey];

  const { values } = runForecastModel(series, futureDates, {
    ...getModelOptions(modelHorizonKey),
    // FIX: total units ng susunod na 7/30 araw ang kailangan dito, kinukumpara
    // sa aktwal na total ng huling 7/30 araw. Magkaiba ang bilang ng bawat
    // weekday sa dalawang window (lalo na sa 30 araw), kaya kapag may weekday
    // shape, nagkakaroon ng ±3-5% na "pagbabago" kahit walang totoong galaw
    // (at nagbabago pa ito depende sa araw ng linggo kung kailan tumakbo ang
    // cron). Kaya walang weekday shape sa product total. Ang Sales Forecast
    // (na may daily chart) ay gumagamit pa rin ng weekday shape.
    useSeasonality: false,
  });

  const forecast = Math.round(sumOf(values.slice(0, horizon)));
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
function backtestProductHorizon(products, horizonKey, useThirtyDayForecast = false) {
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

      const modelHorizonKey = useThirtyDayForecast && isProductEligible(train, "30d")
        ? "30d"
        : horizonKey;
      const futureDates = Array.from(
        { length: TIMEFRAME_DAYS[modelHorizonKey] },
        (_, i) => addDaysToKey(test[0].date, i)
      );
      const result = forecastOneProduct(train, horizonKey, futureDates, modelHorizonKey);
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

const unitsOfProduct = (p) => sumOf(p.series.map((x) => x.value));

// GATE (per product): ang produktong pasok lang sa eligibility rules ang
// maaaring ipadala kay Gemini.
function eligibleProductsFor(products, horizonKey) {
  return products.filter((p) => isProductEligible(p.series, horizonKey));
}

// DIAGNOSTIC LOG (walang epekto sa forecast): bakit pumasa/bagsak ang bawat produkto.
function logProductEligibility(scoped, eligibleCount, horizonKey) {
  const rules = PRODUCT_FORECAST_RULES[horizonKey];
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
      return { name: p.productName, total: unitsOfProduct(p), days, active, recent, fails };
    })
    .sort((a, b) => b.total - a.total);
  console.log(`[ProductForecastService][${horizonKey}] ${eligibleCount}/${scoped.length} products eligible. Top 15 by units:`);
  for (const r of rows.slice(0, 15)) {
    console.log(`  - ${r.name}: total=${r.total}, daysSinceFirstSale=${r.days}, activeDays=${r.active}, recentUnits=${r.recent} -> ${r.fails.length ? "FAIL (" + r.fails.join(", ") + ")" : "OK"}`);
  }
}

// Prompt para kay Gemini. Ang series ay outlier-capped na (winsorizeByWeekday).
function buildProductForecastPrompt(products, { todayKey }) {
  const systemPrompt = [
    "You are a product-demand analyst for a small food business.",
    "Your forecasting method is FIXED: Holt-Winters triple exponential smoothing (level + trend + seasonality), applied separately to each product. Do not substitute any other method (no moving average, no regression, no guessing).",
    "Settings for every product: seasonal period = 7 (weekly, aligned to the weekday of that product's first date), additive trend, additive seasonality (many products have zero-sale days, so multiplicative seasonality is not valid).",
    "For each product: fit the model on its whole dailyUnits series (initialise level, trend and the 7 seasonal indices from its first 14 days; choose alpha, beta, gamma in (0,1) that minimise one-step-ahead squared error), forecast each of the next 30 days, floor each daily value at 0, then add the 30 daily values to get next30Units.",
    "The data is already aggregated by the system: units sold per calendar day (Asia/Manila), cancelled orders excluded, outlier days already capped. Each product series starts on its first sale date and every day without a sale after that is a real 0. Do not re-aggregate, drop or interpolate days.",
    "Use ONLY the data provided. Do not invent events, holidays or promotions.",
    "Return ONLY one JSON object. No markdown, no commentary.",
  ].join(" ");

  const userPrompt = JSON.stringify({
    task: `Apply Holt-Winters to every product's daily units and return the TOTAL units it will sell in the next 30 days, counting from ${todayKey} (today, inclusive).`,
    method: {
      algorithm: HOLT_WINTERS_SPEC.algorithm,
      seasonalPeriod: HOLT_WINTERS_SPEC.seasonalPeriod,
      trend: HOLT_WINTERS_SPEC.trend,
      seasonality: HOLT_WINTERS_SPEC.seasonality,
    },
    aggregation: {
      granularity: "daily",
      timezone: MANILA_TZ,
      metric: "units sold per calendar day per product (cancelled orders excluded)",
      missingDaysFilledWithZero: true,
      historyScope: "full history of each product, from its firstSaleDate to historyEndDate",
      minHistoryDays: FORECAST_HISTORY_DAYS["30d"],
    },
    historyEndDate: addDaysToKey(todayKey, -1),
    forecastStartDate: todayKey,
    forecastStartWeekday: WEEKDAY_NAMES[weekdayOfKey(todayKey)],
    products: products.map((p) => ({
      id: p.id,
      name: p.productName,
      category: p.category,
      firstSaleDate: p.series[0].date,
      firstSaleWeekday: WEEKDAY_NAMES[weekdayOfKey(p.series[0].date)],
      days: p.series.length,
      dailyUnits: winsorizeByWeekday(p.series).adjusted.join(","),
    })),
    outputFormat: `Return {"products":[{"id":"<same id>","next30Units":<whole number>}]} with one entry per product id. Whole numbers >= 0 only.`,
  });
  const rowProps = { id: { type: "STRING" }, next30Units: { type: "INTEGER" } };
  const responseSchema = {
    type: "OBJECT",
    properties: {
      products: {
        type: "ARRAY",
        items: { type: "OBJECT", properties: rowProps, required: Object.keys(rowProps) },
      },
    },
    required: ["products"],
  };
  return { systemPrompt, userPrompt, responseSchema };
}

// Bounded: bawat ikot ay binabawasan ang listahan (hindi tumatawag kay Gemini).
function fitProductsToTokenBudget(candidates, buildPrompt) {
  const { maxPromptTokens, minProductsInPrompt, shrinkFactor } = AI_FORECAST_GUARD;
  let list = candidates;
  let prompts = buildPrompt(list);
  while (
    estimateTokens(prompts.systemPrompt) + estimateTokens(prompts.userPrompt) > maxPromptTokens
    && list.length > minProductsInPrompt
  ) {
    list = list.slice(0, Math.max(minProductsInPrompt, Math.floor(list.length * shrinkFactor)));
    prompts = buildPrompt(list);
  }
  if (list.length < candidates.length) {
    console.warn(`[ProductForecastService] Token budget: ${list.length}/${candidates.length} products lang ang ipinadala kay Gemini (pinakamabenta muna).`);
  }
  return { list, prompts };
}

// VALIDATOR: id lang na ipinadala ang tatanggapin; may upper-bound bawat
// produkto. TOLERANT sa shape (alias ng keys, numeric strings, id-or-name) at
// Kapag wala pang kalahati ng ipinadalang products ang may valid na 30d result, reject.
const pickNumber = (row, keys) => {
  for (const k of keys) {
    const v = row?.[k];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(typeof v === "string" ? v.replace(/[,\s]/g, "") : v);
    if (Number.isFinite(n)) return n;
  }
  return NaN;
};

function parseProductAiResult(raw, { sentById }) {
  const rows = Array.isArray(raw.products) ? raw.products
    : Array.isArray(raw.forecasts) ? raw.forecasts
    : Array.isArray(raw.data) ? raw.data
    : null;
  if (!rows) throw new Error(`Gemini result is missing the "products" array. Keys received: [${Object.keys(raw).join(", ")}]`);

  const byName = new Map([...sentById.values()].map((p) => [String(p.productName).trim().toLowerCase(), p]));
  const tally = { unknownId: 0, duplicate: 0, bad30: 0 };
  const byId = new Map();

  for (const row of rows) {
    const rawId = row?.id ?? row?.productId ?? row?.product_id;
    const src = sentById.get(String(rawId ?? "").trim())
      || byName.get(String(row?.name ?? row?.productName ?? "").trim().toLowerCase());
    if (!src) { tally.unknownId += 1; continue; }
    if (byId.has(src.id)) { tally.duplicate += 1; continue; }

    const recent30 = sumOf(src.series.slice(-30).map((p) => p.value));
    const f30 = pickNumber(row, ["next30Units", "next_30_units", "next30", "units30d", "forecast30d"]);

    const ok30 = Number.isFinite(f30) && f30 >= 0 && f30 <= recent30 * 3 + 15;
    if (!ok30) tally.bad30 += 1;
    if (!ok30) continue;

    byId.set(src.id, { f30: Math.round(f30) });
  }

  const minValid = Math.ceil(sentById.size * 0.5);
  if (byId.size < minValid) {
    const sample = JSON.stringify(rows.slice(0, 2)).slice(0, 300);
    throw new Error(
      `Only ${byId.size}/${sentById.size} product forecasts passed validation (need ${minValid}) — response rejected. ` +
      `rowsReceived=${rows.length}, reasons=${JSON.stringify(tally)}, sample=${sample}`
    );
  }
  return byId;
}

function buildProductHorizonPayload({ products, aiById, horizonKey }) {
  const horizon = TIMEFRAME_DAYS[horizonKey];
  const rules = PRODUCT_FORECAST_RULES[horizonKey];

  const scoped = products.filter((p) => p.series.length > 0);
  const eligible = scoped.filter((p) => isProductEligible(p.series, horizonKey));
  logProductEligibility(scoped, eligible.length, horizonKey);

  if (eligible.length === 0) {
    return productInsufficientPart(
      horizonKey,
      `No product has enough sales history yet for a ${horizon}-day trend (needs ${rules.minDaysSinceFirstSale}+ days since first sale, ${rules.minActiveDays}+ days with sales, and ${rules.minUnitsRecent}+ units recently).`
    );
  }

  const aiKey = "f30";
  const results = [];
  for (const p of eligible) {
    const ai = aiById.get(p.id);
    if (!ai || ai[aiKey] === null || ai[aiKey] === undefined) continue;
    const recentQty = sumOf(p.series.slice(-horizon).map((x) => x.value));
    const forecast = ai[aiKey];
    const diff = forecast - recentQty;
    const pct = recentQty > 0 ? Math.round((diff / recentQty) * 100) : null;
    results.push({ name: p.productName, forecast, recentQty, diff, pct });
  }

  if (results.length === 0) {
    return productInsufficientPart(horizonKey, "AI forecast did not return a usable result for any eligible product.");
  }

  const toListItem = (r) => ({ name: r.name, pct: r.pct, diff: r.diff, forecast: r.forecast, recentQty: r.recentQty });

  const growth = results
    .filter((r) => r.diff > 0 && isMeaningfulChange(r, horizonKey))
    .sort((a, b) => b.diff - a.diff)
    .slice(0, PRODUCT_LIST_MAX)
    .map(toListItem);

  // At risk = forecast na BUMABABA (pct <= riskPctCeiling, negatibo).
  const risk = results
    .filter((r) => r.pct !== null && r.diff <= -rules.minAbsChange && r.pct <= rules.riskPctCeiling)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, PRODUCT_LIST_MAX)
    .map(toListItem);

  // Keep enough per-product evidence in Render logs to explain why a product
  // entered or left the at-risk list between scheduled runs.
  for (const r of results) {
    const isAtRisk = r.pct !== null
      && r.diff <= -rules.minAbsChange
      && r.pct <= rules.riskPctCeiling;
    console.log(`[ProductForecastService][${horizonKey}] Product comparison: ${JSON.stringify({
      name: r.name,
      [`actualLast${horizon}d`]: r.recentQty,
      [`forecastNext${horizon}d`]: r.forecast,
      change: r.diff,
      changePct: r.pct,
      atRisk: isAtRisk,
      riskRule: `change <= -${rules.minAbsChange} units and changePct <= ${rules.riskPctCeiling}%`,
    })}`);
  }

  const recentUnitsAll = sumOf(results.map((r) => r.recentQty));
  const forecastUnitsAll = sumOf(results.map((r) => r.forecast));
  const totals = {
    recentUnits: recentUnitsAll,
    forecastUnits: forecastUnitsAll,
    pct: recentUnitsAll > 0 ? Math.round(((forecastUnitsAll - recentUnitsAll) / recentUnitsAll) * 100) : null,
  };
  console.log(`[ProductForecastService][${horizonKey}] TOTAL units (AI-covered products): last ${horizon}d actual=${totals.recentUnits} -> next ${horizon}d forecast=${totals.forecastUnits} (${totals.pct}%)`);
  console.log(`[ProductForecastService][${horizonKey}] growth=${growth.length}, risk=${risk.length}`);

  return {
    label: PF_TIMEFRAME_LABELS[horizonKey],
    growth,
    risk,
    insufficientData: false,
    generatedAt: new Date().toISOString(),
    eligibleProducts: eligible.length,
    skippedProducts: scoped.length - eligible.length,
    aiCoveredProducts: results.length,
    totals,
    // Hindi ma-backtest nang mura ang sagot ni Gemini; ang accuracy na ipinapakita
    // sa method.baselineAccuracy ay ng NON-AI na statistical baseline (reference lang).
    accuracy: null,
    method: {
      type: "Holt-Winters (additive trend, additive weekly seasonality, period 7) executed by Gemini AI per product over the full daily history (first sale date to yesterday; at least 90 days required) aggregated by the system (missing days = 0; eligibility rules + outlier cap); statistical baseline kept only as a reference",
      model: HOLT_WINTERS_SPEC,
      historyDays: scoped.reduce((m, p) => Math.max(m, p.series.length), 0),
      minHistoryDays: FORECAST_HISTORY_DAYS[horizonKey],
      rules,
      comparison: `AI forecast of next ${horizon} days vs actual units sold in the last ${horizon} days`,
      baselineAccuracy: backtestProductHorizon(scoped, horizonKey, false),
    },
  };
}

// Cron/refresh entry point. Isang 30-day Gemini call, walang retry.
async function runProductForecastRefresh() {
  const thirtyCheck = await checkForecastDataSufficiency("30d");

  if (!thirtyCheck.sufficient) {
    const payload = { thirtyDay: productInsufficientPart("30d", thirtyCheck.message) };
    await AiCacheModel.upsert(PRODUCT_COMBINED_CACHE_KEY, payload, PF_CACHE_TTL_MS);
    return payload;
  }

  let payload;
  try {
    const { products, todayKey } = await getProductDailySeries();

    if (products.length === 0) {
      const noActivityMessage = "No product sales activity found in the historical window.";
      payload = { thirtyDay: productInsufficientPart("30d", noActivityMessage) };
    } else if (products.reduce((m, p) => Math.max(m, p.series.length), 0) < FORECAST_HISTORY_DAYS["30d"]) {
      // Backend check: wala pang 90 araw ang history mula sa unang benta hanggang kahapon — walang forecast.
      payload = { thirtyDay: productInsufficientPart("30d", thirtyCheck.message || `Not enough historical data yet — a 30-day forecast requires at least ${FORECAST_HISTORY_DAYS["30d"]} days of past sales data.`) };
    } else {
      const withIds = products.map((p, i) => ({ ...p, id: `p${i + 1}` }));

      // GATE: ang eligible lang sa 30d forecast ang ipapadala kay Gemini.
      const candidates = eligibleProductsFor(withIds, "30d")
        .sort((a, b) => unitsOfProduct(b) - unitsOfProduct(a));

      let aiById = new Map();
      if (candidates.length > 0) {
        const { list, prompts } = fitProductsToTokenBudget(
          candidates,
          (subset) => buildProductForecastPrompt(subset, { todayKey })
        );
        const sentById = new Map(list.map((p) => [p.id, p]));
        aiById = await callGeminiForecastOnce(
          "ProductForecast",
          prompts,
          (raw) => parseProductAiResult(raw, { sentById })
        );
      }

      payload = { thirtyDay: buildProductHorizonPayload({ products: withIds, aiById, horizonKey: "30d" }) };
    }
  } catch (err) {
    console.error("[ProductForecastService] AI forecast failed — walang retry hanggang sa susunod na cron run:", err.message);

    // Huwag burahin ang huling magandang forecast dahil lang pumalya ngayon.
    const existing = await AiCacheModel.getByKey(PRODUCT_COMBINED_CACHE_KEY);
    if (isUsableProductCache(existing)) {
      console.warn("[ProductForecastService] Kept the previous cached forecast.");
      return existing.payload;
    }

    const failMessage = "AI forecast unavailable right now. Will retry on next cron run.";
    payload = { thirtyDay: productInsufficientPart("30d", failMessage) };
  }

  await AiCacheModel.upsert(PRODUCT_COMBINED_CACHE_KEY, payload, PF_CACHE_TTL_MS);
  return payload;
}

// Single-flight: kapag may tumatakbo na, sasabay lang — walang pangalawang Gemini call.
const refreshProductForecast = () => singleFlight("product_forecast", runProductForecastRefresh);

// Read-only lookup used by the frontend routes.
async function getProductForecastRead(timeframe) {
  const cached = await AiCacheModel.getByKey(PRODUCT_COMBINED_CACHE_KEY);
  const part = cached?.payload?.thirtyDay;

  if (part && !part.insufficientData) {
    return { ...part, insufficientData: false };
  }

  return {
    ...emptyProductPayload("30d"),
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

    if (forceRefresh) {
      await refreshProductForecast();
    }

    return getProductForecastRead("30d");
  },

  // Explicit cron entry point: 30-day forecast lang.
  refreshProductForecast,
};

// ==========================================
// 3. SALES FORECAST SERVICE (GEMINI AI OVER SYSTEM-FILTERED DATA)
// ==========================================
// Si Gemini ang nag-aanalyze ng daily sales history at nagbibigay ng forecast.
// Ang system ang nag-fi-filter bago ipadala (sufficiency gate, active-days gate,
// outlier cap, buong history na may minimum na 90 araw) at nagva-validate ng sagot (shape, per-day cap,
// total vs statistical baseline). Ang resulta ay isinusulat sa AI cache.
// Isang Gemini call lang kada refresh para sa 30-day forecast. Walang retry loop.
const SF_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function buildSalesCacheKey(timeframe) {
  return `sales_forecast:${timeframe}`;
}

// AGGREGATION (bago ipadala kay Gemini / sa Holt-Winters):
//   - metric: SUM ng amount_paid (aktwal na natanggap na bayad) kada ARAW —
//     parehong basehan ng KPI at Performance Summary. Cancelled orders hindi kasama.
//   - Araw = Manila calendar day (Asia/Manila), hindi UTC.
//   - Kumpletong araw lang: BUONG history, mula sa unang araw na may benta
//     (total amount_paid > 0) hanggang KAHAPON. Hindi kasama ang ngayon dahil
//     hindi pa tapos ang araw.
//   - Bawat araw sa pagitan ng simula at kahapon ay may row. Kapag walang
//     order sa araw na iyon, ang value ay 0 (tunay na zero-sales day), para
//     tuloy-tuloy ang series at hindi masira ang weekly (period = 7) pattern.
// Ang sufficiency gate (checkForecastDataSufficiency) at ang length check sa
// runSalesForecastRefresh ang nagsisiguro na may history na umabot sa
// minimum na 90 araw bago tumawag kay Gemini.
async function getSalesDailySeries() {
  const { dateKeys: [yesterdayKey], endISO, todayKey } = getManilaHistoryWindow(1);
  const startISO = new Date(0).toISOString();

  const orders = await fetchRangeUncapped(
    (from, to) => OrdersModel.getByDateRange(from, to, {
      columns: "amount_paid, created_at",
      excludeCancelled: true,
      dateColumn: "created_at",
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
    if (day > yesterdayKey) continue;
    totalsByDate[day] = (totalsByDate[day] || 0) + Number(order.amount_paid || 0);
  }

  // Simula sa unang araw na may benta (total amount_paid > 0).
  const firstDate = Object.keys(totalsByDate).filter((d) => totalsByDate[d] > 0).sort()[0];
  if (!firstDate) return { series: [], todayKey };

  // Isang row kada araw hanggang kahapon; walang benta = 0.
  const series = [];
  for (let d = firstDate; d <= yesterdayKey; d = addDaysToKey(d, 1)) {
    series.push({ date: d, value: Math.round((totalsByDate[d] || 0) * 100) / 100 });
  }

  const zeroDays = series.filter((p) => p.value === 0).length;
  console.log(
    `[SalesForecastService] Aggregated ${orders.length} order(s) into ${series.length} daily rows ` +
    `(${series[0].date} -> ${series[series.length - 1].date}), ${zeroDays} zero-sales day(s) filled with 0.`
  );

  return { series, todayKey };
}

// Safety check bago ipadala kay Gemini: hindi bababa sa minimum na bilang ng
// araw, walang butas sa petsa, at puro numero ang values.
function assertContinuousDailySeries(series, minDays) {
  if (!Array.isArray(series) || series.length < minDays) {
    throw new Error(`Daily series must have at least ${minDays} days, got ${series?.length ?? 0}.`);
  }
  for (let i = 0; i < series.length; i++) {
    if (!Number.isFinite(series[i].value)) {
      throw new Error(`Daily series has a non-numeric value on ${series[i].date}.`);
    }
    if (i > 0 && series[i].date !== addDaysToKey(series[i - 1].date, 1)) {
      throw new Error(`Daily series has a gap between ${series[i - 1].date} and ${series[i].date}.`);
    }
  }
}

function insufficientSalesPayload(message) {
  return {
    chartData: [],
    insufficientData: true,
    message: message || "No cached forecast available. Awaiting Cron execution.",
  };
}

const SF_DAILY_CAP_MULTIPLIER = 1.5;    // forecast ng isang araw <= 1.5x ng pinakamataas na (capped) araw
const SF_TOTAL_SANITY_BAND = { min: 0.5, max: 2.0 }; // total ng AI vs statistical baseline

function buildSalesForecastPrompt({ filteredHistory, futureDates, referenceByHorizon }) {
  const horizonDays = futureDates.length;
  const horizonKey = `${horizonDays}d`;
  const baselineTotal = Number(referenceByHorizon[horizonKey]?.baselineTotal || 0);
  const recent30DayActual = sumOf(filteredHistory.slice(-30).map((point) => point.value));
  const forecastTotalRanges = Object.fromEntries(
    Object.entries(referenceByHorizon).map(([key, reference]) => {
      const total = Number(reference.baselineTotal || 0);
      return [key, {
        baselineTotal: Math.round(total),
        minimum: Math.round(total * SF_TOTAL_SANITY_BAND.min),
        maximum: Math.round(total * SF_TOTAL_SANITY_BAND.max),
      }];
    })
  );
  const scaleReference = {
    currency: "PHP",
    recent30DayActualTotal: Math.round(recent30DayActual),
    recent30DayAveragePerCalendarDay: Math.round(recent30DayActual / 30),
    statisticalForecastTotalsByHorizon: forecastTotalRanges,
  };
  const historyDays = filteredHistory.length;
  const zeroDays = filteredHistory.filter((p) => p.value === 0).length;
  const startDate = filteredHistory[0].date;

  const systemPrompt = [
    "You are a demand-forecasting analyst for a small food business.",
    "Your forecasting method is FIXED: Holt-Winters triple exponential smoothing (level + trend + seasonality). Do not substitute any other method (no moving average, no regression, no guessing).",
    "Settings: seasonal period = 7 (weekly, aligned to the weekday of the first history date), additive trend, additive seasonality (the series contains zero-sales days, so multiplicative seasonality is not valid).",
    "Fit the model on the whole dailySales history: initialise level, trend and the 7 seasonal indices from the first 14 days, choose alpha, beta, gamma in (0,1) that minimise one-step-ahead squared error, then forecast each date in forecastDates as level + h * trend + the seasonal index of that date's weekday. Floor every forecast at 0.",
    "lower and upper form an approximately 80% prediction interval: forecast -/+ 1.28 x the standard deviation of the in-sample one-step residuals (lower floored at 0).",
    "The history is already aggregated by the system: one value per calendar day (Asia/Manila), PHP amount actually paid, cancelled orders excluded, days without sales are 0, outlier days already capped. Treat every 0 as a real zero-sales day. Do not re-aggregate, drop or interpolate days.",
    "Forecast revenue amounts in PHP only, not product units, order counts, or thousands of PHP.",
    "scaleReference is only a sanity range. Do NOT copy it as the forecast; your forecast must come from the Holt-Winters fit, and the 30-day total must fall within the 30d minimum and maximum range in scaleReference.",
    "Use ONLY the data provided. Do not invent events, holidays or promotions.",
    "Return ONLY one JSON object. No markdown, no commentary.",
  ].join(" ");

  const userPrompt = JSON.stringify({
    task: `Apply Holt-Winters (additive trend, additive weekly seasonality, period 7) to the full daily sales history from ${startDate} to ${filteredHistory[historyDays - 1].date} and forecast daily sales (PHP, actual amount paid) for the next ${horizonDays} days.`,
    method: {
      algorithm: HOLT_WINTERS_SPEC.algorithm,
      seasonalPeriod: HOLT_WINTERS_SPEC.seasonalPeriod,
      trend: HOLT_WINTERS_SPEC.trend,
      seasonality: HOLT_WINTERS_SPEC.seasonality,
    },
    aggregation: {
      granularity: "daily",
      timezone: MANILA_TZ,
      metric: "sum of amount_paid per calendar day (cancelled orders excluded)",
      missingDaysFilledWithZero: true,
      days: historyDays,
      minHistoryDays: FORECAST_HISTORY_DAYS["30d"],
      zeroSalesDays: zeroDays,
    },
    history: {
      startDate,
      startWeekday: WEEKDAY_NAMES[weekdayOfKey(startDate)],
      endDate: filteredHistory[historyDays - 1].date,
      days: historyDays,
      dailySales: filteredHistory.map((p) => Math.round(p.value)),
    },
    scaleReference,
    forecastDates: futureDates,
    forecastStartWeekday: WEEKDAY_NAMES[weekdayOfKey(futureDates[0])],
    outputFormat: `Return {"forecast":[...],"lower":[...],"upper":[...]} where each array has exactly ${horizonDays} whole numbers aligned with forecastDates, and 0 <= lower <= forecast <= upper.`,
  });

  const intArray = { type: "ARRAY", items: { type: "INTEGER" } };
  const responseSchema = {
    type: "OBJECT",
    properties: { forecast: intArray, lower: intArray, upper: intArray },
    required: ["forecast", "lower", "upper"],
  };
  return { systemPrompt, userPrompt, responseSchema };
}

// VALIDATOR: shape, per-day cap, at total laban sa statistical baseline.
// Hindi pumasa = throw (walang retry; cooldown ang hahawak).
function parseSalesAiResult(raw, { horizonDays, dailyCap, baselineTotal }) {
  const forecastRaw = toNumberArray(raw.forecast, horizonDays);
  if (!forecastRaw) throw new Error(`Invalid "forecast" array (expected ${horizonDays} finite numbers).`);

  const forecast = forecastRaw.map((v) => Math.round(dailyCap > 0 ? Math.min(v, dailyCap) : v));
  const total = sumOf(forecast);
  const key = "30d";
  if (baselineTotal > 0) {
    const ratio = total / baselineTotal;
    if (ratio < SF_TOTAL_SANITY_BAND.min || ratio > SF_TOTAL_SANITY_BAND.max) {
      throw new Error(
        `AI ${key} forecast total ${total} is ${ratio.toFixed(2)}x the statistical baseline (${Math.round(baselineTotal)}) — outside ${SF_TOTAL_SANITY_BAND.min}-${SF_TOTAL_SANITY_BAND.max}x, rejected.`
      );
    }
  }

  const lowerRaw = toNumberArray(raw.lower, horizonDays);
  const upperRaw = toNumberArray(raw.upper, horizonDays);
  return {
    forecast,
    lower: lowerRaw ? lowerRaw.map((v, i) => Math.round(Math.min(v, forecast[i]))) : null,
    upper: upperRaw ? upperRaw.map((v, i) => Math.round(Math.max(v, forecast[i]))) : null,
  };
}

// ---------- Month-position (day-of-month) pattern ----------
// Gives the 30-day Sales Forecast a payday-style shape across the month
// instead of four identical copies of the weekly pattern. Computed from the
// RAW daily series (before winsorizeByWeekday), Manila date keys. Returns
// null when there is not enough history or no meaningful pattern, in which
// case the forecast is left exactly as Gemini returned it.
const MONTH_POSITION_BUCKETS = ["1-5", "6-10", "11-15", "16-20", "21-25", "26-31"];
const MONTH_POSITION_MIN_COMPLETE_MONTHS = 3;
const MONTH_POSITION_MIN_DAYS_PER_BUCKET = 10;
const MONTH_POSITION_SHRINK = 0.5;
const MONTH_POSITION_CLAMP = { min: 0.75, max: 1.35 };
const MONTH_POSITION_MIN_SPREAD = 0.10;

function monthPositionBucketOfKey(key) {
  const day = Number(String(key).slice(8, 10));
  return Math.min(MONTH_POSITION_BUCKETS.length - 1, Math.floor((day - 1) / 5));
}

// Calendar months fully inside the series (first day >= first date, last day <= last date).
function countCompleteCalendarMonths(series) {
  if (!series.length) return 0;
  const first = series[0].date;
  const last = series[series.length - 1].date;
  let year = Number(first.slice(0, 4));
  let month = Number(first.slice(5, 7)) - 1; // 0-based
  const monthStart = (y, m) => new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const monthEnd = (y, m) => new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

  if (monthStart(year, month) < first) {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  let count = 0;
  while (monthEnd(year, month) <= last) {
    count += 1;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
  }
  return count;
}

function computeMonthPositionIndex(series) {
  if (!Array.isArray(series) || series.length === 0) return null;
  if (countCompleteCalendarMonths(series) < MONTH_POSITION_MIN_COMPLETE_MONTHS) return null;

  // Weekday index: same logic as runForecastModel, but on the RAW series.
  const raw = series.map((p) => p.value);
  const overallRaw = meanOf(raw);
  if (!(overallRaw > 0)) return null;
  let weekdayIndex = Array.from({ length: 7 }, (_, w) => {
    const values = raw.filter((_, i) => weekdayOfKey(series[i].date) === w);
    return values.length >= FORECAST_MODEL.minWeekdaySamples ? meanOf(values) / overallRaw : 1;
  });
  const avgIndex = meanOf(weekdayIndex) || 1;
  weekdayIndex = weekdayIndex.map((x) => x / avgIndex);

  // Deseasonalize each day, then group by day-of-month bucket. A weekday
  // with index 0 (e.g. never any sales) cannot be deseasonalized, so those
  // days are left out.
  const bucketValues = MONTH_POSITION_BUCKETS.map(() => []);
  const allValues = [];
  series.forEach((point, i) => {
    const wIdx = weekdayIndex[weekdayOfKey(point.date)];
    if (!(wIdx > 0) || !Number.isFinite(raw[i])) return;
    const deseasonalized = raw[i] / wIdx;
    bucketValues[monthPositionBucketOfKey(point.date)].push(deseasonalized);
    allValues.push(deseasonalized);
  });

  if (bucketValues.some((v) => v.length < MONTH_POSITION_MIN_DAYS_PER_BUCKET)) return null;
  const overall = meanOf(allValues);
  if (!(overall > 0)) return null;

  const indexes = bucketValues.map((values) => {
    const rawIndex = meanOf(values) / overall;
    const shrunk = 1 + (rawIndex - 1) * MONTH_POSITION_SHRINK;
    return Math.min(MONTH_POSITION_CLAMP.max, Math.max(MONTH_POSITION_CLAMP.min, shrunk));
  });

  if (Math.max(...indexes) - Math.min(...indexes) < MONTH_POSITION_MIN_SPREAD) return null;

  return Object.fromEntries(
    MONTH_POSITION_BUCKETS.map((name, b) => [name, Math.round(indexes[b] * 1000) / 1000])
  );
}

// Reshapes forecast / lower / upper by the month-position index, then
// rescales all three by ONE factor so the 30-day forecast total stays the
// same. Whole numbers out; the forecast total is kept exact.
function applyMonthPositionIndex(ai, futureDates, monthIndex) {
  if (!monthIndex) return ai;
  const mult = futureDates.map((d) => monthIndex[MONTH_POSITION_BUCKETS[monthPositionBucketOfKey(d)]] ?? 1);

  const originalTotal = sumOf(ai.forecast);
  const shapedForecast = ai.forecast.map((v, i) => v * mult[i]);
  const shapedTotal = sumOf(shapedForecast);
  if (!(originalTotal > 0) || !(shapedTotal > 0)) return ai;
  const factor = originalTotal / shapedTotal;

  // Forecast: largest-remainder rounding so the whole-number total equals the original.
  const scaled = shapedForecast.map((v) => v * factor);
  const floors = scaled.map(Math.floor);
  let remainder = Math.round(originalTotal) - sumOf(floors);
  const order = scaled.map((v, i) => ({ i, frac: v - floors[i] })).sort((a, b) => b.frac - a.frac);
  const forecast = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++, remainder--) forecast[order[k].i] += 1;

  const reshape = (arr) => (arr ? arr.map((v, i) => Math.round(v * mult[i] * factor)) : null);
  const lower = reshape(ai.lower);
  const upper = reshape(ai.upper);

  return {
    forecast,
    lower: lower ? lower.map((v, i) => Math.min(v, forecast[i])) : null,
    upper: upper ? upper.map((v, i) => Math.max(v, forecast[i])) : null,
  };
}

function buildSalesHorizonPayload({ history, ai, futureDates, horizonKey, baselineMeta, outlierCount, monthPositionIndex = null }) {
  const horizon = TIMEFRAME_DAYS[horizonKey];

  const chartData = futureDates.slice(0, horizon).map((date, i) => ({
    date,
    label: formatForecastLabel(date),
    isToday: i === 0,
    forecastSales: ai.forecast[i],
    lower: ai.lower ? ai.lower[i] : null,
    upper: ai.upper ? ai.upper[i] : null,
  }));

  // Para madaling i-reconcile sa totoong data: actual na benta ng huling N araw
  // vs forecast ng susunod na N araw.
  const recentTotal = sumOf(history.slice(-horizon).map((p) => p.value));
  const forecastTotal = sumOf(chartData.map((d) => d.forecastSales));
  const totals = {
    recentTotal,
    forecastTotal,
    pct: recentTotal > 0 ? Math.round(((forecastTotal - recentTotal) / recentTotal) * 100) : null,
  };
  console.log(`[SalesForecastService][${horizonKey}] TOTAL sales: last ${horizon}d actual=${totals.recentTotal} -> next ${horizon}d forecast=${totals.forecastTotal} (${totals.pct}%)`);

  const opts = getModelOptions(horizonKey);
  const { pairs, origins } = backtestSeriesModel(history, horizonKey, opts);

  return {
    chartData,
    insufficientData: false,
    generatedAt: new Date().toISOString(),
    totals,
    // Hindi ma-backtest nang mura ang sagot ni Gemini; ang statisticalBaselineAccuracy
    // ay ng NON-AI baseline (reference lang).
    accuracy: null,
    method: {
      ...describeForecastMethod(horizonKey, history.length, {
        ...baselineMeta,
        outliersCapped: outlierCount,
        promptHistoryDays: history.length,
      }),
      statisticalBaselineAccuracy: summarizeBacktestPairs(pairs, origins),
      monthPositionIndex,
    },
  };
}

// Cron/refresh entry point. Isang 30-day Gemini call, walang retry.
async function runSalesForecastRefresh() {
  const thirtyCheck = await checkForecastDataSufficiency("30d");

  if (!thirtyCheck.sufficient) {
    const payload = insufficientSalesPayload(thirtyCheck.message);
    await AiCacheModel.upsert(buildSalesCacheKey("30d"), payload, SF_CACHE_TTL_MS);
    return payload;
  }

  let thirtyPayload;

  try {
    const { series, todayKey } = await getSalesDailySeries();
    // BACKEND CHECK: kailangan ng minimum na history (unang benta -> kahapon) bago mag-forecast.
    const minHistoryDays = FORECAST_HISTORY_DAYS["30d"];
    const enoughHistory = series.length >= minHistoryDays;
    if (enoughHistory) assertContinuousDailySeries(series, minHistoryDays);

    // GATE: sapat na araw na may benta bago tumawag kay Gemini.
    const activeDays = series.filter((p) => p.value > 0).length;
    const ready30 = enoughHistory && activeDays >= SALES_MIN_ACTIVE_DAYS["30d"];
    const activityMessage = (hk) =>
      `Not enough sales activity yet — only ${activeDays} day(s) with sales in the available history (a ${TIMEFRAME_DAYS[hk]}-day forecast needs at least ${SALES_MIN_ACTIVE_DAYS[hk]}).`;

    if (!ready30) {
      thirtyPayload = insufficientSalesPayload(
        enoughHistory
          ? activityMessage("30d")
          : `Not enough historical data yet — a 30-day forecast requires at least ${minHistoryDays} days of past sales data.`
      );
    } else {
      const horizonDays = 30;
      const futureDates = buildFutureDateKeys(todayKey, horizonDays);

      // FILTER: outlier-capped na BUONG history (walang cap sa bilang ng araw).
      const { adjusted, outlierCount } = winsorizeByWeekday(series);
      const filteredHistory = series
        .map((p, i) => ({ date: p.date, value: adjusted[i] }));
      const dailyCap = Math.max(...filteredHistory.map((p) => p.value)) * SF_DAILY_CAP_MULTIPLIER;

      // Statistical reference (hindi ito ang forecast): ipinapakita kay Gemini
      // bilang konteksto, at ginagamit ng system pang-sanity check ng sagot.
      const baselines = { "30d": runForecastModel(series, futureDates, getModelOptions("30d")) };

      const referenceByHorizon = Object.fromEntries(
        Object.entries(baselines).map(([hk, b]) => [hk, {
          level: b.meta.level,
          trendRatio: b.meta.trendRatio,
          weekdayIndex: b.meta.weekdayIndex,
          baselineTotal: Math.round(sumOf(b.values)),
        }])
      );
      const baselineTotal = sumOf(baselines["30d"].values);
      const baseline = baselines["30d"];
      const recent30dActual = sumOf(series.slice(-30).map((point) => point.value));
      console.log(
        `[SalesForecastService] Baseline diagnostics: historyDays=${series.length}, recent30dActual=${Math.round(recent30dActual)}, baselineLevel=${baseline.meta.level}, baseline30d=${Math.round(baselineTotal)}`
      );

      const prompts = buildSalesForecastPrompt({ filteredHistory, futureDates, referenceByHorizon });
      const ai = await callGeminiForecastOnce(
        "SalesForecast",
        prompts,
        (raw) => parseSalesAiResult(raw, { horizonDays, dailyCap, baselineTotal })
      );

      // Month-position shaping (payday etc.) on the validated forecast; the
      // 30-day total is unchanged. null index = no adjustment.
      const monthPositionIndex = computeMonthPositionIndex(series);
      const shapedAi = applyMonthPositionIndex(ai, futureDates, monthPositionIndex);

      thirtyPayload = buildSalesHorizonPayload({
        history: series, ai: shapedAi, futureDates, horizonKey: "30d", baselineMeta: baselines["30d"].meta, outlierCount, monthPositionIndex,
      });
    }
  } catch (err) {
    console.error("[SalesForecastService] AI forecast failed — walang retry hanggang sa susunod na cron run:", err.message);

    // Huwag burahin ang huling magandang forecast dahil lang pumalya ngayon.
    const cached30 = await AiCacheModel.getByKey(buildSalesCacheKey("30d"));
    const keep30 = isUsableSalesCache(cached30);
    const failed = insufficientSalesPayload("AI forecast unavailable right now. Will retry on next cron run.");

    if (!keep30) await AiCacheModel.upsert(buildSalesCacheKey("30d"), failed, SF_CACHE_TTL_MS);

    return keep30 ? cached30.payload : failed;
  }

  await AiCacheModel.upsert(buildSalesCacheKey("30d"), thirtyPayload, SF_CACHE_TTL_MS);

  return thirtyPayload;
}

// Single-flight: kapag may tumatakbo na, sasabay lang — walang pangalawang Gemini call.
const refreshSalesForecast = () => singleFlight("sales_forecast", runSalesForecastRefresh);

// Read-only lookup used by the frontend routes. Never recomputes.
async function getSalesForecastRead(timeframe) {
  const cached = await AiCacheModel.getByKey(buildSalesCacheKey("30d"));
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

    if (forceRefresh) {
      await refreshSalesForecast();
    }

    return getSalesForecastRead("30d");
  },

  // Explicit cron entry point: 30-day forecast lang.
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

const isUsableSummaryCache = (cached) =>
  !!(cached?.payload && String(cached.payload.summaryText || "").trim().length > 0);

const PerformanceSummaryService = {
  async getPerformanceSummary(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await AiCacheModel.getByKey(PS_MASTER_CACHE_KEY);
      if (isUsableSummaryCache(cached)) {
        return { ...cached.payload, insufficientData: false };
      }
      return { ...emptySummaryPayload(), insufficientData: true, message: "No cached summary available. Awaiting Cron execution." };
    }

    return singleFlight("performance_summary", async () => {
      try {
        const context = await getSummaryContext();
        const { systemPrompt, userPrompt } = buildSummaryPrompt(context);
        const aiResult = await callGeminiJSON({ systemPrompt, userPrompt });
        const payload = normalizeSummaryPayload(aiResult, context);

        if (!payload.summaryText.trim()) {
          throw new Error("Gemini returned an empty performance summary.");
        }

        await AiCacheModel.upsert(PS_MASTER_CACHE_KEY, payload, PS_CACHE_TTL_MS);
        console.log(`[PerformanceSummaryService] Fresh summary generated and cached: ${JSON.stringify(payload)}`);
        return { ...payload, insufficientData: false };
      } catch (err) {
        console.error("[PerformanceSummaryService] Gemini summary failed:", err.message);
        const existingCache = await AiCacheModel.getByKey(PS_MASTER_CACHE_KEY).catch(() => null);
        if (isUsableSummaryCache(existingCache)) {
          console.warn(`[PerformanceSummaryService] Kept previous cached summary: ${JSON.stringify(existingCache.payload)}`);
          return { ...existingCache.payload, insufficientData: false };
        }
        return {
          ...emptySummaryPayload(),
          insufficientData: true,
          message: "AI summary unavailable right now. Will retry on next cron run.",
        };
      }
    });
  },
};

export {
  ActionableRecommendationService,
  ProductForecastService,
  SalesForecastService,
  PerformanceSummaryService
};
