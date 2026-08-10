create table inventory_logs (
  id               uuid primary key default gen_random_uuid(),
  item_type        inv_item_type not null, 
  item_name        text not null,
  transaction_type text not null,          
  quantity         numeric(12,4) not null,
  cost             numeric(10,2) not null default 0, 
  action           text not null,          
  created_at       timestamptz not null default now()
);

-- Index para bumilis ang pag-fetch ng analytics ng kagrupo mo
create index idx_inventory_logs_created on inventory_logs(created_at desc);