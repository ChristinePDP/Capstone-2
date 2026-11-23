-- Links the Buy Now and Pre-Order fulfillment orders created by one POS checkout.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS transaction_group_id uuid;

CREATE INDEX IF NOT EXISTS orders_transaction_group_id_idx
  ON public.orders (transaction_group_id)
  WHERE transaction_group_id IS NOT NULL;
