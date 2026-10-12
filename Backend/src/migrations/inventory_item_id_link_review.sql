-- Run after inventory_item_id_links.sql. Any returned rows need manual review.

-- Existing production-formula rows that could not be matched by exact name.
SELECT id, recipe_id, item_type, item_name, quantity, unit
FROM public.recipe_ingredients
WHERE (item_type = 'raw' AND raw_ingredient_id IS NULL)
   OR (item_type = 'material' AND material_id IS NULL)
ORDER BY item_type, item_name;

-- Inventory logs without a linked item. Review especially active IN lots,
-- because their remaining quantities participate in FEFO stock deductions.
SELECT id, item_type, item_name, transaction_type, quantity, remaining_quantity,
       unit, remaining_unit, action, created_at
FROM public.inventory_logs
WHERE (item_type = 'raw' AND raw_ingredient_id IS NULL)
   OR (item_type = 'material' AND material_id IS NULL)
ORDER BY item_type, item_name, created_at;

-- Production deduction and waste history without an item link.
SELECT id, item_type, item_name, quantity, unit
FROM public.production_deductions
WHERE (item_type = 'raw' AND raw_ingredient_id IS NULL)
   OR (item_type = 'material' AND material_id IS NULL)
ORDER BY item_type, item_name;

SELECT id, waste_type, item_name, quantity, unit, logged_at
FROM public.waste_logs
WHERE (waste_type = 'ingredient' AND raw_ingredient_id IS NULL)
   OR (waste_type = 'material' AND material_id IS NULL)
ORDER BY waste_type, item_name, logged_at;
