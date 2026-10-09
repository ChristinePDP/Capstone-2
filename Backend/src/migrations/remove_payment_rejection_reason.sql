-- Remove rejection-reason storage; payment accept/reject status remains intact.
BEGIN;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS payment_rejection_reason;

COMMIT;
