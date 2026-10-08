-- Run this migration in Supabase SQL Editor after reviewing the deployed schema.
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'Pending Verification' BEFORE 'Confirmed';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS proof_of_payment_url text,
  ADD COLUMN IF NOT EXISTS proof_of_payment_path text,
  ADD COLUMN IF NOT EXISTS proof_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_verification_status text NOT NULL DEFAULT 'Accepted'
    CHECK (payment_verification_status IN ('Pending', 'Accepted', 'Rejected')),
  ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_verified_by uuid,
  ADD COLUMN IF NOT EXISTS payment_rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_orders_payment_verification_status
  ON public.orders(payment_verification_status);

CREATE TABLE IF NOT EXISTS public.payment_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  payment_qr_code_url text,
  payment_qr_code_path text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view payment QR settings" ON public.payment_settings;
CREATE POLICY "Public can view payment QR settings"
  ON public.payment_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated admins can insert payment settings" ON public.payment_settings;
CREATE POLICY "Authenticated admins can insert payment settings"
  ON public.payment_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated admins can update payment settings" ON public.payment_settings;
CREATE POLICY "Authenticated admins can update payment settings"
  ON public.payment_settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated admins can delete payment settings" ON public.payment_settings;
CREATE POLICY "Authenticated admins can delete payment settings"
  ON public.payment_settings
  FOR DELETE
  TO authenticated
  USING (true);

INSERT INTO public.payment_settings (id)
VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- Create this bucket in Storage if it does not already exist.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-assets', 'payment-assets', true)
ON CONFLICT (id) DO NOTHING;

UPDATE storage.buckets
SET public = true
WHERE id = 'payment-assets';

-- Customers can upload payment proof through the application backend.
-- This bucket is public by request, so any person who obtains an object URL
-- can view the image. Supabase public buckets do not support admin-only reads.
DROP POLICY IF EXISTS "Customers can upload payment proof" ON storage.objects;
CREATE POLICY "Customers can upload payment proof"
  ON storage.objects
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'payment-assets'
    AND name LIKE 'proof_of_transaction/%'
    AND lower(COALESCE(metadata->>'mimetype', '')) LIKE 'image/%'
  );

DROP POLICY IF EXISTS "Backend can delete payment proof" ON storage.objects;
DROP POLICY IF EXISTS "Public can view payment proofs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated admins can view payment proofs" ON storage.objects;

INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-qr', 'payment-qr', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public can view payment QR images" ON storage.objects;
CREATE POLICY "Public can view payment QR images"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'payment-qr'
    AND name LIKE 'qr_codes/%'
  );

DROP POLICY IF EXISTS "Authenticated admins can upload payment QR images" ON storage.objects;
CREATE POLICY "Authenticated admins can upload payment QR images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-qr'
    AND name LIKE 'qr_codes/%'
  );

DROP POLICY IF EXISTS "Authenticated admins can update payment QR images" ON storage.objects;
CREATE POLICY "Authenticated admins can update payment QR images"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'payment-qr'
    AND name LIKE 'qr_codes/%'
  )
  WITH CHECK (
    bucket_id = 'payment-qr'
    AND name LIKE 'qr_codes/%'
  );

DROP POLICY IF EXISTS "Authenticated admins can delete payment QR images" ON storage.objects;
CREATE POLICY "Authenticated admins can delete payment QR images"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'payment-qr'
    AND name LIKE 'qr_codes/%'
  );
