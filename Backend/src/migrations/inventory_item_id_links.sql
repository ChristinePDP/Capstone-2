-- Link formulas and operational inventory logs to stable inventory UUIDs.
-- Run this migration before deploying the matching backend/frontend changes.

BEGIN;

ALTER TABLE public.recipe_ingredients
  ADD COLUMN IF NOT EXISTS raw_ingredient_id uuid,
  ADD COLUMN IF NOT EXISTS material_id uuid;

ALTER TABLE public.inventory_logs
  ADD COLUMN IF NOT EXISTS raw_ingredient_id uuid,
  ADD COLUMN IF NOT EXISTS material_id uuid,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS remaining_unit text;

ALTER TABLE public.production_deductions
  ADD COLUMN IF NOT EXISTS raw_ingredient_id uuid,
  ADD COLUMN IF NOT EXISTS material_id uuid;

ALTER TABLE public.waste_logs
  ADD COLUMN IF NOT EXISTS raw_ingredient_id uuid,
  ADD COLUMN IF NOT EXISTS material_id uuid;

-- Backfill only exact name/type matches. Inventory names are unique in each
-- table, so these joins are deterministic. Unmatched rows stay NULL for review.
UPDATE public.recipe_ingredients ri
SET raw_ingredient_id = i.id
FROM public.raw_ingredients i
WHERE ri.item_type = 'raw'
  AND ri.raw_ingredient_id IS NULL
  AND ri.item_name = i.name;

UPDATE public.recipe_ingredients ri
SET material_id = m.id
FROM public.celebration_materials m
WHERE ri.item_type = 'material'
  AND ri.material_id IS NULL
  AND ri.item_name = m.name;

UPDATE public.inventory_logs l
SET raw_ingredient_id = i.id,
    unit = COALESCE(l.unit, i.unit),
    remaining_unit = COALESCE(l.remaining_unit, i.unit)
FROM public.raw_ingredients i
WHERE l.item_type = 'raw'
  AND l.item_name = i.name
  AND l.raw_ingredient_id IS NULL;

UPDATE public.inventory_logs l
SET material_id = m.id,
    unit = COALESCE(l.unit, m.unit),
    remaining_unit = COALESCE(l.remaining_unit, m.unit)
FROM public.celebration_materials m
WHERE l.item_type = 'material'
  AND l.item_name = m.name
  AND l.material_id IS NULL;

UPDATE public.production_deductions d
SET raw_ingredient_id = i.id
FROM public.raw_ingredients i
WHERE d.item_type = 'raw'
  AND d.item_name = i.name
  AND d.raw_ingredient_id IS NULL;

UPDATE public.production_deductions d
SET material_id = m.id
FROM public.celebration_materials m
WHERE d.item_type = 'material'
  AND d.item_name = m.name
  AND d.material_id IS NULL;

UPDATE public.waste_logs w
SET raw_ingredient_id = i.id
FROM public.raw_ingredients i
WHERE w.waste_type = 'ingredient'
  AND w.item_name = i.name
  AND w.raw_ingredient_id IS NULL;

UPDATE public.waste_logs w
SET material_id = m.id
FROM public.celebration_materials m
WHERE w.waste_type = 'material'
  AND w.item_name = m.name
  AND w.material_id IS NULL;

DO $$ BEGIN
  ALTER TABLE public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_raw_ingredient_id_fkey
    FOREIGN KEY (raw_ingredient_id) REFERENCES public.raw_ingredients(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES public.celebration_materials(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.inventory_logs
    ADD CONSTRAINT inventory_logs_raw_ingredient_id_fkey
    FOREIGN KEY (raw_ingredient_id) REFERENCES public.raw_ingredients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.inventory_logs
    ADD CONSTRAINT inventory_logs_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES public.celebration_materials(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.production_deductions
    ADD CONSTRAINT production_deductions_raw_ingredient_id_fkey
    FOREIGN KEY (raw_ingredient_id) REFERENCES public.raw_ingredients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.production_deductions
    ADD CONSTRAINT production_deductions_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES public.celebration_materials(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.waste_logs
    ADD CONSTRAINT waste_logs_raw_ingredient_id_fkey
    FOREIGN KEY (raw_ingredient_id) REFERENCES public.raw_ingredients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.waste_logs
    ADD CONSTRAINT waste_logs_material_id_fkey
    FOREIGN KEY (material_id) REFERENCES public.celebration_materials(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_raw_item ON public.recipe_ingredients(raw_ingredient_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_material_item ON public.recipe_ingredients(material_id);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_raw_item ON public.inventory_logs(raw_ingredient_id, expiration_date)
  WHERE remaining_quantity > 0 AND transaction_type = 'IN';
CREATE INDEX IF NOT EXISTS idx_inventory_logs_material_item ON public.inventory_logs(material_id, expiration_date)
  WHERE remaining_quantity > 0 AND transaction_type = 'IN';

DO $$ BEGIN
  ALTER TABLE public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_item_id_type_check
    CHECK (
      (raw_ingredient_id IS NULL OR (item_type = 'raw' AND material_id IS NULL))
      AND (material_id IS NULL OR (item_type = 'material' AND raw_ingredient_id IS NULL))
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.inventory_logs
    ADD CONSTRAINT inventory_logs_item_id_type_check
    CHECK (
      (raw_ingredient_id IS NULL OR (item_type = 'raw' AND material_id IS NULL))
      AND (material_id IS NULL OR (item_type = 'material' AND raw_ingredient_id IS NULL))
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.production_deductions
    ADD CONSTRAINT production_deductions_item_id_type_check
    CHECK (
      (raw_ingredient_id IS NULL OR (item_type = 'raw' AND material_id IS NULL))
      AND (material_id IS NULL OR (item_type = 'material' AND raw_ingredient_id IS NULL))
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.waste_logs
    ADD CONSTRAINT waste_logs_item_id_type_check
    CHECK (
      (raw_ingredient_id IS NULL OR (waste_type = 'ingredient' AND material_id IS NULL))
      AND (material_id IS NULL OR (waste_type = 'material' AND raw_ingredient_id IS NULL))
    ) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Convert only universal units. NULL means the units are incompatible.
CREATE OR REPLACE FUNCTION public.convert_inventory_quantity(p_quantity numeric, p_from text, p_to text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_from text := lower(trim(p_from));
  v_to text := lower(trim(p_to));
  v_from_group text;
  v_to_group text;
  v_from_factor numeric;
  v_to_factor numeric;
BEGIN
  IF p_quantity IS NULL OR p_from IS NULL OR p_to IS NULL THEN RETURN NULL; END IF;
  IF v_from = v_to THEN RETURN p_quantity; END IF;

  IF v_from IN ('g', 'gram', 'grams') THEN v_from_group := 'mass'; v_from_factor := 0.001;
  ELSIF v_from IN ('kg', 'kilo', 'kilogram', 'kilograms') THEN v_from_group := 'mass'; v_from_factor := 1;
  ELSIF v_from IN ('ml', 'milliliter', 'milliliters') THEN v_from_group := 'volume'; v_from_factor := 0.001;
  ELSIF v_from IN ('l', 'liter', 'liters', 'litre', 'litres') THEN v_from_group := 'volume'; v_from_factor := 1;
  ELSIF v_from IN ('pcs', 'pc', 'piece', 'pieces') THEN v_from_group := 'count'; v_from_factor := 1;
  ELSIF v_from IN ('dozen', 'doz', 'dz') THEN v_from_group := 'count'; v_from_factor := 12;
  ELSIF v_from IN ('m', 'meter', 'meters', 'metre', 'metres') THEN v_from_group := 'length'; v_from_factor := 1;
  ELSIF v_from IN ('yard', 'yards', 'yd', 'yds') THEN v_from_group := 'length'; v_from_factor := 0.9144;
  ELSE RETURN NULL;
  END IF;

  IF v_to IN ('g', 'gram', 'grams') THEN v_to_group := 'mass'; v_to_factor := 0.001;
  ELSIF v_to IN ('kg', 'kilo', 'kilogram', 'kilograms') THEN v_to_group := 'mass'; v_to_factor := 1;
  ELSIF v_to IN ('ml', 'milliliter', 'milliliters') THEN v_to_group := 'volume'; v_to_factor := 0.001;
  ELSIF v_to IN ('l', 'liter', 'liters', 'litre', 'litres') THEN v_to_group := 'volume'; v_to_factor := 1;
  ELSIF v_to IN ('pcs', 'pc', 'piece', 'pieces') THEN v_to_group := 'count'; v_to_factor := 1;
  ELSIF v_to IN ('dozen', 'doz', 'dz') THEN v_to_group := 'count'; v_to_factor := 12;
  ELSIF v_to IN ('m', 'meter', 'meters', 'metre', 'metres') THEN v_to_group := 'length'; v_to_factor := 1;
  ELSIF v_to IN ('yard', 'yards', 'yd', 'yds') THEN v_to_group := 'length'; v_to_factor := 0.9144;
  ELSE RETURN NULL;
  END IF;

  IF v_from_group <> v_to_group THEN RETURN NULL; END IF;
  RETURN p_quantity * v_from_factor / v_to_factor;
END;
$$;

-- These RPCs lock the inventory row, preserve its total value, and convert
-- active FEFO lot balances as one database transaction. Historical quantity
-- and unit columns remain unchanged; only remaining_quantity/remaining_unit
-- are converted so future deductions use the new stock unit safely.
CREATE OR REPLACE FUNCTION public.update_raw_ingredient_details(
  p_id uuid, p_name text, p_unit text, p_minimum_stock numeric
) RETURNS public.raw_ingredients
LANGUAGE plpgsql
AS $$
DECLARE v_item public.raw_ingredients; v_factor numeric; v_new_stock numeric;
BEGIN
  SELECT * INTO v_item FROM public.raw_ingredients WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingredient not found'; END IF;
  v_factor := public.convert_inventory_quantity(1, v_item.unit, p_unit);
  IF v_factor IS NULL OR v_factor <= 0 THEN RAISE EXCEPTION 'Incompatible inventory units: % to %', v_item.unit, p_unit; END IF;
  v_new_stock := public.convert_inventory_quantity(v_item.stock_quantity, v_item.unit, p_unit);

  UPDATE public.inventory_logs
  SET remaining_quantity = public.convert_inventory_quantity(remaining_quantity, COALESCE(remaining_unit, v_item.unit), p_unit),
      remaining_unit = p_unit
  WHERE raw_ingredient_id = p_id AND transaction_type = 'IN'
    AND remaining_quantity > 0 AND voided_at IS NULL;

  UPDATE public.raw_ingredients
  SET name = p_name, unit = p_unit, stock_quantity = v_new_stock,
      minimum_stock = p_minimum_stock, cost_per_unit = cost_per_unit / v_factor,
      updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_item;
  RETURN v_item;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_material_details(
  p_id uuid, p_name text, p_unit text, p_minimum_stock numeric, p_product_id uuid
) RETURNS public.celebration_materials
LANGUAGE plpgsql
AS $$
DECLARE v_item public.celebration_materials; v_factor numeric; v_new_stock numeric;
BEGIN
  SELECT * INTO v_item FROM public.celebration_materials WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
  v_factor := public.convert_inventory_quantity(1, v_item.unit, p_unit);
  IF v_factor IS NULL OR v_factor <= 0 THEN RAISE EXCEPTION 'Incompatible inventory units: % to %', v_item.unit, p_unit; END IF;
  v_new_stock := public.convert_inventory_quantity(v_item.stock_quantity, v_item.unit, p_unit);

  UPDATE public.inventory_logs
  SET remaining_quantity = public.convert_inventory_quantity(remaining_quantity, COALESCE(remaining_unit, v_item.unit), p_unit),
      remaining_unit = p_unit
  WHERE material_id = p_id AND transaction_type = 'IN'
    AND remaining_quantity > 0 AND voided_at IS NULL;

  UPDATE public.celebration_materials
  SET name = p_name, unit = p_unit, stock_quantity = v_new_stock,
      minimum_stock = p_minimum_stock, cost_per_unit = cost_per_unit / v_factor,
      product_id = p_product_id, updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_item;
  RETURN v_item;
END;
$$;

COMMIT;

-- Review unmapped historical formula rows after the backfill:
-- SELECT id, item_type, item_name FROM public.recipe_ingredients
-- WHERE (item_type = 'raw' AND raw_ingredient_id IS NULL)
--    OR (item_type = 'material' AND material_id IS NULL);
