-- Preserve the numeric additional_charge column for calculations and reports.
-- Store the audit reason separately so existing orders remain compatible.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS additional_charge_details jsonb NOT NULL DEFAULT '{}'::jsonb;
