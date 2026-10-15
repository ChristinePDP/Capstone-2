-- Publish the public tables consumed by the backend Supabase Realtime bridge.
-- Safe to re-run: existing publication memberships are left unchanged.
DO $$
DECLARE
  table_name text;
  watched_tables text[] := ARRAY[
    'raw_ingredients',
    'celebration_materials',
    'products',
    'recipes',
    'recipe_ingredients',
    'production_logs',
    'waste_logs',
    'inventory_logs',
    'orders',
    'order_items',
    'occasions',
    'promo_bundles',
    'bundle_products',
    'notifications'
  ];
BEGIN
  FOREACH table_name IN ARRAY watched_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = table_name
       ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;
