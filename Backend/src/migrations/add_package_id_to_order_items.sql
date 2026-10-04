BEGIN;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS package_id uuid;

COMMIT;

NOTIFY pgrst, 'reload schema';
