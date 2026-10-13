-- One reservation ledger for Buy Now stock and per-date Pre-Order capacity.
-- Apply after preorder_capacity_reservations.sql. All reservation transitions
-- are serialized in PostgreSQL; API requests must not edit this table directly.
CREATE TABLE IF NOT EXISTS public.checkout_reservations (
  reservation_id uuid PRIMARY KEY,
  order_type public.order_type NOT NULL,
  pickup_date date NOT NULL,
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('active', 'proof_submitted', 'committed', 'released', 'expired')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checkout_reservation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.checkout_reservations(reservation_id) ON DELETE CASCADE,
  -- Keep source IDs as historical references without blocking later product
  -- or material cleanup after the reservation has finished.
  product_id uuid NOT NULL,
  material_id uuid,
  quantity integer NOT NULL CHECK (quantity > 0),
  UNIQUE (reservation_id, product_id, material_id)
);

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS checkout_reservation_id uuid;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_checkout_reservation_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_checkout_reservation_id_fkey
  FOREIGN KEY (checkout_reservation_id) REFERENCES public.checkout_reservations(reservation_id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_checkout_reservation
  ON public.orders (checkout_reservation_id) WHERE checkout_reservation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checkout_reservations_active_expiry
  ON public.checkout_reservations (expires_at) WHERE state = 'active';
CREATE INDEX IF NOT EXISTS idx_checkout_reservation_items_product
  ON public.checkout_reservation_items (product_id, reservation_id);
CREATE INDEX IF NOT EXISTS idx_checkout_reservation_items_material
  ON public.checkout_reservation_items (material_id, reservation_id) WHERE material_id IS NOT NULL;

-- A pending payment/order still depends on its reserved item. Finished and
-- expired reservations do not prevent normal catalog cleanup or deletion.
CREATE OR REPLACE FUNCTION public.prevent_delete_of_reserved_checkout_item()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'products' AND EXISTS (
    SELECT 1 FROM checkout_reservation_items i
    JOIN checkout_reservations r USING (reservation_id)
    WHERE i.product_id = OLD.id AND r.state IN ('active', 'proof_submitted')
  ) THEN
    RAISE EXCEPTION '"%" is reserved by a pending checkout and cannot be deleted yet.', OLD.name;
  END IF;

  IF TG_TABLE_NAME = 'celebration_materials' AND EXISTS (
    SELECT 1 FROM checkout_reservation_items i
    JOIN checkout_reservations r USING (reservation_id)
    WHERE i.material_id = OLD.id AND r.state IN ('active', 'proof_submitted')
  ) THEN
    RAISE EXCEPTION '"%" is reserved by a pending checkout and cannot be deleted yet.', OLD.name;
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS trg_prevent_delete_reserved_product ON public.products;
CREATE TRIGGER trg_prevent_delete_reserved_product
  BEFORE DELETE ON public.products FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_of_reserved_checkout_item();
DROP TRIGGER IF EXISTS trg_prevent_delete_reserved_material ON public.celebration_materials;
CREATE TRIGGER trg_prevent_delete_reserved_material
  BEFORE DELETE ON public.celebration_materials FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_of_reserved_checkout_item();

ALTER TABLE public.checkout_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_reservation_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.reserve_checkout_inventory(
  p_reservation_id uuid,
  p_order_type public.order_type,
  p_pickup_date date,
  p_items jsonb,
  p_expires_at timestamptz
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE line record; v_basis numeric; v_taken numeric; v_item_name text;
BEGIN
  IF p_reservation_id IS NULL OR p_order_type IS NULL OR p_pickup_date IS NULL
     OR p_expires_at IS NULL OR p_expires_at <= now()
     OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid checkout reservation request' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) = 0 OR NOT EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS x(product_id uuid, quantity integer)
    WHERE x.product_id IS NOT NULL AND x.quantity > 0
  ) THEN
    RAISE EXCEPTION 'Checkout reservation must include at least one valid item.' USING ERRCODE = '22023';
  END IF;

  UPDATE checkout_reservations SET state = 'expired', updated_at = now()
  WHERE state = 'active' AND expires_at <= now();

  IF EXISTS (SELECT 1 FROM checkout_reservations WHERE reservation_id = p_reservation_id) THEN
    IF EXISTS (SELECT 1 FROM checkout_reservations WHERE reservation_id = p_reservation_id
      AND state IN ('active','proof_submitted') AND order_id IS NULL
      AND (state='proof_submitted' OR expires_at > now())
      AND order_type = p_order_type AND pickup_date = p_pickup_date) THEN
      IF EXISTS (
        SELECT 1 FROM (
          (SELECT x.product_id, x.material_id, sum(x.quantity)::integer AS quantity
            FROM jsonb_to_recordset(p_items) AS x(product_id uuid, material_id uuid, quantity integer)
            WHERE x.product_id IS NOT NULL AND x.quantity > 0 GROUP BY x.product_id, x.material_id
            EXCEPT SELECT i.product_id, i.material_id, i.quantity FROM checkout_reservation_items i WHERE i.reservation_id=p_reservation_id)
          UNION ALL
          (SELECT i.product_id, i.material_id, i.quantity FROM checkout_reservation_items i WHERE i.reservation_id=p_reservation_id
            EXCEPT SELECT x.product_id, x.material_id, sum(x.quantity)::integer AS quantity
              FROM jsonb_to_recordset(p_items) AS x(product_id uuid, material_id uuid, quantity integer)
              WHERE x.product_id IS NOT NULL AND x.quantity > 0 GROUP BY x.product_id, x.material_id)
        ) AS cart_difference
      ) THEN
        RAISE EXCEPTION 'This reservation ID is already in use for a different cart.' USING ERRCODE = 'P0001';
      END IF;
      RETURN jsonb_build_object('reserved', true, 'reservation_id', p_reservation_id,
        'expires_at', (SELECT expires_at FROM checkout_reservations WHERE reservation_id = p_reservation_id));
    END IF;
    RAISE EXCEPTION 'This checkout reservation is no longer active. Please check availability again.' USING ERRCODE = 'P0001';
  END IF;

  -- Lock every affected inventory row in stable order. Reservations for a
  -- package/component therefore cannot interleave and oversell shared stock.
  FOR line IN
    SELECT x.product_id, x.material_id, sum(x.quantity)::integer AS quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id uuid, material_id uuid, quantity integer)
    WHERE x.product_id IS NOT NULL AND x.quantity > 0
    GROUP BY x.product_id, x.material_id ORDER BY x.product_id, x.material_id NULLS FIRST
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(
      coalesce(line.material_id::text, line.product_id::text) || ':' ||
      CASE WHEN p_order_type = 'Pre-Order' THEN p_pickup_date::text ELSE 'stock' END, 0));

    IF p_order_type = 'Pre-Order' THEN
      SELECT name, daily_limit INTO v_item_name, v_basis FROM products WHERE id = line.product_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'A product in this order is no longer available.' USING ERRCODE = 'P0001'; END IF;
      IF COALESCE(v_basis, 0) > 0 THEN
        SELECT COALESCE(sum(oi.quantity), 0) INTO v_taken
        FROM order_items oi JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = line.product_id AND o.order_type = 'Pre-Order'
          AND o.pickup_date = p_pickup_date AND o.status <> 'Cancelled';
        v_taken := v_taken + COALESCE((SELECT sum(i.quantity) FROM checkout_reservation_items i
          JOIN checkout_reservations r USING (reservation_id)
          WHERE i.product_id = line.product_id AND r.pickup_date = p_pickup_date
            AND r.order_type = 'Pre-Order' AND r.state IN ('active','proof_submitted')
            AND r.order_id IS NULL AND (r.state = 'proof_submitted' OR r.expires_at > now())), 0);
        v_taken := v_taken + COALESCE((SELECT sum(old.quantity) FROM preorder_capacity_reservations old
          WHERE old.product_id=line.product_id AND old.pickup_date=p_pickup_date AND old.state='active'
            AND (old.expires_at IS NULL OR old.expires_at>now())), 0);
        IF v_taken + line.quantity > v_basis THEN
          RAISE EXCEPTION '"%" has no remaining availability for the selected pickup date. Please remove this item and try again.', v_item_name USING ERRCODE = 'P0001';
        END IF;
      END IF;
    ELSIF line.material_id IS NOT NULL THEN
      SELECT name, stock_quantity INTO v_item_name, v_basis FROM celebration_materials WHERE id = line.material_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'A material in this order is no longer available.' USING ERRCODE = 'P0001'; END IF;
      SELECT COALESCE(sum(i.quantity), 0) INTO v_taken FROM checkout_reservation_items i
        JOIN checkout_reservations r USING (reservation_id)
        WHERE i.material_id = line.material_id AND r.order_type = 'Buy Now'
          AND r.state IN ('active','proof_submitted')
          AND (r.state = 'proof_submitted' OR r.expires_at > now());
      IF v_taken + line.quantity > v_basis THEN
        RAISE EXCEPTION '"%" is out of stock. Please remove this item and try again.', v_item_name USING ERRCODE = 'P0001';
      END IF;
    ELSE
      SELECT name, stock_quantity INTO v_item_name, v_basis FROM products WHERE id = line.product_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'A product in this order is no longer available.' USING ERRCODE = 'P0001'; END IF;
      SELECT COALESCE(sum(i.quantity), 0) INTO v_taken FROM checkout_reservation_items i
        JOIN checkout_reservations r USING (reservation_id)
        WHERE i.product_id = line.product_id AND i.material_id IS NULL AND r.order_type = 'Buy Now'
          AND r.state IN ('active','proof_submitted')
          AND (r.state = 'proof_submitted' OR r.expires_at > now());
      IF v_taken + line.quantity > v_basis THEN
        RAISE EXCEPTION '"%" is out of stock. Please remove this item and try again.', v_item_name USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END LOOP;

  INSERT INTO checkout_reservations (reservation_id, order_type, pickup_date, expires_at)
  VALUES (p_reservation_id, p_order_type, p_pickup_date, p_expires_at);
  INSERT INTO checkout_reservation_items (reservation_id, product_id, material_id, quantity)
  SELECT p_reservation_id, x.product_id, x.material_id, sum(x.quantity)::integer
  FROM jsonb_to_recordset(p_items) AS x(product_id uuid, material_id uuid, quantity integer)
  WHERE x.product_id IS NOT NULL AND x.quantity > 0
  GROUP BY x.product_id, x.material_id;
  RETURN jsonb_build_object('reserved', true, 'reservation_id', p_reservation_id, 'expires_at', p_expires_at);
END; $$;

CREATE OR REPLACE FUNCTION public.link_checkout_reservation(p_reservation_id uuid, p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r checkout_reservations;
BEGIN
  SELECT * INTO r FROM checkout_reservations
  WHERE reservation_id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout reservation not found. Please check availability again.' USING ERRCODE='P0001';
  END IF;
  IF r.order_id = p_order_id AND r.state='proof_submitted' THEN RETURN true; END IF;
  IF r.state <> 'active' OR r.expires_at <= now() THEN
    RAISE EXCEPTION 'Your stock reservation has expired. Please check availability and start payment again.' USING ERRCODE='P0001';
  END IF;
  UPDATE checkout_reservations SET order_id=p_order_id, state='proof_submitted',
    expires_at=now(), updated_at=now()
  WHERE reservation_id=p_reservation_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.release_checkout_reservation(p_reservation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE checkout_reservations SET state='released', updated_at=now()
  WHERE reservation_id=p_reservation_id AND state IN ('active','proof_submitted');
  RETURN FOUND;
END; $$;

CREATE OR REPLACE FUNCTION public.commit_checkout_reservation(p_reservation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r checkout_reservations; line record; batch record;
  v_remaining numeric; v_batch_unit text; v_available numeric; v_take numeric; v_take_batch numeric;
BEGIN
  SELECT * INTO r FROM checkout_reservations WHERE reservation_id=p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Checkout reservation not found.' USING ERRCODE='P0001'; END IF;
  IF r.state='committed' THEN RETURN true; END IF;
  IF r.state NOT IN ('proof_submitted','active') THEN RAISE EXCEPTION 'Checkout reservation is no longer valid.' USING ERRCODE='P0001'; END IF;
  IF r.order_type='Buy Now' THEN
    FOR line IN SELECT product_id, material_id, sum(quantity)::integer AS quantity
      FROM checkout_reservation_items WHERE reservation_id=p_reservation_id
      GROUP BY product_id, material_id ORDER BY product_id, material_id NULLS FIRST
    LOOP
      IF line.material_id IS NOT NULL THEN
        UPDATE celebration_materials SET stock_quantity=stock_quantity-line.quantity
        WHERE id=line.material_id AND stock_quantity>=line.quantity;
        IF NOT FOUND THEN RAISE EXCEPTION 'Reserved material stock changed before payment confirmation.' USING ERRCODE='P0001'; END IF;
        SELECT unit INTO v_batch_unit FROM celebration_materials WHERE id=line.material_id;
        v_remaining := line.quantity;
        FOR batch IN SELECT id, remaining_quantity, remaining_unit FROM inventory_logs
          WHERE material_id=line.material_id AND transaction_type='IN' AND voided_at IS NULL
            AND remaining_quantity>0 ORDER BY expiration_date ASC NULLS LAST, created_at ASC FOR UPDATE
        LOOP
          EXIT WHEN v_remaining<=0;
          v_available := convert_inventory_quantity(batch.remaining_quantity, COALESCE(batch.remaining_unit, v_batch_unit), v_batch_unit);
          IF v_available IS NULL THEN RAISE EXCEPTION 'Inventory batch unit is incompatible for material %.', line.material_id USING ERRCODE='P0001'; END IF;
          v_take := LEAST(v_available, v_remaining);
          v_take_batch := convert_inventory_quantity(v_take, v_batch_unit, COALESCE(batch.remaining_unit, v_batch_unit));
          UPDATE inventory_logs SET remaining_quantity=GREATEST(0, remaining_quantity-v_take_batch)
          WHERE id=batch.id;
          v_remaining := v_remaining-v_take;
        END LOOP;
      ELSE
        UPDATE products SET stock_quantity=stock_quantity-line.quantity
        WHERE id=line.product_id AND stock_quantity>=line.quantity;
        IF NOT FOUND THEN RAISE EXCEPTION 'Reserved stock changed before payment confirmation.' USING ERRCODE='P0001'; END IF;
      END IF;
    END LOOP;
  END IF;
  UPDATE checkout_reservations SET state='committed', expires_at=now(), updated_at=now()
  WHERE reservation_id=p_reservation_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.expire_checkout_reservations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n integer;
BEGIN
  UPDATE checkout_reservations SET state='expired', updated_at=now()
  WHERE state='active' AND expires_at<=now();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

-- Payment review and the reservation transition happen in one transaction.
-- Lock the order first so simultaneous accept/reject requests cannot disagree.
CREATE OR REPLACE FUNCTION public.verify_checkout_payment(
  p_order_id uuid,
  p_accepted boolean,
  p_admin_id uuid
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE o orders;
BEGIN
  SELECT * INTO o FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR o.status <> 'Pending Verification' THEN RETURN false; END IF;

  IF o.checkout_reservation_id IS NOT NULL THEN
    IF p_accepted THEN
      PERFORM commit_checkout_reservation(o.checkout_reservation_id);
    ELSE
      UPDATE checkout_reservations
      SET state = 'released', updated_at = now()
      WHERE reservation_id = o.checkout_reservation_id
        AND state IN ('active', 'proof_submitted');
    END IF;
  END IF;

  UPDATE orders
  SET payment_verification_status = CASE WHEN p_accepted THEN 'Accepted' ELSE 'Rejected' END,
      status = CASE WHEN p_accepted THEN 'Confirmed'::order_status ELSE 'Cancelled'::order_status END,
      payment_verified_at = now(),
      payment_verified_by = p_admin_id
  WHERE id = p_order_id;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.reserve_checkout_inventory(uuid, public.order_type, date, jsonb, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_checkout_reservation(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_checkout_reservation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.commit_checkout_reservation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_checkout_reservations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_checkout_payment(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_checkout_inventory(uuid, public.order_type, date, jsonb, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_checkout_reservation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_checkout_reservation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_checkout_reservation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_checkout_reservations() TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_checkout_payment(uuid, boolean, uuid) TO service_role;
