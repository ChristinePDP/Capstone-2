-- ============================================================
-- CakeLytics — Initial Database Schema v1
-- Paste in: Supabase Dashboard > SQL Editor > New Query > Run
-- ============================================================

create extension if not exists "pgcrypto";

-- ─── ENUMS ──────────────────────────────────────────────────────
create type order_status  as enum ('Confirmed', 'Ready', 'Completed', 'Cancelled');
create type order_type    as enum ('Pre-Order', 'Buy Now');
create type order_source  as enum ('online', 'walk-in');
create type payment_type  as enum ('full', 'deposit');
create type waste_type    as enum ('ingredient', 'material', 'product');
create type inv_item_type as enum ('raw', 'material');

-- ─── ADMINS ─────────────────────────────────────────────────────
-- Linked 1:1 with Supabase Auth. Express uses service role, so RLS
-- won't block it — but policies still protect direct DB access.
create table admins (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  email      text not null unique,
  created_at timestamptz not null default now()
);

-- ─── PRODUCTS ───────────────────────────────────────────────────
create table products (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  category          text not null check (category in ('Package','Pastry','Celebration Material')),
  price             numeric(10,2) not null check (price >= 0),
  inclusion         text not null default '',
  image_url         text,                      -- Supabase Storage public URL
  daily_limit       int  not null default 0,   -- 0 = no limit
  is_active         boolean not null default true,
  allow_file_upload boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Size variants (e.g. Tarpaulin sizes)
create table product_variants (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label      text not null,          -- e.g. '2×3 ft'
  price      numeric(10,2) not null check (price >= 0)
);

-- Dates the product is NOT available (owner blocks them)
create table product_date_exceptions (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id) on delete cascade,
  exception_date date not null,
  reason         text,
  unique(product_id, exception_date)
);

-- ─── CUSTOMERS ──────────────────────────────────────────────────
create table customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  alt_phone  text not null default '',
  facebook   text not null default '',
  email      text,
  created_at timestamptz not null default now()
);

-- ─── ORDERS ─────────────────────────────────────────────────────
create sequence order_seq start 1;

create table orders (
  id                     uuid primary key default gen_random_uuid(),
  order_number           text not null unique default '',
  customer_id            uuid references customers(id) on delete set null,
  placed_by_admin        uuid references admins(id) on delete set null,
  order_type             order_type   not null,
  source                 order_source not null,
  status                 order_status not null default 'Confirmed',
  subtotal               numeric(10,2) not null default 0,
  additional_charge      numeric(10,2) not null default 0,
  discount               numeric(10,2) not null default 0,
  grand_total            numeric(10,2) not null default 0,
  payment_type           payment_type not null default 'full',
  amount_paid            numeric(10,2) not null default 0,
  balance                numeric(10,2) not null default 0,
  pickup_date            date,
  pickup_time            time,
  special_instructions   text not null default '',
  customer_reference_url text,
  paymongo_payment_id    text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Auto-generate ORD-0001, ORD-0002, …
create or replace function set_order_number()
returns trigger language plpgsql as $$
begin
  if new.order_number = '' then
    new.order_number := 'ORD-' || lpad(nextval('order_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_order_number
  before insert on orders
  for each row execute function set_order_number();

create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  product_name  text not null,     -- snapshot — never changes even if product is edited
  variant_label text,              -- e.g. '2×3 ft'
  quantity      int  not null check (quantity > 0),
  unit_price    numeric(10,2) not null check (unit_price >= 0),
  total_price   numeric(10,2) not null check (total_price >= 0)
);

-- ─── INVENTORY ──────────────────────────────────────────────────
create table raw_ingredients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  unit           text not null,
  stock_quantity numeric(12,4) not null default 0 check (stock_quantity >= 0),
  minimum_stock  numeric(12,4) not null default 0 check (minimum_stock >= 0),
  cost_per_unit  numeric(10,4) not null default 0 check (cost_per_unit >= 0),
  updated_at     timestamptz not null default now()
);

create table celebration_materials (
  id             uuid primary key default gen_random_uuid(),
  name           text not null unique,
  unit           text not null,
  stock_quantity numeric(12,4) not null default 0 check (stock_quantity >= 0),
  minimum_stock  numeric(12,4) not null default 0 check (minimum_stock >= 0),
  cost_per_unit  numeric(10,4) not null default 0 check (cost_per_unit >= 0),
  updated_at     timestamptz not null default now()
);

-- ─── RECIPES ────────────────────────────────────────────────────
create table recipes (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null unique references products(id) on delete cascade,
  yield_quantity int  not null default 1 check (yield_quantity > 0),
  yield_unit     text not null default 'pcs',
  estimated_cost numeric(10,2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references recipes(id) on delete cascade,
  item_type  inv_item_type not null,   -- 'raw' | 'material'
  item_name  text not null,            -- matches name in raw_ingredients / celebration_materials
  quantity   numeric(12,4) not null check (quantity > 0),
  unit       text not null
);

-- ─── PRODUCTION LOGS ────────────────────────────────────────────
create table production_logs (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      uuid references recipes(id) on delete set null,
  product_id     uuid references products(id) on delete set null,
  product_name   text not null,
  batches        int  not null check (batches > 0),
  total_produced int  not null check (total_produced > 0),
  yield_unit     text not null default 'pcs',
  notes          text not null default '',
  produced_at    timestamptz not null default now()
);

-- What was deducted per production run
create table production_deductions (
  id                uuid primary key default gen_random_uuid(),
  production_log_id uuid not null references production_logs(id) on delete cascade,
  item_type         inv_item_type not null,
  item_name         text not null,
  quantity          numeric(12,4) not null check (quantity > 0),
  unit              text not null
);

-- ─── WASTE LOGS ─────────────────────────────────────────────────
create table waste_logs (
  id         uuid primary key default gen_random_uuid(),
  waste_type waste_type not null,
  item_name  text not null,
  quantity   numeric(12,4) not null check (quantity > 0),
  unit       text not null,
  reason     text not null,
  notes      text not null default '',
  cost       numeric(10,2) not null default 0,
  logged_at  timestamptz not null default now()
);

-- ─── ANALYTICS CACHE ────────────────────────────────────────────
-- Stores Gemini AI responses. Backend refreshes on new orders/production
-- or after TTL expiry. Prevents hammering Gemini on every page load.
create table analytics_cache (
  id           uuid primary key default gen_random_uuid(),
  cache_key    text not null unique,  -- e.g. 'kpi:month', 'gemini:insights'
  payload      jsonb not null,
  generated_at timestamptz not null default now(),
  expires_at   timestamptz not null
);

-- ─── UPDATED_AT TRIGGERS ────────────────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_products_upd    before update on products             for each row execute function touch_updated_at();
create trigger trg_orders_upd      before update on orders               for each row execute function touch_updated_at();
create trigger trg_recipes_upd     before update on recipes              for each row execute function touch_updated_at();
create trigger trg_ingredients_upd before update on raw_ingredients      for each row execute function touch_updated_at();
create trigger trg_materials_upd   before update on celebration_materials for each row execute function touch_updated_at();

-- ─── INDEXES ────────────────────────────────────────────────────
create index idx_orders_status      on orders(status);
create index idx_orders_source      on orders(source);
create index idx_orders_pickup      on orders(pickup_date);
create index idx_orders_created     on orders(created_at desc);
create index idx_items_order        on order_items(order_id);
create index idx_items_product      on order_items(product_id);
create index idx_prod_logs_at       on production_logs(produced_at desc);
create index idx_waste_logs_at      on waste_logs(logged_at desc);
create index idx_cache_key          on analytics_cache(cache_key);
create index idx_cache_expires      on analytics_cache(expires_at);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────
-- Express uses the SERVICE ROLE key which bypasses RLS entirely.
-- These policies are a safety net for direct / anon access only.

alter table products                enable row level security;
alter table product_variants        enable row level security;
alter table product_date_exceptions enable row level security;
alter table customers               enable row level security;
alter table orders                  enable row level security;
alter table order_items             enable row level security;
alter table raw_ingredients         enable row level security;
alter table celebration_materials   enable row level security;
alter table recipes                 enable row level security;
alter table recipe_ingredients      enable row level security;
alter table production_logs         enable row level security;
alter table production_deductions   enable row level security;
alter table waste_logs              enable row level security;
alter table analytics_cache         enable row level security;
alter table admins                  enable row level security; -- Added this for admins table

-- Public read for the customer portal
create policy "products_pub_read"   on products               for select using (true);
create policy "variants_pub_read"   on product_variants       for select using (true);
create policy "exceptions_pub_read" on product_date_exceptions for select using (true);
-- Everything else: only service role (backend) can access

-- ─── IDINAGDAG: AUTH SYNC TRIGGER ───────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.admins (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', 'Staff/Admin'), new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── IDINAGDAG: RLS POLICIES PARA SA CRUD NG AUTHENTICATED USERS ──
create policy "Auth Full Access" on admins                  for all to authenticated using (true);
create policy "Auth Full Access" on products                for all to authenticated using (true);
create policy "Auth Full Access" on product_variants        for all to authenticated using (true);
create policy "Auth Full Access" on product_date_exceptions for all to authenticated using (true);
create policy "Auth Full Access" on customers               for all to authenticated using (true);
create policy "Auth Full Access" on orders                  for all to authenticated using (true);
create policy "Auth Full Access" on order_items             for all to authenticated using (true);
create policy "Auth Full Access" on raw_ingredients         for all to authenticated using (true);
create policy "Auth Full Access" on celebration_materials   for all to authenticated using (true);
create policy "Auth Full Access" on recipes                 for all to authenticated using (true);
create policy "Auth Full Access" on recipe_ingredients      for all to authenticated using (true);
create policy "Auth Full Access" on production_logs         for all to authenticated using (true);
create policy "Auth Full Access" on production_deductions   for all to authenticated using (true);
create policy "Auth Full Access" on waste_logs              for all to authenticated using (true);
create policy "Auth Full Access" on analytics_cache         for all to authenticated using (true);


-- ============================================================
-- SEED DATA — for testing (fixed UUIDs so tests can reference them)
-- ============================================================
 
-- ─── PRODUCTS ───────────────────────────────────────────────────
insert into products (id, name, category, price, inclusion, daily_limit, is_active, allow_file_upload)
values
  ('11111111-1111-1111-1111-111111111111', 'Classic Vanilla Cake', 'Pastry', 850, '1kg round cake', 5, true, false),
  ('22222222-2222-2222-2222-222222222222', 'Chocolate Fudge Cake', 'Pastry', 950, '1kg round cake', 5, true, false),
  ('33333333-3333-3333-3333-333333333333', 'Birthday Package A', 'Package', 2500, 'Cake + tarpaulin + balloons', 2, true, true),
  ('44444444-4444-4444-4444-444444444444', 'Tarpaulin 2x3ft', 'Celebration Material', 150, 'Custom printed tarpaulin', 0, true, true)
on conflict (id) do nothing;
 
-- ─── RAW INGREDIENTS ──────────────────────────────────────────────
insert into raw_ingredients (name, unit, stock_quantity, minimum_stock, cost_per_unit)
values
  ('All-purpose flour', 'kg', 25, 5, 55.0),
  ('White sugar',        'kg', 18, 4, 60.0),
  ('Butter',             'kg', 10, 2, 320.0),
  ('Cocoa powder',       'kg', 6,  1, 280.0),
  ('Fresh milk',         'liters', 12, 3, 95.0),
  ('Bread flour',        'kg', 15, 3, 58.0)
on conflict (name) do nothing;
 
-- ─── CELEBRATION MATERIALS ────────────────────────────────────────
insert into celebration_materials (name, unit, stock_quantity, minimum_stock, cost_per_unit)
values
  ('Tarpaulin 2x3ft',        'pc',  12, 3, 150.0),
  ('Balloon set (12pcs)',    'set', 8,  2, 90.0),
  ('Printed Balloons (Red)', 'pcs', 20, 5, 5.0)
on conflict (name) do nothing;
 
-- ─── RECIPES ────────────────────────────────────────────────────
insert into recipes (id, product_id, yield_quantity, yield_unit, estimated_cost)
values
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 1, 'pcs', 300)
on conflict (id) do nothing;
 
insert into recipe_ingredients (recipe_id, item_type, item_name, quantity, unit)
values
  ('55555555-5555-5555-5555-555555555555', 'raw', 'All-purpose flour', 0.5, 'kg'),
  ('55555555-5555-5555-5555-555555555555', 'raw', 'White sugar',       0.3, 'kg'),
  ('55555555-5555-5555-5555-555555555555', 'raw', 'Butter',            0.2, 'kg')
on conflict do nothing;
 
-- ─── PRODUCTION LOGS (sample historical entry) ────────────────────
insert into production_logs (id, recipe_id, product_id, product_name, batches, total_produced, yield_unit, notes)
values
  ('66666666-6666-6666-6666-666666666666', '55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', 'Classic Vanilla Cake', 1, 1, 'pcs', 'Seed test log')
on conflict (id) do nothing;
 
-- ─── WASTE LOGS (sample entry) ─────────────────────────────────────
insert into waste_logs (waste_type, item_name, quantity, unit, reason, cost)
values
  ('ingredient', 'Butter', 0.1, 'kg', 'Spoiled', 32.0)
on conflict do nothing;