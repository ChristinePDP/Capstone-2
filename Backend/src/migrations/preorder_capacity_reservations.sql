-- Atomic pickup-date reservations for pre-orders.
-- Apply this as a new migration; it does not modify existing migration files.

CREATE TABLE IF NOT EXISTS public.preorder_capacity_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  pickup_date date NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'linked', 'released')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_preorder_capacity_active_date_product
  ON public.preorder_capacity_reservations (pickup_date, product_id)
  WHERE state = 'active';

CREATE INDEX IF NOT EXISTS idx_preorder_capacity_reservation
  ON public.preorder_capacity_reservations (reservation_id);

ALTER TABLE public.preorder_capacity_reservations ENABLE ROW LEVEL SECURITY;

-- Reserves all component products in one transaction. The transaction-scoped
-- advisory locks serialize competing requests per product and pickup date.
CREATE OR REPLACE FUNCTION public.reserve_preorder_capacity(
  p_reservation_id uuid,
  p_pickup_date date,
  p_items jsonb,
  p_expires_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  line record;
  current_reserved integer;
  capacity integer;
BEGIN
  IF p_reservation_id IS NULL OR p_pickup_date IS NULL
     OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid pre-order reservation request' USING ERRCODE = '22023';
  END IF;

  -- Expired holds no longer occupy capacity and may be retried with the same ID.
  UPDATE preorder_capacity_reservations
  SET state = 'released', updated_at = now()
  WHERE reservation_id = p_reservation_id
    AND state = 'active'
    AND expires_at IS NOT NULL
    AND expires_at <= now();

  -- Repeated calls with the same live reservation ID are idempotent.
  IF EXISTS (
    SELECT 1 FROM preorder_capacity_reservations
    WHERE reservation_id = p_reservation_id AND state = 'active'
  ) THEN
    RETURN jsonb_build_object('reserved', true, 'reservation_id', p_reservation_id);
  END IF;

  FOR line IN
    SELECT x.product_id, sum(x.quantity)::integer AS quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
    WHERE x.product_id IS NOT NULL AND x.quantity > 0
    GROUP BY x.product_id
    ORDER BY x.product_id
  LOOP
    -- Stable lock key means concurrent reservations for this product/date
    -- cannot both read the same remaining capacity.
    PERFORM pg_advisory_xact_lock(hashtextextended(line.product_id::text || ':' || p_pickup_date::text, 0));

    SELECT daily_limit INTO capacity
    FROM products WHERE id = line.product_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % does not exist', line.product_id USING ERRCODE = '23503';
    END IF;
    -- daily_limit = 0 means unlimited. Only finite limits need a capacity count.
    IF COALESCE(capacity, 0) > 0 THEN
      SELECT COALESCE(SUM(oi.quantity), 0)::integer INTO current_reserved
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE oi.product_id = line.product_id
        AND o.order_type::text = 'Pre-Order'
        AND o.pickup_date = p_pickup_date
        AND o.status::text NOT IN ('Cancelled', 'Canceled');

      current_reserved := current_reserved + COALESCE((
        SELECT SUM(r.quantity)::integer
        FROM preorder_capacity_reservations r
        WHERE r.product_id = line.product_id
          AND r.pickup_date = p_pickup_date
          AND r.state = 'active'
          AND (r.expires_at IS NULL OR r.expires_at > now())
      ), 0);

      IF current_reserved + line.quantity > capacity THEN
        RAISE EXCEPTION 'Pre-order capacity reached for product % on %', line.product_id, p_pickup_date
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO preorder_capacity_reservations
    (reservation_id, product_id, pickup_date, quantity, state, expires_at)
  SELECT p_reservation_id, x.product_id, p_pickup_date, sum(x.quantity)::integer, 'active', p_expires_at
  FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
  WHERE x.product_id IS NOT NULL AND x.quantity > 0
  GROUP BY x.product_id;

  RETURN jsonb_build_object('reserved', true, 'reservation_id', p_reservation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_preorder_capacity(p_reservation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.preorder_capacity_reservations
  SET state = 'released', updated_at = now()
  WHERE reservation_id = p_reservation_id AND state = 'active';
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.link_preorder_capacity_to_order(
  p_reservation_id uuid,
  p_order_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE preorder_capacity_reservations
  SET state = 'linked', order_id = p_order_id, expires_at = NULL, updated_at = now()
  WHERE reservation_id = p_reservation_id AND state = 'active';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_preorder_capacity(uuid, date, jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_preorder_capacity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_preorder_capacity_to_order(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_preorder_capacity(uuid, date, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_preorder_capacity(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_preorder_capacity_to_order(uuid, uuid) TO service_role;
