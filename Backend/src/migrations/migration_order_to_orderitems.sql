BEGIN;

-- 1. Bagong columns sa order_items
ALTER TABLE order_items
  ADD COLUMN customer_reference_url text,
  ADD COLUMN special_instructions text NOT NULL DEFAULT '';

-- 2. Ilipat yung laman galing sa orders papunta sa lahat ng items niya
UPDATE order_items oi
SET customer_reference_url = o.customer_reference_url,
    special_instructions   = o.special_instructions
FROM orders o
WHERE oi.order_id = o.id
  AND (o.customer_reference_url IS NOT NULL OR o.special_instructions <> '');

-- 3. Tanggalin na sa orders
ALTER TABLE orders
  DROP COLUMN customer_reference_url,
  DROP COLUMN special_instructions;

COMMIT;