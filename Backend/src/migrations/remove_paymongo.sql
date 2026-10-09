-- Remove obsolete PayMongo-only storage after switching to manual payment.
-- Manual payment QR settings, proof, and verification columns are preserved.
BEGIN;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS paymongo_payment_id;

DROP TABLE IF EXISTS public.pending_orders;

COMMIT;