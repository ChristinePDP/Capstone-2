alter table celebration_materials
  add column if not exists product_id uuid unique references products(id) on delete set null;

create index if not exists idx_materials_product on celebration_materials(product_id);