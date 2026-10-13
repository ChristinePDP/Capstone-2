--
-- PostgreSQL database dump
--

\restrict WWKfnfVEnkDjPKi9x9Cn2goPh44CCvreGgaUPJ4gNDOsfbschExiKftkygq0NbF

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: inv_item_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.inv_item_type AS ENUM (
    'raw',
    'material',
    'other'
);


ALTER TYPE public.inv_item_type OWNER TO postgres;

--
-- Name: order_source; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.order_source AS ENUM (
    'online',
    'walk-in'
);


ALTER TYPE public.order_source OWNER TO postgres;

--
-- Name: order_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.order_status AS ENUM (
    'Pending Verification',
    'Confirmed',
    'Ready',
    'Completed',
    'Cancelled'
);


ALTER TYPE public.order_status OWNER TO postgres;

--
-- Name: order_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.order_type AS ENUM (
    'Pre-Order',
    'Buy Now'
);


ALTER TYPE public.order_type OWNER TO postgres;

--
-- Name: payment_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.payment_type AS ENUM (
    'full',
    'deposit'
);


ALTER TYPE public.payment_type OWNER TO postgres;

--
-- Name: waste_type; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE public.waste_type AS ENUM (
    'ingredient',
    'material',
    'product'
);


ALTER TYPE public.waste_type OWNER TO postgres;

--
-- Name: convert_inventory_quantity(numeric, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.convert_inventory_quantity(p_quantity numeric, p_from text, p_to text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $$
DECLARE
  v_from text := lower(trim(p_from));
  v_to text := lower(trim(p_to));
  v_from_group text;
  v_to_group text;
  v_from_factor numeric;
  v_to_factor numeric;
BEGIN
  IF p_quantity IS NULL OR p_from IS NULL OR p_to IS NULL THEN RETURN NULL; END IF;
  IF v_from = v_to THEN RETURN p_quantity; END IF;

  IF v_from IN ('g', 'gram', 'grams') THEN v_from_group := 'mass'; v_from_factor := 0.001;
  ELSIF v_from IN ('kg', 'kilo', 'kilogram', 'kilograms') THEN v_from_group := 'mass'; v_from_factor := 1;
  ELSIF v_from IN ('ml', 'milliliter', 'milliliters') THEN v_from_group := 'volume'; v_from_factor := 0.001;
  ELSIF v_from IN ('l', 'liter', 'liters', 'litre', 'litres') THEN v_from_group := 'volume'; v_from_factor := 1;
  ELSIF v_from IN ('pcs', 'pc', 'piece', 'pieces') THEN v_from_group := 'count'; v_from_factor := 1;
  ELSIF v_from IN ('dozen', 'doz', 'dz') THEN v_from_group := 'count'; v_from_factor := 12;
  ELSIF v_from IN ('m', 'meter', 'meters', 'metre', 'metres') THEN v_from_group := 'length'; v_from_factor := 1;
  ELSIF v_from IN ('yard', 'yards', 'yd', 'yds') THEN v_from_group := 'length'; v_from_factor := 0.9144;
  ELSE RETURN NULL;
  END IF;

  IF v_to IN ('g', 'gram', 'grams') THEN v_to_group := 'mass'; v_to_factor := 0.001;
  ELSIF v_to IN ('kg', 'kilo', 'kilogram', 'kilograms') THEN v_to_group := 'mass'; v_to_factor := 1;
  ELSIF v_to IN ('ml', 'milliliter', 'milliliters') THEN v_to_group := 'volume'; v_to_factor := 0.001;
  ELSIF v_to IN ('l', 'liter', 'liters', 'litre', 'litres') THEN v_to_group := 'volume'; v_to_factor := 1;
  ELSIF v_to IN ('pcs', 'pc', 'piece', 'pieces') THEN v_to_group := 'count'; v_to_factor := 1;
  ELSIF v_to IN ('dozen', 'doz', 'dz') THEN v_to_group := 'count'; v_to_factor := 12;
  ELSIF v_to IN ('m', 'meter', 'meters', 'metre', 'metres') THEN v_to_group := 'length'; v_to_factor := 1;
  ELSIF v_to IN ('yard', 'yards', 'yd', 'yds') THEN v_to_group := 'length'; v_to_factor := 0.9144;
  ELSE RETURN NULL;
  END IF;

  IF v_from_group <> v_to_group THEN RETURN NULL; END IF;
  RETURN p_quantity * v_from_factor / v_to_factor;
END;
$$;


ALTER FUNCTION public.convert_inventory_quantity(p_quantity numeric, p_from text, p_to text) OWNER TO postgres;

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $$
begin
  insert into public.admins (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Staff/Admin'), new.email);
  return new;
end;
$$;


ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

--
-- Name: link_preorder_capacity_to_order(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.link_preorder_capacity_to_order(p_reservation_id uuid, p_order_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE preorder_capacity_reservations
  SET state = 'linked', order_id = p_order_id, expires_at = NULL, updated_at = now()
  WHERE reservation_id = p_reservation_id AND state = 'active';
  RETURN FOUND;
END;
$$;


ALTER FUNCTION public.link_preorder_capacity_to_order(p_reservation_id uuid, p_order_id uuid) OWNER TO postgres;

--
-- Name: release_preorder_capacity(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.release_preorder_capacity(p_reservation_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.preorder_capacity_reservations
  SET state = 'released', updated_at = now()
  WHERE reservation_id = p_reservation_id AND state = 'active';
  RETURN FOUND;
END;
$$;


ALTER FUNCTION public.release_preorder_capacity(p_reservation_id uuid) OWNER TO postgres;

--
-- Name: reserve_preorder_capacity(uuid, date, jsonb, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.reserve_preorder_capacity(p_reservation_id uuid, p_pickup_date date, p_items jsonb, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


ALTER FUNCTION public.reserve_preorder_capacity(p_reservation_id uuid, p_pickup_date date, p_items jsonb, p_expires_at timestamp with time zone) OWNER TO postgres;

--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.rls_auto_enable() OWNER TO postgres;

--
-- Name: set_order_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_order_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.order_number = '' then
    new.order_number := 'ORD-' || lpad(nextval('order_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;


ALTER FUNCTION public.set_order_number() OWNER TO postgres;

--
-- Name: touch_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.touch_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin new.updated_at = now(); return new; end;
$$;


ALTER FUNCTION public.touch_updated_at() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: celebration_materials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.celebration_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    stock_quantity numeric(12,4) DEFAULT 0 NOT NULL,
    minimum_stock numeric(12,4) DEFAULT 0 NOT NULL,
    cost_per_unit numeric(10,4) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    product_id uuid,
    material_type text NOT NULL,
    CONSTRAINT celebration_materials_cost_per_unit_check CHECK ((cost_per_unit >= (0)::numeric)),
    CONSTRAINT celebration_materials_material_type_check CHECK ((material_type = ANY (ARRAY['celebration'::text, 'product'::text]))),
    CONSTRAINT celebration_materials_minimum_stock_check CHECK ((minimum_stock >= (0)::numeric)),
    CONSTRAINT celebration_materials_stock_quantity_check CHECK ((stock_quantity >= (0)::numeric))
);


ALTER TABLE public.celebration_materials OWNER TO postgres;

--
-- Name: update_material_details(uuid, text, text, numeric, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_material_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric, p_product_id uuid) RETURNS public.celebration_materials
    LANGUAGE plpgsql
    AS $$
DECLARE v_item public.celebration_materials; v_factor numeric; v_new_stock numeric;
BEGIN
  SELECT * INTO v_item FROM public.celebration_materials WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found'; END IF;
  v_factor := public.convert_inventory_quantity(1, v_item.unit, p_unit);
  IF v_factor IS NULL OR v_factor <= 0 THEN RAISE EXCEPTION 'Incompatible inventory units: % to %', v_item.unit, p_unit; END IF;
  v_new_stock := public.convert_inventory_quantity(v_item.stock_quantity, v_item.unit, p_unit);

  UPDATE public.inventory_logs
  SET remaining_quantity = public.convert_inventory_quantity(remaining_quantity, COALESCE(remaining_unit, v_item.unit), p_unit),
      remaining_unit = p_unit
  WHERE material_id = p_id AND transaction_type = 'IN'
    AND remaining_quantity > 0 AND voided_at IS NULL;

  UPDATE public.celebration_materials
  SET name = p_name, unit = p_unit, stock_quantity = v_new_stock,
      minimum_stock = p_minimum_stock, cost_per_unit = cost_per_unit / v_factor,
      product_id = p_product_id, updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_item;
  RETURN v_item;
END;
$$;


ALTER FUNCTION public.update_material_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric, p_product_id uuid) OWNER TO postgres;

--
-- Name: raw_ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.raw_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    unit text NOT NULL,
    stock_quantity numeric(12,4) DEFAULT 0 NOT NULL,
    minimum_stock numeric(12,4) DEFAULT 0 NOT NULL,
    cost_per_unit numeric(10,4) DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT raw_ingredients_cost_per_unit_check CHECK ((cost_per_unit >= (0)::numeric)),
    CONSTRAINT raw_ingredients_minimum_stock_check CHECK ((minimum_stock >= (0)::numeric)),
    CONSTRAINT raw_ingredients_stock_quantity_check CHECK ((stock_quantity >= (0)::numeric))
);


ALTER TABLE public.raw_ingredients OWNER TO postgres;

--
-- Name: update_raw_ingredient_details(uuid, text, text, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_raw_ingredient_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric) RETURNS public.raw_ingredients
    LANGUAGE plpgsql
    AS $$
DECLARE v_item public.raw_ingredients; v_factor numeric; v_new_stock numeric;
BEGIN
  SELECT * INTO v_item FROM public.raw_ingredients WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingredient not found'; END IF;
  v_factor := public.convert_inventory_quantity(1, v_item.unit, p_unit);
  IF v_factor IS NULL OR v_factor <= 0 THEN RAISE EXCEPTION 'Incompatible inventory units: % to %', v_item.unit, p_unit; END IF;
  v_new_stock := public.convert_inventory_quantity(v_item.stock_quantity, v_item.unit, p_unit);

  UPDATE public.inventory_logs
  SET remaining_quantity = public.convert_inventory_quantity(remaining_quantity, COALESCE(remaining_unit, v_item.unit), p_unit),
      remaining_unit = p_unit
  WHERE raw_ingredient_id = p_id AND transaction_type = 'IN'
    AND remaining_quantity > 0 AND voided_at IS NULL;

  UPDATE public.raw_ingredients
  SET name = p_name, unit = p_unit, stock_quantity = v_new_stock,
      minimum_stock = p_minimum_stock, cost_per_unit = cost_per_unit / v_factor,
      updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_item;
  RETURN v_item;
END;
$$;


ALTER FUNCTION public.update_raw_ingredient_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric) OWNER TO postgres;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admins (
    id uuid NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.admins OWNER TO postgres;

--
-- Name: ai_cache; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cache_key text NOT NULL,
    payload jsonb NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


ALTER TABLE public.ai_cache OWNER TO postgres;

--
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    alt_phone text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- Name: inventory_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_type public.inv_item_type NOT NULL,
    item_name text NOT NULL,
    transaction_type text NOT NULL,
    quantity numeric(12,4) NOT NULL,
    cost numeric(10,2) DEFAULT 0 NOT NULL,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    voided_at timestamp with time zone,
    expiration_date date,
    remaining_quantity numeric(12,4) DEFAULT 0 NOT NULL,
    raw_ingredient_id uuid,
    material_id uuid,
    unit text,
    remaining_unit text
);


ALTER TABLE public.inventory_logs OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text,
    reference_id text,
    reference_type text,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: occasions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.occasions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_name text NOT NULL,
    event_tag text NOT NULL,
    start_month smallint NOT NULL,
    start_day smallint NOT NULL,
    end_month smallint NOT NULL,
    end_day smallint NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT occasions_end_day_check CHECK (((end_day >= 1) AND (end_day <= 31))),
    CONSTRAINT occasions_end_month_check CHECK (((end_month >= 1) AND (end_month <= 12))),
    CONSTRAINT occasions_start_day_check CHECK (((start_day >= 1) AND (start_day <= 31))),
    CONSTRAINT occasions_start_month_check CHECK (((start_month >= 1) AND (start_month <= 12)))
);


ALTER TABLE public.occasions OWNER TO postgres;

--
-- Name: order_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    product_id uuid,
    product_name text NOT NULL,
    variant_label text,
    quantity integer NOT NULL,
    unit_price numeric(10,2) NOT NULL,
    total_price numeric(10,2) NOT NULL,
    order_slip_details jsonb DEFAULT '{}'::jsonb,
    customer_reference_url text,
    special_instructions text DEFAULT ''::text NOT NULL,
    selected_price_options jsonb,
    bundle_id uuid,
    bundle_group_id uuid,
    bundle_name text,
    original_unit_price numeric(10,2),
    package_id uuid,
    CONSTRAINT order_items_original_price_check CHECK (((original_unit_price IS NULL) OR (original_unit_price >= (0)::numeric))),
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT order_items_total_price_check CHECK ((total_price >= (0)::numeric)),
    CONSTRAINT order_items_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


ALTER TABLE public.order_items OWNER TO postgres;

--
-- Name: order_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_seq OWNER TO postgres;

--
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text DEFAULT ''::text NOT NULL,
    customer_id uuid,
    placed_by_admin uuid,
    order_type public.order_type NOT NULL,
    source public.order_source NOT NULL,
    status public.order_status DEFAULT 'Confirmed'::public.order_status NOT NULL,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    additional_charge numeric(10,2) DEFAULT 0 NOT NULL,
    discount jsonb DEFAULT '{}'::jsonb NOT NULL,
    grand_total numeric(10,2) DEFAULT 0 NOT NULL,
    payment_type public.payment_type DEFAULT 'full'::public.payment_type NOT NULL,
    amount_paid numeric(10,2) DEFAULT 0 NOT NULL,
    balance numeric(10,2) DEFAULT 0 NOT NULL,
    pickup_date date,
    pickup_time time without time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pickup_time_end time without time zone,
    proof_of_payment_url text,
    proof_of_payment_path text,
    proof_uploaded_at timestamp with time zone,
    payment_verification_status text DEFAULT 'Accepted'::text NOT NULL,
    payment_verified_at timestamp with time zone,
    payment_verified_by uuid,
    CONSTRAINT orders_payment_verification_status_check CHECK ((payment_verification_status = ANY (ARRAY['Pending'::text, 'Accepted'::text, 'Rejected'::text])))
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- Name: payment_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.payment_settings (
    id boolean DEFAULT true NOT NULL,
    payment_qr_code_url text,
    payment_qr_code_path text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    CONSTRAINT payment_settings_id_check CHECK (id)
);


ALTER TABLE public.payment_settings OWNER TO postgres;

--
-- Name: preorder_capacity_reservations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.preorder_capacity_reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reservation_id uuid NOT NULL,
    product_id uuid NOT NULL,
    pickup_date date NOT NULL,
    quantity integer NOT NULL,
    state text DEFAULT 'active'::text NOT NULL,
    order_id uuid,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT preorder_capacity_reservations_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT preorder_capacity_reservations_state_check CHECK ((state = ANY (ARRAY['active'::text, 'linked'::text, 'released'::text])))
);


ALTER TABLE public.preorder_capacity_reservations OWNER TO postgres;

--
-- Name: product_date_exceptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.product_date_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    exception_date date NOT NULL,
    reason text
);


ALTER TABLE public.product_date_exceptions OWNER TO postgres;

--
-- Name: production_deductions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.production_deductions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    production_log_id uuid NOT NULL,
    item_type public.inv_item_type NOT NULL,
    item_name text NOT NULL,
    quantity numeric(12,4) NOT NULL,
    unit text NOT NULL,
    raw_ingredient_id uuid,
    material_id uuid,
    CONSTRAINT production_deductions_quantity_check CHECK ((quantity > (0)::numeric))
);


ALTER TABLE public.production_deductions OWNER TO postgres;

--
-- Name: production_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.production_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_id uuid,
    product_id uuid,
    product_name text NOT NULL,
    batches integer NOT NULL,
    total_produced integer NOT NULL,
    yield_unit text DEFAULT 'pcs'::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    produced_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT production_logs_batches_check CHECK ((batches > 0)),
    CONSTRAINT production_logs_total_produced_check CHECK ((total_produced > 0))
);


ALTER TABLE public.production_logs OWNER TO postgres;

--
-- Name: products; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    price numeric(10,2) NOT NULL,
    inclusion text DEFAULT ''::text NOT NULL,
    image_url text,
    daily_limit integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    allow_file_upload boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    stock_quantity integer DEFAULT 0 NOT NULL,
    order_slip_fields jsonb DEFAULT '[]'::jsonb,
    order_type text DEFAULT 'Both'::text,
    pricing_mode text DEFAULT 'fixed'::text,
    price_groups jsonb DEFAULT '[]'::jsonb,
    price_matrix jsonb DEFAULT '[]'::jsonb,
    event_tags text[] DEFAULT '{}'::text[] NOT NULL,
    package_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    sourcing_type text,
    partner_cost numeric(10,2),
    CONSTRAINT products_category_check CHECK ((category = ANY (ARRAY['Cake'::text, 'Package'::text, 'Pastry'::text, 'Celebration Material'::text]))),
    CONSTRAINT products_order_type_check CHECK ((order_type = ANY (ARRAY['Pick-up Today'::text, 'Pre-order'::text, 'Both'::text]))),
    CONSTRAINT products_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT products_sourcing_type_check CHECK ((sourcing_type = ANY (ARRAY['partner'::text, 'own'::text])))
);


ALTER TABLE public.products OWNER TO postgres;

--
-- Name: promo_bundles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promo_bundles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bundle_name text NOT NULL,
    product_ids jsonb DEFAULT '[]'::jsonb NOT NULL,
    custom_image_url text,
    event_tag text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    discounted_price numeric DEFAULT 0 NOT NULL,
    start_month integer,
    start_day integer,
    end_month integer,
    end_day integer,
    bundle_options jsonb DEFAULT '{}'::jsonb,
    category text DEFAULT 'Bundle'::text,
    package_items jsonb DEFAULT '[]'::jsonb,
    order_type text DEFAULT 'Both'::text,
    inclusion text DEFAULT ''::text NOT NULL,
    CONSTRAINT promo_bundles_category_check CHECK ((category = ANY (ARRAY['Bundle'::text, 'Package'::text]))),
    CONSTRAINT promo_bundles_order_type_check CHECK ((order_type = ANY (ARRAY['Pick-up Today'::text, 'Pre-order'::text, 'Both'::text])))
);


ALTER TABLE public.promo_bundles OWNER TO postgres;

--
-- Name: recipe_ingredients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recipe_ingredients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_id uuid NOT NULL,
    item_type public.inv_item_type NOT NULL,
    item_name text NOT NULL,
    quantity numeric(12,4) NOT NULL,
    unit text NOT NULL,
    raw_ingredient_id uuid,
    material_id uuid,
    CONSTRAINT recipe_ingredients_quantity_check CHECK ((quantity > (0)::numeric))
);


ALTER TABLE public.recipe_ingredients OWNER TO postgres;

--
-- Name: recipes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    product_id uuid NOT NULL,
    yield_quantity integer DEFAULT 1 NOT NULL,
    yield_unit text DEFAULT 'pcs'::text NOT NULL,
    estimated_cost numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recipes_yield_quantity_check CHECK ((yield_quantity > 0))
);


ALTER TABLE public.recipes OWNER TO postgres;

--
-- Name: recipes_flavor_backup; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.recipes_flavor_backup (
    id uuid,
    product_id uuid,
    flavor text
);


ALTER TABLE public.recipes_flavor_backup OWNER TO postgres;

--
-- Name: waste_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.waste_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    waste_type public.waste_type NOT NULL,
    item_name text NOT NULL,
    quantity numeric(12,4) NOT NULL,
    unit text NOT NULL,
    reason text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    cost numeric(10,2) DEFAULT 0 NOT NULL,
    logged_at timestamp with time zone DEFAULT now() NOT NULL,
    voided_at timestamp with time zone,
    raw_ingredient_id uuid,
    material_id uuid,
    CONSTRAINT waste_logs_quantity_check CHECK ((quantity > (0)::numeric))
);


ALTER TABLE public.waste_logs OWNER TO postgres;

--
-- Name: admins admins_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_email_key UNIQUE (email);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (id);


--
-- Name: ai_cache ai_cache_cache_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_cache
    ADD CONSTRAINT ai_cache_cache_key_key UNIQUE (cache_key);


--
-- Name: ai_cache ai_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_cache
    ADD CONSTRAINT ai_cache_pkey PRIMARY KEY (id);


--
-- Name: celebration_materials celebration_materials_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.celebration_materials
    ADD CONSTRAINT celebration_materials_name_key UNIQUE (name);


--
-- Name: celebration_materials celebration_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.celebration_materials
    ADD CONSTRAINT celebration_materials_pkey PRIMARY KEY (id);


--
-- Name: celebration_materials celebration_materials_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.celebration_materials
    ADD CONSTRAINT celebration_materials_product_id_key UNIQUE (product_id);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: inventory_logs inventory_logs_item_id_type_check; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.inventory_logs
    ADD CONSTRAINT inventory_logs_item_id_type_check CHECK ((((raw_ingredient_id IS NULL) OR ((item_type = 'raw'::public.inv_item_type) AND (material_id IS NULL))) AND ((material_id IS NULL) OR ((item_type = 'material'::public.inv_item_type) AND (raw_ingredient_id IS NULL))))) NOT VALID;


--
-- Name: inventory_logs inventory_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: occasions occasions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.occasions
    ADD CONSTRAINT occasions_pkey PRIMARY KEY (id);


--
-- Name: order_items order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);


--
-- Name: orders orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: payment_settings payment_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.payment_settings
    ADD CONSTRAINT payment_settings_pkey PRIMARY KEY (id);


--
-- Name: preorder_capacity_reservations preorder_capacity_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.preorder_capacity_reservations
    ADD CONSTRAINT preorder_capacity_reservations_pkey PRIMARY KEY (id);


--
-- Name: preorder_capacity_reservations preorder_capacity_reservations_reservation_id_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.preorder_capacity_reservations
    ADD CONSTRAINT preorder_capacity_reservations_reservation_id_product_id_key UNIQUE (reservation_id, product_id);


--
-- Name: product_date_exceptions product_date_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_date_exceptions
    ADD CONSTRAINT product_date_exceptions_pkey PRIMARY KEY (id);


--
-- Name: product_date_exceptions product_date_exceptions_product_id_exception_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_date_exceptions
    ADD CONSTRAINT product_date_exceptions_product_id_exception_date_key UNIQUE (product_id, exception_date);


--
-- Name: production_deductions production_deductions_item_id_type_check; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.production_deductions
    ADD CONSTRAINT production_deductions_item_id_type_check CHECK ((((raw_ingredient_id IS NULL) OR ((item_type = 'raw'::public.inv_item_type) AND (material_id IS NULL))) AND ((material_id IS NULL) OR ((item_type = 'material'::public.inv_item_type) AND (raw_ingredient_id IS NULL))))) NOT VALID;


--
-- Name: production_deductions production_deductions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_deductions
    ADD CONSTRAINT production_deductions_pkey PRIMARY KEY (id);


--
-- Name: production_logs production_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_logs
    ADD CONSTRAINT production_logs_pkey PRIMARY KEY (id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: promo_bundles promo_bundles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promo_bundles
    ADD CONSTRAINT promo_bundles_pkey PRIMARY KEY (id);


--
-- Name: raw_ingredients raw_ingredients_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.raw_ingredients
    ADD CONSTRAINT raw_ingredients_name_key UNIQUE (name);


--
-- Name: raw_ingredients raw_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.raw_ingredients
    ADD CONSTRAINT raw_ingredients_pkey PRIMARY KEY (id);


--
-- Name: recipe_ingredients recipe_ingredients_item_id_type_check; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_item_id_type_check CHECK ((((raw_ingredient_id IS NULL) OR ((item_type = 'raw'::public.inv_item_type) AND (material_id IS NULL))) AND ((material_id IS NULL) OR ((item_type = 'material'::public.inv_item_type) AND (raw_ingredient_id IS NULL))))) NOT VALID;


--
-- Name: recipe_ingredients recipe_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (id);


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);


--
-- Name: recipes recipes_product_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_product_id_key UNIQUE (product_id);


--
-- Name: waste_logs waste_logs_item_id_type_check; Type: CHECK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE public.waste_logs
    ADD CONSTRAINT waste_logs_item_id_type_check CHECK ((((raw_ingredient_id IS NULL) OR ((waste_type = 'ingredient'::public.waste_type) AND (material_id IS NULL))) AND ((material_id IS NULL) OR ((waste_type = 'material'::public.waste_type) AND (raw_ingredient_id IS NULL))))) NOT VALID;


--
-- Name: waste_logs waste_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waste_logs
    ADD CONSTRAINT waste_logs_pkey PRIMARY KEY (id);


--
-- Name: idx_ai_cache_expires; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_cache_expires ON public.ai_cache USING btree (expires_at);


--
-- Name: idx_ai_cache_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ai_cache_key ON public.ai_cache USING btree (cache_key);


--
-- Name: idx_fefo_tracking; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fefo_tracking ON public.inventory_logs USING btree (item_name, expiration_date) WHERE ((remaining_quantity > (0)::numeric) AND (transaction_type = 'IN'::text));


--
-- Name: idx_inventory_logs_material_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_logs_material_item ON public.inventory_logs USING btree (material_id, expiration_date) WHERE ((remaining_quantity > (0)::numeric) AND (transaction_type = 'IN'::text));


--
-- Name: idx_inventory_logs_raw_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inventory_logs_raw_item ON public.inventory_logs USING btree (raw_ingredient_id, expiration_date) WHERE ((remaining_quantity > (0)::numeric) AND (transaction_type = 'IN'::text));


--
-- Name: idx_items_bundle; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_bundle ON public.order_items USING btree (bundle_id) WHERE (bundle_id IS NOT NULL);


--
-- Name: idx_items_bundle_group; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_bundle_group ON public.order_items USING btree (bundle_group_id) WHERE (bundle_group_id IS NOT NULL);


--
-- Name: idx_items_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_order ON public.order_items USING btree (order_id);


--
-- Name: idx_items_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_items_product ON public.order_items USING btree (product_id);


--
-- Name: idx_materials_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_materials_product ON public.celebration_materials USING btree (product_id);


--
-- Name: idx_materials_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_materials_type ON public.celebration_materials USING btree (material_type);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_is_read; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_notifications_is_read ON public.notifications USING btree (is_read);


--
-- Name: idx_orders_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_created ON public.orders USING btree (created_at DESC);


--
-- Name: idx_orders_payment_verification_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_payment_verification_status ON public.orders USING btree (payment_verification_status);


--
-- Name: idx_orders_pickup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_pickup ON public.orders USING btree (pickup_date);


--
-- Name: idx_orders_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_source ON public.orders USING btree (source);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_preorder_capacity_active_date_product; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_preorder_capacity_active_date_product ON public.preorder_capacity_reservations USING btree (pickup_date, product_id) WHERE (state = 'active'::text);


--
-- Name: idx_preorder_capacity_reservation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_preorder_capacity_reservation ON public.preorder_capacity_reservations USING btree (reservation_id);


--
-- Name: idx_prod_logs_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prod_logs_at ON public.production_logs USING btree (produced_at DESC);


--
-- Name: idx_promo_bundles_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_promo_bundles_active ON public.promo_bundles USING btree (is_active);


--
-- Name: idx_promo_bundles_event_tag; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_promo_bundles_event_tag ON public.promo_bundles USING btree (event_tag);


--
-- Name: idx_recipe_ingredients_material_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recipe_ingredients_material_item ON public.recipe_ingredients USING btree (material_id);


--
-- Name: idx_recipe_ingredients_raw_item; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_recipe_ingredients_raw_item ON public.recipe_ingredients USING btree (raw_ingredient_id);


--
-- Name: idx_waste_logs_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_waste_logs_at ON public.waste_logs USING btree (logged_at DESC);


--
-- Name: raw_ingredients trg_ingredients_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_ingredients_upd BEFORE UPDATE ON public.raw_ingredients FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: celebration_materials trg_materials_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_materials_upd BEFORE UPDATE ON public.celebration_materials FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: orders trg_order_number; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_order_number BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_order_number();


--
-- Name: orders trg_orders_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_orders_upd BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: products trg_products_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_products_upd BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: recipes trg_recipes_upd; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_recipes_upd BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


--
-- Name: admins admins_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: celebration_materials celebration_materials_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.celebration_materials
    ADD CONSTRAINT celebration_materials_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: inventory_logs inventory_logs_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.celebration_materials(id) ON DELETE SET NULL;


--
-- Name: inventory_logs inventory_logs_raw_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_logs
    ADD CONSTRAINT inventory_logs_raw_ingredient_id_fkey FOREIGN KEY (raw_ingredient_id) REFERENCES public.raw_ingredients(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_bundle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.promo_bundles(id) ON DELETE SET NULL;


--
-- Name: order_items order_items_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: order_items order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: orders orders_placed_by_admin_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_placed_by_admin_fkey FOREIGN KEY (placed_by_admin) REFERENCES public.admins(id) ON DELETE SET NULL;


--
-- Name: preorder_capacity_reservations preorder_capacity_reservations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.preorder_capacity_reservations
    ADD CONSTRAINT preorder_capacity_reservations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: preorder_capacity_reservations preorder_capacity_reservations_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.preorder_capacity_reservations
    ADD CONSTRAINT preorder_capacity_reservations_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_date_exceptions product_date_exceptions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.product_date_exceptions
    ADD CONSTRAINT product_date_exceptions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: production_deductions production_deductions_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_deductions
    ADD CONSTRAINT production_deductions_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.celebration_materials(id) ON DELETE SET NULL;


--
-- Name: production_deductions production_deductions_production_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_deductions
    ADD CONSTRAINT production_deductions_production_log_id_fkey FOREIGN KEY (production_log_id) REFERENCES public.production_logs(id) ON DELETE CASCADE;


--
-- Name: production_deductions production_deductions_raw_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_deductions
    ADD CONSTRAINT production_deductions_raw_ingredient_id_fkey FOREIGN KEY (raw_ingredient_id) REFERENCES public.raw_ingredients(id) ON DELETE SET NULL;


--
-- Name: production_logs production_logs_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_logs
    ADD CONSTRAINT production_logs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;


--
-- Name: production_logs production_logs_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.production_logs
    ADD CONSTRAINT production_logs_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;


--
-- Name: recipe_ingredients recipe_ingredients_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.celebration_materials(id) ON DELETE RESTRICT;


--
-- Name: recipe_ingredients recipe_ingredients_raw_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_raw_ingredient_id_fkey FOREIGN KEY (raw_ingredient_id) REFERENCES public.raw_ingredients(id) ON DELETE RESTRICT;


--
-- Name: recipe_ingredients recipe_ingredients_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipes recipes_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: waste_logs waste_logs_material_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waste_logs
    ADD CONSTRAINT waste_logs_material_id_fkey FOREIGN KEY (material_id) REFERENCES public.celebration_materials(id) ON DELETE SET NULL;


--
-- Name: waste_logs waste_logs_raw_ingredient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.waste_logs
    ADD CONSTRAINT waste_logs_raw_ingredient_id_fkey FOREIGN KEY (raw_ingredient_id) REFERENCES public.raw_ingredients(id) ON DELETE SET NULL;


--
-- Name: admins Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.admins TO authenticated USING (true);


--
-- Name: ai_cache Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.ai_cache TO authenticated USING (true);


--
-- Name: celebration_materials Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.celebration_materials TO authenticated USING (true);


--
-- Name: customers Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.customers TO authenticated USING (true);


--
-- Name: notifications Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.notifications USING (true) WITH CHECK (true);


--
-- Name: occasions Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.occasions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: order_items Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.order_items TO authenticated USING (true);


--
-- Name: orders Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.orders TO authenticated USING (true);


--
-- Name: product_date_exceptions Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.product_date_exceptions TO authenticated USING (true);


--
-- Name: production_deductions Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.production_deductions TO authenticated USING (true);


--
-- Name: production_logs Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.production_logs TO authenticated USING (true);


--
-- Name: products Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.products TO authenticated USING (true);


--
-- Name: promo_bundles Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.promo_bundles TO authenticated USING (true) WITH CHECK (true);


--
-- Name: raw_ingredients Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.raw_ingredients TO authenticated USING (true);


--
-- Name: recipe_ingredients Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.recipe_ingredients TO authenticated USING (true);


--
-- Name: recipes Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.recipes TO authenticated USING (true);


--
-- Name: waste_logs Auth Full Access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Auth Full Access" ON public.waste_logs TO authenticated USING (true);


--
-- Name: payment_settings Authenticated admins can delete payment settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated admins can delete payment settings" ON public.payment_settings FOR DELETE TO authenticated USING (true);


--
-- Name: payment_settings Authenticated admins can insert payment settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated admins can insert payment settings" ON public.payment_settings FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: payment_settings Authenticated admins can update payment settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated admins can update payment settings" ON public.payment_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);


--
-- Name: inventory_logs Enable insert for authenticated users only; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable insert for authenticated users only" ON public.inventory_logs FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: inventory_logs Enable read access for all users; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Enable read access for all users" ON public.inventory_logs FOR SELECT USING (true);


--
-- Name: payment_settings Public can view payment QR settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Public can view payment QR settings" ON public.payment_settings FOR SELECT TO authenticated, anon USING (true);


--
-- Name: admins; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_cache; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: celebration_materials; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.celebration_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- Name: product_date_exceptions exceptions_pub_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY exceptions_pub_read ON public.product_date_exceptions FOR SELECT USING (true);


--
-- Name: inventory_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_pub_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_pub_read ON public.notifications FOR SELECT USING (true);


--
-- Name: occasions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.occasions ENABLE ROW LEVEL SECURITY;

--
-- Name: occasions occasions_pub_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY occasions_pub_read ON public.occasions FOR SELECT USING (true);


--
-- Name: order_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: preorder_capacity_reservations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.preorder_capacity_reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: product_date_exceptions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.product_date_exceptions ENABLE ROW LEVEL SECURITY;

--
-- Name: production_deductions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.production_deductions ENABLE ROW LEVEL SECURITY;

--
-- Name: production_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: products products_pub_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY products_pub_read ON public.products FOR SELECT USING (true);


--
-- Name: promo_bundles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.promo_bundles ENABLE ROW LEVEL SECURITY;

--
-- Name: promo_bundles promo_pub_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY promo_pub_read ON public.promo_bundles FOR SELECT USING (true);


--
-- Name: raw_ingredients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.raw_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: recipe_ingredients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

--
-- Name: recipes_flavor_backup; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.recipes_flavor_backup ENABLE ROW LEVEL SECURITY;

--
-- Name: waste_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.waste_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION convert_inventory_quantity(p_quantity numeric, p_from text, p_to text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.convert_inventory_quantity(p_quantity numeric, p_from text, p_to text) TO anon;
GRANT ALL ON FUNCTION public.convert_inventory_quantity(p_quantity numeric, p_from text, p_to text) TO authenticated;
GRANT ALL ON FUNCTION public.convert_inventory_quantity(p_quantity numeric, p_from text, p_to text) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION link_preorder_capacity_to_order(p_reservation_id uuid, p_order_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.link_preorder_capacity_to_order(p_reservation_id uuid, p_order_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_preorder_capacity_to_order(p_reservation_id uuid, p_order_id uuid) TO anon;
GRANT ALL ON FUNCTION public.link_preorder_capacity_to_order(p_reservation_id uuid, p_order_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.link_preorder_capacity_to_order(p_reservation_id uuid, p_order_id uuid) TO service_role;


--
-- Name: FUNCTION release_preorder_capacity(p_reservation_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.release_preorder_capacity(p_reservation_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_preorder_capacity(p_reservation_id uuid) TO anon;
GRANT ALL ON FUNCTION public.release_preorder_capacity(p_reservation_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.release_preorder_capacity(p_reservation_id uuid) TO service_role;


--
-- Name: FUNCTION reserve_preorder_capacity(p_reservation_id uuid, p_pickup_date date, p_items jsonb, p_expires_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.reserve_preorder_capacity(p_reservation_id uuid, p_pickup_date date, p_items jsonb, p_expires_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reserve_preorder_capacity(p_reservation_id uuid, p_pickup_date date, p_items jsonb, p_expires_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.reserve_preorder_capacity(p_reservation_id uuid, p_pickup_date date, p_items jsonb, p_expires_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.reserve_preorder_capacity(p_reservation_id uuid, p_pickup_date date, p_items jsonb, p_expires_at timestamp with time zone) TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION set_order_number(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_order_number() TO anon;
GRANT ALL ON FUNCTION public.set_order_number() TO authenticated;
GRANT ALL ON FUNCTION public.set_order_number() TO service_role;


--
-- Name: FUNCTION touch_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.touch_updated_at() TO anon;
GRANT ALL ON FUNCTION public.touch_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.touch_updated_at() TO service_role;


--
-- Name: TABLE celebration_materials; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.celebration_materials TO anon;
GRANT ALL ON TABLE public.celebration_materials TO authenticated;
GRANT ALL ON TABLE public.celebration_materials TO service_role;


--
-- Name: FUNCTION update_material_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric, p_product_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_material_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric, p_product_id uuid) TO anon;
GRANT ALL ON FUNCTION public.update_material_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric, p_product_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.update_material_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric, p_product_id uuid) TO service_role;


--
-- Name: TABLE raw_ingredients; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.raw_ingredients TO anon;
GRANT ALL ON TABLE public.raw_ingredients TO authenticated;
GRANT ALL ON TABLE public.raw_ingredients TO service_role;


--
-- Name: FUNCTION update_raw_ingredient_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_raw_ingredient_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric) TO anon;
GRANT ALL ON FUNCTION public.update_raw_ingredient_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric) TO authenticated;
GRANT ALL ON FUNCTION public.update_raw_ingredient_details(p_id uuid, p_name text, p_unit text, p_minimum_stock numeric) TO service_role;


--
-- Name: TABLE admins; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admins TO anon;
GRANT ALL ON TABLE public.admins TO authenticated;
GRANT ALL ON TABLE public.admins TO service_role;


--
-- Name: TABLE ai_cache; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.ai_cache TO anon;
GRANT ALL ON TABLE public.ai_cache TO authenticated;
GRANT ALL ON TABLE public.ai_cache TO service_role;


--
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.customers TO anon;
GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;


--
-- Name: TABLE inventory_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.inventory_logs TO anon;
GRANT ALL ON TABLE public.inventory_logs TO authenticated;
GRANT ALL ON TABLE public.inventory_logs TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE occasions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.occasions TO anon;
GRANT ALL ON TABLE public.occasions TO authenticated;
GRANT ALL ON TABLE public.occasions TO service_role;


--
-- Name: TABLE order_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.order_items TO anon;
GRANT ALL ON TABLE public.order_items TO authenticated;
GRANT ALL ON TABLE public.order_items TO service_role;


--
-- Name: SEQUENCE order_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.order_seq TO anon;
GRANT ALL ON SEQUENCE public.order_seq TO authenticated;
GRANT ALL ON SEQUENCE public.order_seq TO service_role;


--
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- Name: TABLE payment_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.payment_settings TO anon;
GRANT ALL ON TABLE public.payment_settings TO authenticated;
GRANT ALL ON TABLE public.payment_settings TO service_role;


--
-- Name: TABLE preorder_capacity_reservations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.preorder_capacity_reservations TO anon;
GRANT ALL ON TABLE public.preorder_capacity_reservations TO authenticated;
GRANT ALL ON TABLE public.preorder_capacity_reservations TO service_role;


--
-- Name: TABLE product_date_exceptions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.product_date_exceptions TO anon;
GRANT ALL ON TABLE public.product_date_exceptions TO authenticated;
GRANT ALL ON TABLE public.product_date_exceptions TO service_role;


--
-- Name: TABLE production_deductions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.production_deductions TO anon;
GRANT ALL ON TABLE public.production_deductions TO authenticated;
GRANT ALL ON TABLE public.production_deductions TO service_role;


--
-- Name: TABLE production_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.production_logs TO anon;
GRANT ALL ON TABLE public.production_logs TO authenticated;
GRANT ALL ON TABLE public.production_logs TO service_role;


--
-- Name: TABLE products; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.products TO anon;
GRANT ALL ON TABLE public.products TO authenticated;
GRANT ALL ON TABLE public.products TO service_role;


--
-- Name: TABLE promo_bundles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.promo_bundles TO anon;
GRANT ALL ON TABLE public.promo_bundles TO authenticated;
GRANT ALL ON TABLE public.promo_bundles TO service_role;


--
-- Name: TABLE recipe_ingredients; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.recipe_ingredients TO anon;
GRANT ALL ON TABLE public.recipe_ingredients TO authenticated;
GRANT ALL ON TABLE public.recipe_ingredients TO service_role;


--
-- Name: TABLE recipes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.recipes TO anon;
GRANT ALL ON TABLE public.recipes TO authenticated;
GRANT ALL ON TABLE public.recipes TO service_role;


--
-- Name: TABLE recipes_flavor_backup; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.recipes_flavor_backup TO anon;
GRANT ALL ON TABLE public.recipes_flavor_backup TO authenticated;
GRANT ALL ON TABLE public.recipes_flavor_backup TO service_role;


--
-- Name: TABLE waste_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.waste_logs TO anon;
GRANT ALL ON TABLE public.waste_logs TO authenticated;
GRANT ALL ON TABLE public.waste_logs TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict WWKfnfVEnkDjPKi9x9Cn2goPh44CCvreGgaUPJ4gNDOsfbschExiKftkygq0NbF

