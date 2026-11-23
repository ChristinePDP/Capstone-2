-- Apply once to add soft archive support to products. Event and bundle status is unchanged.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
UPDATE public.products SET is_archived = true WHERE is_active = false;
ALTER TABLE public.products DROP COLUMN IF EXISTS is_active;

CREATE INDEX IF NOT EXISTS products_is_archived_idx ON public.products (is_archived);
