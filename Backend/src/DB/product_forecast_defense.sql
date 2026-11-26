-- Product Forecast evidence query (PostgreSQL / Supabase SQL Editor)
-- Leave forecast_date_override as NULL to use today's Manila date.
-- For a historical run, set it to the Manila date when that forecast ran.
-- The result includes raw sales, the adjusted daily series sent to Gemini,
-- forecast eligibility, and the exact comma-separated Gemini input per eligible product.

WITH
settings AS (
  -- NULL uses today's Manila date. For a historical run, set DATE '2026-11-21'.
  SELECT NULL::date AS forecast_date_override
),
params AS MATERIALIZED (
  SELECT
    COALESCE(forecast_date_override, (now() AT TIME ZONE 'Asia/Manila')::date) AS forecast_date,
    COALESCE(forecast_date_override, (now() AT TIME ZONE 'Asia/Manila')::date) - 1 AS history_end_date
  FROM settings
),
source_rows AS (
  SELECT
    CASE
      WHEN oi.product_id IS NOT NULL THEN 'id:' || oi.product_id::text
      ELSE 'name:' || lower(btrim(COALESCE(NULLIF(oi.product_name, ''), p.name, '')))
    END AS product_key,
    COALESCE(NULLIF(btrim(oi.product_name), ''), p.name) AS product_name,
    (o.created_at AT TIME ZONE 'Asia/Manila')::date AS sale_date,
    oi.quantity::integer AS units
  FROM public.order_items AS oi
  JOIN public.orders AS o ON o.id = oi.order_id
  LEFT JOIN public.products AS p ON p.id = oi.product_id
  CROSS JOIN params AS prm
  WHERE o.status::text <> 'Cancelled'
    AND (o.created_at AT TIME ZONE 'Asia/Manila')::date <= prm.history_end_date
    AND NULLIF(btrim(COALESCE(oi.product_name, p.name, '')), '') IS NOT NULL
),
daily_sales AS (
  SELECT product_key, MIN(product_name) AS product_name, sale_date, SUM(units)::integer AS raw_units
  FROM source_rows
  GROUP BY product_key, sale_date
),
product_bounds AS (
  SELECT product_key, MIN(product_name) AS product_name, MIN(sale_date) AS first_sale_date
  FROM daily_sales
  WHERE raw_units > 0
  GROUP BY product_key
),
daily_series AS (
  SELECT
    pb.product_key,
    pb.product_name,
    gs.day::date AS sale_date,
    COALESCE(ds.raw_units, 0)::integer AS raw_units
  FROM product_bounds AS pb
  CROSS JOIN params AS prm
  CROSS JOIN LATERAL generate_series(
    pb.first_sale_date::timestamp,
    prm.history_end_date::timestamp,
    interval '1 day'
  ) AS gs(day)
  LEFT JOIN daily_sales AS ds
    ON ds.product_key = pb.product_key
   AND ds.sale_date = gs.day::date
),
local_baselines AS (
  SELECT
    ds.*,
    (
      COALESCE(SUM(raw_units) OVER (
        PARTITION BY product_key ORDER BY sale_date
        ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
      ), 0)
      +
      COALESCE(SUM(raw_units) OVER (
        PARTITION BY product_key ORDER BY sale_date
        ROWS BETWEEN 1 FOLLOWING AND 7 FOLLOWING
      ), 0)
    )::numeric
    /
    NULLIF(
      COALESCE(COUNT(*) OVER (
        PARTITION BY product_key ORDER BY sale_date
        ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING
      ), 0)
      +
      COALESCE(COUNT(*) OVER (
        PARTITION BY product_key ORDER BY sale_date
        ROWS BETWEEN 1 FOLLOWING AND 7 FOLLOWING
      ), 0),
      0
    ) AS local_baseline
  FROM daily_series AS ds
),
raw_weekday_iqr AS (
  SELECT
    product_key,
    EXTRACT(DOW FROM sale_date)::integer AS weekday,
    COUNT(*) AS sample_count,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY raw_units::double precision) AS q1,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY raw_units::double precision) AS q3
  FROM local_baselines
  GROUP BY product_key, EXTRACT(DOW FROM sale_date)::integer
),
ratio_samples AS (
  SELECT
    product_key,
    EXTRACT(DOW FROM sale_date)::integer AS weekday,
    raw_units::numeric / local_baseline AS value_ratio
  FROM local_baselines
  WHERE local_baseline > 0
),
ratio_weekday_iqr AS (
  SELECT
    product_key,
    weekday,
    COUNT(*) AS sample_count,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY value_ratio::double precision) AS q1,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY value_ratio::double precision) AS q3
  FROM ratio_samples
  GROUP BY product_key, weekday
),
adjusted_series AS (
  SELECT
    lb.product_key,
    lb.product_name,
    lb.sale_date,
    lb.raw_units,
    CASE
      WHEN rwi.sample_count >= 8
       AND rwi.q3 > rwi.q1
       AND qwi.sample_count >= 8
       AND qwi.q3 > qwi.q1
       AND lb.local_baseline > 0
       AND lb.raw_units::numeric / lb.local_baseline > qwi.q3 + 1.5 * (qwi.q3 - qwi.q1)
        THEN round(lb.local_baseline * (qwi.q3 + 1.5 * (qwi.q3 - qwi.q1)))::integer
      WHEN rwi.sample_count >= 8
       AND rwi.q3 > rwi.q1
       AND qwi.sample_count >= 8
       AND qwi.q3 > qwi.q1
       AND lb.local_baseline > 0
       AND lb.raw_units::numeric / lb.local_baseline < qwi.q1 - 1.5 * (qwi.q3 - qwi.q1)
        THEN GREATEST(0, round(lb.local_baseline * (qwi.q1 - 1.5 * (qwi.q3 - qwi.q1)))::integer)
      ELSE lb.raw_units
    END AS gemini_units
  FROM local_baselines AS lb
  LEFT JOIN raw_weekday_iqr AS rwi
    ON rwi.product_key = lb.product_key
   AND rwi.weekday = EXTRACT(DOW FROM lb.sale_date)::integer
  LEFT JOIN ratio_weekday_iqr AS qwi
    ON qwi.product_key = lb.product_key
   AND qwi.weekday = EXTRACT(DOW FROM lb.sale_date)::integer
),
product_summary AS (
  SELECT
    a.product_key,
    MIN(a.product_name) AS product_name,
    MIN(a.sale_date) AS first_sale_date,
    MAX(a.sale_date) AS history_end_date,
    COUNT(*)::integer AS history_days,
    COUNT(*) FILTER (WHERE a.raw_units > 0)::integer AS active_sales_days,
    SUM(a.raw_units)::integer AS lifetime_units,
    COALESCE(SUM(a.raw_units) FILTER (
      WHERE a.sale_date BETWEEN prm.history_end_date - 29 AND prm.history_end_date
    ), 0)::integer AS recent_30_day_units,
    COUNT(*) FILTER (WHERE a.raw_units <> a.gemini_units)::integer AS outlier_days_adjusted,
    (
      COUNT(*) >= 14
      AND COUNT(*) FILTER (WHERE a.raw_units > 0) >= 2
      AND COALESCE(SUM(a.raw_units) FILTER (
        WHERE a.sale_date BETWEEN prm.history_end_date - 29 AND prm.history_end_date
      ), 0) >= 3
    ) AS eligible_for_forecast
  FROM adjusted_series AS a
  CROSS JOIN params AS prm
  GROUP BY a.product_key, prm.history_end_date
),
eligible_order AS (
  SELECT
    product_key,
    row_number() OVER (ORDER BY lifetime_units DESC, product_name) AS gemini_input_order
  FROM product_summary
  WHERE eligible_for_forecast
),
daily_evidence AS (
  SELECT
    product_key,
    jsonb_agg(
      jsonb_build_object(
        'date', sale_date,
        'raw_units', raw_units,
        'gemini_units', gemini_units
      ) ORDER BY sale_date
    ) AS daily_evidence,
    string_agg(gemini_units::text, ',' ORDER BY sale_date) AS gemini_daily_units
  FROM adjusted_series
  GROUP BY product_key
)
SELECT
  s.product_name,
  prm.forecast_date AS forecast_as_of_date,
  s.first_sale_date,
  s.history_end_date,
  s.history_days,
  s.active_sales_days,
  s.lifetime_units,
  s.recent_30_day_units,
  s.eligible_for_forecast,
  eo.gemini_input_order,
  s.outlier_days_adjusted,
  CASE WHEN s.eligible_for_forecast THEN de.gemini_daily_units END AS exact_gemini_daily_units,
  de.daily_evidence,
  (SELECT generated_at FROM public.ai_cache WHERE cache_key = 'product_forecast:combined') AS cached_forecast_generated_at,
  (SELECT payload #> '{thirtyDay,totals}' FROM public.ai_cache WHERE cache_key = 'product_forecast:combined') AS cached_forecast_totals,
  (SELECT payload #> '{thirtyDay,growth}' FROM public.ai_cache WHERE cache_key = 'product_forecast:combined') AS expected_to_rise,
  (SELECT payload #> '{thirtyDay,risk}' FROM public.ai_cache WHERE cache_key = 'product_forecast:combined') AS expected_to_drop
FROM product_summary AS s
CROSS JOIN params AS prm
LEFT JOIN eligible_order AS eo USING (product_key)
JOIN daily_evidence AS de USING (product_key)
ORDER BY s.lifetime_units DESC, s.product_name;

-- MODEL AND BACKTEST COMPARISON
-- This section is an SQL approximation of the deterministic product
-- reference model in aiAnalytics.service.js. It reproduces its level/trend
-- calculation and rolling origins, but simplifies the 30-day trend ramp and
-- omits the JS weekday-IQR outlier adjustment.
-- Treat its WAPE as an independent reference, not an exact production replay.
-- It reports rolling-origin WAPE versus the repeat-last-30-days baseline.
-- Gemini's current cache contains only
-- the growth/risk shortlist, so it cannot support historical Gemini WAPE; that
-- requires retaining each dated Gemini forecast and comparing it after its
-- 30-day actual window has completed.

WITH
cfg AS (
  SELECT (now() AT TIME ZONE 'Asia/Manila')::date AS today,
         (now() AT TIME ZONE 'Asia/Manila')::date - 1 AS history_end
),
source AS (
  SELECT
    CASE WHEN oi.product_id IS NOT NULL THEN 'id:' || oi.product_id::text
         ELSE 'name:' || lower(btrim(COALESCE(NULLIF(oi.product_name,''),p.name,''))) END AS product_key,
    COALESCE(NULLIF(btrim(oi.product_name),''),p.name) AS product_name,
    (o.created_at AT TIME ZONE 'Asia/Manila')::date AS sale_date,
    oi.quantity::numeric AS units
  FROM public.order_items oi
  JOIN public.orders o ON o.id=oi.order_id
  LEFT JOIN public.products p ON p.id=oi.product_id
  CROSS JOIN cfg c
  WHERE o.status::text <> 'Cancelled'
    AND (o.created_at AT TIME ZONE 'Asia/Manila')::date <= c.history_end
),
daily AS (
  SELECT product_key, min(product_name) product_name, sale_date, sum(units) units
  FROM source WHERE NULLIF(btrim(product_name),'') IS NOT NULL
  GROUP BY product_key,sale_date
),
bounds AS (
  SELECT product_key,min(product_name) product_name,min(sale_date) first_day
  FROM daily WHERE units>0 GROUP BY product_key
),
series AS (
  SELECT b.product_key,b.product_name,g.day::date AS sale_date,coalesce(d.units,0)::numeric units
  FROM bounds b CROSS JOIN cfg c
  CROSS JOIN LATERAL generate_series(b.first_day::timestamp,c.history_end::timestamp,interval '1 day') g(day)
  LEFT JOIN daily d ON d.product_key=b.product_key AND d.sale_date=g.day::date
),
origins AS (
  SELECT s.*, j.origin,
         (c.history_end - 30 - 7*j.origin)::date AS origin_end,
         (c.history_end - 29 - 7*j.origin)::date AS test_start,
         (c.history_end - 7*j.origin)::date AS test_end
  FROM series s CROSS JOIN cfg c CROSS JOIN generate_series(0,3) j(origin)
  WHERE s.sale_date <= c.history_end - 30 - 7*j.origin
),
train_stats AS (
  SELECT product_key,product_name,origin,origin_end,
         count(*)::int train_days,
         count(*) FILTER(WHERE units>0)::int active_days,
         sum(units) FILTER(WHERE sale_date>origin_end-30)::numeric recent30,
         avg(units) FILTER(WHERE sale_date>origin_end-30)::numeric level30,
         avg(units) FILTER(WHERE sale_date>origin_end-28)::numeric recent28,
         avg(units) FILTER(WHERE sale_date>origin_end-56 AND sale_date<=origin_end-28)::numeric prior28
  FROM origins GROUP BY product_key,product_name,origin,origin_end
),
backtest AS (
  SELECT t.product_key,t.product_name,t.origin,t.origin_end,
         sum(a.units)::numeric actual30,
         t.recent30::numeric baseline30,
         greatest(0,round(30*t.level30 * (1 + (least(1.3,greatest(0.7,
           CASE WHEN coalesce(t.prior28,0)>0 THEN t.recent28/t.prior28 ELSE 1 END
         )) - 1)*0.5)))::numeric db_forecast30
  FROM train_stats t
  JOIN daily a ON a.product_key=t.product_key
              AND a.sale_date>t.origin_end AND a.sale_date<=t.origin_end+30
  WHERE t.train_days>=14 AND t.active_days>=2 AND t.recent30>=3
  GROUP BY t.product_key,t.product_name,t.origin,t.origin_end,t.recent30,t.level30,t.recent28,t.prior28
),
metrics AS (
  SELECT product_key, min(product_name) product_name, count(*) samples,
         sum(actual30) total_actual,
         sum(abs(db_forecast30-actual30)) db_abs_error,
         sum(abs(baseline30-actual30)) baseline_abs_error,
         round(100*sum(abs(db_forecast30-actual30))/nullif(sum(actual30),0),1) db_wape_pct,
         round(100*sum(abs(baseline30-actual30))/nullif(sum(actual30),0),1) baseline_wape_pct,
         sum(abs(db_forecast30-actual30)) <= sum(abs(baseline30-actual30)) beats_baseline
  FROM backtest GROUP BY product_key
),
current_model AS (
  SELECT s.product_key,min(s.product_name) product_name,
         count(*) history_days,
         count(*) FILTER(WHERE units>0) active_days,
         sum(units) FILTER(WHERE sale_date>c.history_end-30) recent30,
         avg(units) FILTER(WHERE sale_date>c.history_end-30) level30,
         avg(units) FILTER(WHERE sale_date>c.history_end-28) recent28,
         avg(units) FILTER(WHERE sale_date>c.history_end-56 AND sale_date<=c.history_end-28) prior28
  FROM series s CROSS JOIN cfg c GROUP BY s.product_key
),
current_forecast AS (
  SELECT m.*,
    greatest(0,round(30*level30*(1+(least(1.3,greatest(0.7,
      CASE WHEN coalesce(prior28,0)>0 THEN recent28/prior28 ELSE 1 END
    ))-1)*0.5)))::numeric db_reference_next30
  FROM current_model m
),
ai_shortlist AS (
  SELECT item->>'name' product_name,
         (item->>'forecast')::numeric ai_forecast_next30,
         (item->>'recentQty')::numeric ai_comparison_recent30,
         'growth'::text list_type
  FROM public.ai_cache c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.payload#>'{thirtyDay,growth}','[]'::jsonb)) item
  WHERE c.cache_key='product_forecast:combined'
  UNION ALL
  SELECT item->>'name',(item->>'forecast')::numeric,(item->>'recentQty')::numeric,'risk'
  FROM public.ai_cache c CROSS JOIN LATERAL jsonb_array_elements(coalesce(c.payload#>'{thirtyDay,risk}','[]'::jsonb)) item
  WHERE c.cache_key='product_forecast:combined'
)
SELECT f.product_name,
       (SELECT generated_at FROM public.ai_cache WHERE cache_key='product_forecast:combined') ai_cache_generated_at,
       f.history_days,f.active_days,f.recent30,
       f.db_reference_next30,
       ai.list_type,ai.ai_forecast_next30,ai.ai_comparison_recent30,
       CASE WHEN ai.ai_forecast_next30 IS NOT NULL
            THEN abs(ai.ai_forecast_next30-f.db_reference_next30) END AS ai_vs_db_abs_difference,
       m.samples backtest_origins,m.total_actual backtest_actual_units,
       m.db_wape_pct,m.baseline_wape_pct,m.beats_baseline,
       CASE WHEN ai.ai_forecast_next30 IS NULL THEN 'AI per-product forecast unavailable in cache'
            ELSE 'Shortlist-only comparison; validate against actual sales after forecast horizon' END AS interpretation
FROM current_forecast f
LEFT JOIN metrics m USING(product_key)
LEFT JOIN ai_shortlist ai ON lower(btrim(ai.product_name))=lower(btrim(f.product_name))
WHERE f.history_days>=14 AND f.active_days>=2 AND f.recent30>=3
ORDER BY f.recent30 DESC,f.product_name;

