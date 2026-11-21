-- Automatically move the remaining quantity of an expired raw-ingredient
-- batch to waste atomically. The source link remains as a permanent audit
-- marker, including when an automatic waste record is later voided.
ALTER TABLE public.waste_logs
  ADD COLUMN IF NOT EXISTS source_inventory_log_id uuid
  REFERENCES public.inventory_logs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS waste_logs_expiry_source_key
  ON public.waste_logs (source_inventory_log_id)
  WHERE source_inventory_log_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.convert_inventory_unit(
  p_quantity numeric,
  p_from_unit text,
  p_to_unit text
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from text := lower(trim(coalesce(p_from_unit, '')));
  v_to text := lower(trim(coalesce(p_to_unit, '')));
  v_from_group text;
  v_to_group text;
  v_from_factor numeric;
  v_to_factor numeric;
BEGIN
  IF p_quantity IS NULL OR v_from = '' OR v_to = '' THEN
    RETURN NULL;
  END IF;
  IF v_from = v_to THEN
    RETURN p_quantity;
  END IF;

  CASE v_from
    WHEN 'g' THEN v_from_group := 'mass'; v_from_factor := 1;
    WHEN 'gram' THEN v_from_group := 'mass'; v_from_factor := 1;
    WHEN 'grams' THEN v_from_group := 'mass'; v_from_factor := 1;
    WHEN 'kg' THEN v_from_group := 'mass'; v_from_factor := 1000;
    WHEN 'kilo' THEN v_from_group := 'mass'; v_from_factor := 1000;
    WHEN 'kilogram' THEN v_from_group := 'mass'; v_from_factor := 1000;
    WHEN 'kilograms' THEN v_from_group := 'mass'; v_from_factor := 1000;
    WHEN 'ml' THEN v_from_group := 'volume'; v_from_factor := 1;
    WHEN 'milliliter' THEN v_from_group := 'volume'; v_from_factor := 1;
    WHEN 'milliliters' THEN v_from_group := 'volume'; v_from_factor := 1;
    WHEN 'l' THEN v_from_group := 'volume'; v_from_factor := 1000;
    WHEN 'liter' THEN v_from_group := 'volume'; v_from_factor := 1000;
    WHEN 'liters' THEN v_from_group := 'volume'; v_from_factor := 1000;
    WHEN 'litre' THEN v_from_group := 'volume'; v_from_factor := 1000;
    WHEN 'litres' THEN v_from_group := 'volume'; v_from_factor := 1000;
    WHEN 'pcs' THEN v_from_group := 'count'; v_from_factor := 1;
    WHEN 'pc' THEN v_from_group := 'count'; v_from_factor := 1;
    WHEN 'piece' THEN v_from_group := 'count'; v_from_factor := 1;
    WHEN 'pieces' THEN v_from_group := 'count'; v_from_factor := 1;
    WHEN 'dozen' THEN v_from_group := 'count'; v_from_factor := 12;
    WHEN 'doz' THEN v_from_group := 'count'; v_from_factor := 12;
    WHEN 'dz' THEN v_from_group := 'count'; v_from_factor := 12;
    WHEN 'm' THEN v_from_group := 'length'; v_from_factor := 1;
    WHEN 'meter' THEN v_from_group := 'length'; v_from_factor := 1;
    WHEN 'meters' THEN v_from_group := 'length'; v_from_factor := 1;
    WHEN 'metre' THEN v_from_group := 'length'; v_from_factor := 1;
    WHEN 'metres' THEN v_from_group := 'length'; v_from_factor := 1;
    WHEN 'yd' THEN v_from_group := 'length'; v_from_factor := 0.9144;
    WHEN 'yard' THEN v_from_group := 'length'; v_from_factor := 0.9144;
    WHEN 'yards' THEN v_from_group := 'length'; v_from_factor := 0.9144;
    WHEN 'yds' THEN v_from_group := 'length'; v_from_factor := 0.9144;
    ELSE RETURN NULL;
  END CASE;

  CASE v_to
    WHEN 'g' THEN v_to_group := 'mass'; v_to_factor := 1;
    WHEN 'gram' THEN v_to_group := 'mass'; v_to_factor := 1;
    WHEN 'grams' THEN v_to_group := 'mass'; v_to_factor := 1;
    WHEN 'kg' THEN v_to_group := 'mass'; v_to_factor := 1000;
    WHEN 'kilo' THEN v_to_group := 'mass'; v_to_factor := 1000;
    WHEN 'kilogram' THEN v_to_group := 'mass'; v_to_factor := 1000;
    WHEN 'kilograms' THEN v_to_group := 'mass'; v_to_factor := 1000;
    WHEN 'ml' THEN v_to_group := 'volume'; v_to_factor := 1;
    WHEN 'milliliter' THEN v_to_group := 'volume'; v_to_factor := 1;
    WHEN 'milliliters' THEN v_to_group := 'volume'; v_to_factor := 1;
    WHEN 'l' THEN v_to_group := 'volume'; v_to_factor := 1000;
    WHEN 'liter' THEN v_to_group := 'volume'; v_to_factor := 1000;
    WHEN 'liters' THEN v_to_group := 'volume'; v_to_factor := 1000;
    WHEN 'litre' THEN v_to_group := 'volume'; v_to_factor := 1000;
    WHEN 'litres' THEN v_to_group := 'volume'; v_to_factor := 1000;
    WHEN 'pcs' THEN v_to_group := 'count'; v_to_factor := 1;
    WHEN 'pc' THEN v_to_group := 'count'; v_to_factor := 1;
    WHEN 'piece' THEN v_to_group := 'count'; v_to_factor := 1;
    WHEN 'pieces' THEN v_to_group := 'count'; v_to_factor := 1;
    WHEN 'dozen' THEN v_to_group := 'count'; v_to_factor := 12;
    WHEN 'doz' THEN v_to_group := 'count'; v_to_factor := 12;
    WHEN 'dz' THEN v_to_group := 'count'; v_to_factor := 12;
    WHEN 'm' THEN v_to_group := 'length'; v_to_factor := 1;
    WHEN 'meter' THEN v_to_group := 'length'; v_to_factor := 1;
    WHEN 'meters' THEN v_to_group := 'length'; v_to_factor := 1;
    WHEN 'metre' THEN v_to_group := 'length'; v_to_factor := 1;
    WHEN 'metres' THEN v_to_group := 'length'; v_to_factor := 1;
    WHEN 'yd' THEN v_to_group := 'length'; v_to_factor := 0.9144;
    WHEN 'yard' THEN v_to_group := 'length'; v_to_factor := 0.9144;
    WHEN 'yards' THEN v_to_group := 'length'; v_to_factor := 0.9144;
    WHEN 'yds' THEN v_to_group := 'length'; v_to_factor := 0.9144;
    ELSE RETURN NULL;
  END CASE;

  IF v_from_group <> v_to_group THEN
    RETURN NULL;
  END IF;
  RETURN p_quantity * v_from_factor / v_to_factor;
END;
$$;

CREATE OR REPLACE FUNCTION public.auto_log_expired_inventory_batches(
  p_as_of date DEFAULT (now() AT TIME ZONE 'Asia/Manila')::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch record;
  v_item record;
  v_stock_quantity numeric;
  v_stock_unit text;
  v_batch_unit text;
  v_original_unit_quantity numeric;
  v_quantity_in_stock_unit numeric;
  v_cost numeric;
  v_waste_id uuid;
  v_logged integer := 0;
  v_skipped integer := 0;
BEGIN
  FOR v_batch IN
    SELECT l.id, l.raw_ingredient_id, l.item_name, l.unit, l.remaining_unit,
           l.quantity, l.cost, l.remaining_quantity, l.expiration_date
    FROM public.inventory_logs l
    WHERE l.item_type = 'raw'
      AND l.transaction_type = 'IN'
      AND l.raw_ingredient_id IS NOT NULL
      AND l.voided_at IS NULL
      AND l.expiration_date < p_as_of
      AND l.remaining_quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.waste_logs w
        WHERE w.source_inventory_log_id = l.id
      )
    ORDER BY l.expiration_date, l.created_at
    FOR UPDATE OF l SKIP LOCKED
  LOOP
    SELECT i.stock_quantity, i.unit
      INTO v_stock_quantity, v_stock_unit
      FROM public.raw_ingredients i
      WHERE i.id = v_batch.raw_ingredient_id
      FOR UPDATE;
    IF NOT FOUND THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_batch_unit := coalesce(nullif(v_batch.remaining_unit, ''), v_batch.unit);
    v_quantity_in_stock_unit := public.convert_inventory_unit(
      v_batch.remaining_quantity, v_batch_unit, v_stock_unit
    );
    IF v_quantity_in_stock_unit IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_original_unit_quantity := public.convert_inventory_unit(
      v_batch.remaining_quantity, v_batch_unit, v_batch.unit
    );
    v_cost := CASE WHEN coalesce(v_batch.quantity, 0) > 0 AND v_original_unit_quantity IS NOT NULL
      THEN round(coalesce(v_batch.cost, 0) * v_original_unit_quantity / v_batch.quantity, 2)
      ELSE 0 END;

    INSERT INTO public.waste_logs (
      waste_type, item_name, quantity, unit, reason, notes, cost, source_inventory_log_id
    ) VALUES (
      'ingredient'::public.waste_type,
      v_batch.item_name,
      v_batch.remaining_quantity,
      v_batch_unit,
      'Expired',
      'Automatically logged when the inventory batch expired.',
      v_cost,
      v_batch.id
    )
    ON CONFLICT (source_inventory_log_id)
      WHERE source_inventory_log_id IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_waste_id;

    IF v_waste_id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.raw_ingredients
      SET stock_quantity = greatest(0, coalesce(v_stock_quantity, 0) - v_quantity_in_stock_unit)
      WHERE id = v_batch.raw_ingredient_id;

    UPDATE public.inventory_logs
      SET remaining_quantity = 0
      WHERE id = v_batch.id;

    INSERT INTO public.inventory_logs (
      item_type, item_name, raw_ingredient_id, unit, transaction_type,
      quantity, cost, action, expiration_date, remaining_quantity, remaining_unit
    ) VALUES (
      'raw', v_batch.item_name, v_batch.raw_ingredient_id, v_batch_unit, 'OUT',
      v_batch.remaining_quantity, v_cost, 'Waste', v_batch.expiration_date, 0, v_batch_unit
    );

    v_logged := v_logged + 1;
  END LOOP;

  RETURN jsonb_build_object('logged', v_logged, 'skipped', v_skipped);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_auto_expired_waste(p_waste_log_id uuid)
RETURNS public.waste_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_waste public.waste_logs%ROWTYPE;
  v_batch public.inventory_logs%ROWTYPE;
  v_stock_quantity numeric;
  v_stock_unit text;
  v_batch_unit text;
  v_stock_restore numeric;
  v_updated public.waste_logs%ROWTYPE;
BEGIN
  SELECT * INTO v_waste
    FROM public.waste_logs
    WHERE id = p_waste_log_id
    FOR UPDATE;
  IF NOT FOUND OR v_waste.source_inventory_log_id IS NULL THEN
    RAISE EXCEPTION 'Automatic expired waste record not found.';
  END IF;
  IF v_waste.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'This waste record is already voided.';
  END IF;

  SELECT * INTO v_batch
    FROM public.inventory_logs
    WHERE id = v_waste.source_inventory_log_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The source inventory batch no longer exists.';
  END IF;
  IF v_batch.remaining_quantity > 0 THEN
    RAISE EXCEPTION 'The source batch already has remaining stock; it cannot be restored twice.';
  END IF;

  SELECT stock_quantity, unit INTO v_stock_quantity, v_stock_unit
    FROM public.raw_ingredients
    WHERE id = v_batch.raw_ingredient_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The source ingredient no longer exists.';
  END IF;

  v_batch_unit := coalesce(nullif(v_batch.remaining_unit, ''), v_batch.unit);
  v_stock_restore := public.convert_inventory_unit(v_waste.quantity, v_waste.unit, v_stock_unit);
  IF v_stock_restore IS NULL THEN
    RAISE EXCEPTION 'Cannot convert expired batch quantity from % to %.', v_waste.unit, v_stock_unit;
  END IF;

  UPDATE public.raw_ingredients
    SET stock_quantity = coalesce(v_stock_quantity, 0) + v_stock_restore
    WHERE id = v_batch.raw_ingredient_id;
  UPDATE public.inventory_logs
    SET remaining_quantity = remaining_quantity + v_waste.quantity
    WHERE id = v_batch.id;
  UPDATE public.waste_logs
    SET voided_at = now()
    WHERE id = v_waste.id
    RETURNING * INTO v_updated;

  INSERT INTO public.inventory_logs (
    item_type, item_name, raw_ingredient_id, unit, transaction_type,
    quantity, cost, action, expiration_date, remaining_quantity, remaining_unit
  ) VALUES (
    'raw', v_batch.item_name, v_batch.raw_ingredient_id, v_batch_unit, 'IN',
    v_waste.quantity, 0, 'Void Expired Waste', v_batch.expiration_date, 0, v_batch_unit
  );

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_inventory_unit(numeric, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.auto_log_expired_inventory_batches(date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.void_auto_expired_waste(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_log_expired_inventory_batches(date) TO service_role;
GRANT EXECUTE ON FUNCTION public.void_auto_expired_waste(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
