BEGIN;

-- 1. Ibalik yung columns sa orders
ALTER TABLE orders
  ADD COLUMN customer_reference_url text,
  ADD COLUMN special_instructions text NOT NULL DEFAULT '';

-- 2. Best-effort restore: unang order_item per order lang yung kukunin
UPDATE orders o
SET customer_reference_url = sub.customer_reference_url,
    special_instructions   = sub.special_instructions
FROM (
  SELECT DISTINCT ON (order_id)
    order_id, customer_reference_url, special_instructions
  FROM order_items
  ORDER BY order_id, id
) sub
WHERE o.id = sub.order_id;

-- 3. Tanggalin sa order_items
ALTER TABLE order_items
  DROP COLUMN customer_reference_url,
  DROP COLUMN special_instructions;

COMMIT;