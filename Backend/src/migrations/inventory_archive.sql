-- Soft archive records that previously had destructive Delete actions in Inventory.
ALTER TABLE public.raw_ingredients ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.celebration_materials ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS raw_ingredients_is_archived_idx ON public.raw_ingredients (is_archived);
CREATE INDEX IF NOT EXISTS celebration_materials_is_archived_idx ON public.celebration_materials (is_archived);
CREATE INDEX IF NOT EXISTS recipes_is_archived_idx ON public.recipes (is_archived);
