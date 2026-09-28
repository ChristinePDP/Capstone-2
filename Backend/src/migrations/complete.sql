-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admins (
  id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admins_pkey PRIMARY KEY (id),
  CONSTRAINT admins_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category = ANY (ARRAY['Cake'::text, 'Package'::text, 'Pastry'::text, 'Celebration Material'::text])),
  price numeric NOT NULL CHECK (price >= 0::numeric),
  inclusion text NOT NULL DEFAULT ''::text,
  image_url text,
  daily_limit integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  allow_file_upload boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  stock_quantity integer NOT NULL DEFAULT 0,
  order_slip_fields jsonb DEFAULT '[]'::jsonb,
  order_type text DEFAULT 'Both'::text CHECK (order_type = ANY (ARRAY['Pick-up Today'::text, 'Pre-order'::text, 'Both'::text])),
  pricing_mode text DEFAULT 'fixed'::text,
  price_groups jsonb DEFAULT '[]'::jsonb,
  price_matrix jsonb DEFAULT '[]'::jsonb,
  event_tags ARRAY NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT products_pkey PRIMARY KEY (id)
);
CREATE TABLE public.product_variants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  label text NOT NULL,
  price numeric NOT NULL CHECK (price >= 0::numeric),
  CONSTRAINT product_variants_pkey PRIMARY KEY (id),
  CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.product_date_exceptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  exception_date date NOT NULL,
  reason text,
  CONSTRAINT product_date_exceptions_pkey PRIMARY KEY (id),
  CONSTRAINT product_date_exceptions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.customers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  alt_phone text NOT NULL DEFAULT ''::text,
  facebook text NOT NULL DEFAULT ''::text,
  email text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT customers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_number text NOT NULL DEFAULT ''::text UNIQUE,
  customer_id uuid,
  placed_by_admin uuid,
  order_type USER-DEFINED NOT NULL,
  source USER-DEFINED NOT NULL,
  status USER-DEFINED NOT NULL DEFAULT 'Confirmed'::order_status,
  subtotal numeric NOT NULL DEFAULT 0,
  additional_charge numeric NOT NULL DEFAULT 0,
  discount jsonb NOT NULL DEFAULT '{}'::jsonb,
  grand_total numeric NOT NULL DEFAULT 0,
  payment_type USER-DEFINED NOT NULL DEFAULT 'full'::payment_type,
  amount_paid numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  pickup_date date,
  pickup_time time without time zone,
  paymongo_payment_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  pickup_time_end time without time zone,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id),
  CONSTRAINT orders_placed_by_admin_fkey FOREIGN KEY (placed_by_admin) REFERENCES public.admins(id)
);
CREATE TABLE public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  product_id uuid,
  product_name text NOT NULL,
  variant_label text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0::numeric),
  total_price numeric NOT NULL CHECK (total_price >= 0::numeric),
  order_slip_details jsonb DEFAULT '{}'::jsonb,
  customer_reference_url text,
  special_instructions text NOT NULL DEFAULT ''::text,
  selected_price_options jsonb,
  bundle_id uuid,
  bundle_group_id uuid,
  bundle_name text,
  original_unit_price numeric CHECK (original_unit_price IS NULL OR original_unit_price >= 0::numeric),
  CONSTRAINT order_items_pkey PRIMARY KEY (id),
  CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id),
  CONSTRAINT order_items_bundle_id_fkey FOREIGN KEY (bundle_id) REFERENCES public.promo_bundles(id)
);
CREATE TABLE public.raw_ingredients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  unit text NOT NULL,
  stock_quantity numeric NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0::numeric),
  minimum_stock numeric NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0::numeric),
  cost_per_unit numeric NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0::numeric),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT raw_ingredients_pkey PRIMARY KEY (id)
);
CREATE TABLE public.celebration_materials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  unit text NOT NULL,
  stock_quantity numeric NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0::numeric),
  minimum_stock numeric NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0::numeric),
  cost_per_unit numeric NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0::numeric),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  product_id uuid UNIQUE,
  CONSTRAINT celebration_materials_pkey PRIMARY KEY (id),
  CONSTRAINT celebration_materials_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.recipes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL UNIQUE,
  yield_quantity integer NOT NULL DEFAULT 1 CHECK (yield_quantity > 0),
  yield_unit text NOT NULL DEFAULT 'pcs'::text,
  estimated_cost numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT recipes_pkey PRIMARY KEY (id),
  CONSTRAINT recipes_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.recipe_ingredients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL,
  item_type USER-DEFINED NOT NULL,
  item_name text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0::numeric),
  unit text NOT NULL,
  CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (id),
  CONSTRAINT recipe_ingredients_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id)
);
CREATE TABLE public.production_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recipe_id uuid,
  product_id uuid,
  product_name text NOT NULL,
  batches integer NOT NULL CHECK (batches > 0),
  total_produced integer NOT NULL CHECK (total_produced > 0),
  yield_unit text NOT NULL DEFAULT 'pcs'::text,
  notes text NOT NULL DEFAULT ''::text,
  produced_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT production_logs_pkey PRIMARY KEY (id),
  CONSTRAINT production_logs_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id),
  CONSTRAINT production_logs_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id)
);
CREATE TABLE public.production_deductions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  production_log_id uuid NOT NULL,
  item_type USER-DEFINED NOT NULL,
  item_name text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0::numeric),
  unit text NOT NULL,
  CONSTRAINT production_deductions_pkey PRIMARY KEY (id),
  CONSTRAINT production_deductions_production_log_id_fkey FOREIGN KEY (production_log_id) REFERENCES public.production_logs(id)
);
CREATE TABLE public.waste_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  waste_type USER-DEFINED NOT NULL,
  item_name text NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0::numeric),
  unit text NOT NULL,
  reason text NOT NULL,
  notes text NOT NULL DEFAULT ''::text,
  cost numeric NOT NULL DEFAULT 0,
  logged_at timestamp with time zone NOT NULL DEFAULT now(),
  voided_at timestamp with time zone,
  CONSTRAINT waste_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  cache_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL,
  generated_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  CONSTRAINT ai_cache_pkey PRIMARY KEY (id)
);
CREATE TABLE public.inventory_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  item_type USER-DEFINED NOT NULL,
  item_name text NOT NULL,
  transaction_type text NOT NULL,
  quantity numeric NOT NULL,
  cost numeric NOT NULL DEFAULT 0,
  action text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  voided_at timestamp with time zone,
  expiration_date date,
  remaining_quantity numeric NOT NULL DEFAULT 0,
  CONSTRAINT inventory_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.occasions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_tag text NOT NULL,
  start_month smallint NOT NULL CHECK (start_month >= 1 AND start_month <= 12),
  start_day smallint NOT NULL CHECK (start_day >= 1 AND start_day <= 31),
  end_month smallint NOT NULL CHECK (end_month >= 1 AND end_month <= 12),
  end_day smallint NOT NULL CHECK (end_day >= 1 AND end_day <= 31),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT occasions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text NOT NULL,
  title text NOT NULL,
  message text,
  reference_id text,
  reference_type text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id)
);
CREATE TABLE public.pending_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  amount_due_now numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'expired'::text, 'cancelled'::text])),
  paymongo_checkout_session_id text,
  paymongo_payment_id text,
  result_order_id uuid,
  result_order_number text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  consumed_at timestamp with time zone,
  CONSTRAINT pending_orders_pkey PRIMARY KEY (id),
  CONSTRAINT pending_orders_result_order_id_fkey FOREIGN KEY (result_order_id) REFERENCES public.orders(id)
);
CREATE TABLE public.promo_bundles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bundle_name text NOT NULL,
  product_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  custom_image_url text,
  event_tag text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  discounted_price numeric NOT NULL DEFAULT 0,
  start_month integer,
  start_day integer,
  end_month integer,
  end_day integer,
  bundle_options jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT promo_bundles_pkey PRIMARY KEY (id)
);