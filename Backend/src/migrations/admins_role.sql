alter table public.admins
  add column if not exists role text;

update public.admins
set role = 'admin'
where role is null or btrim(role) = '';

update public.admins
set role = 'admin,cashier'
where replace(lower(btrim(role)), ' ', '') = 'cashier,admin';

alter table public.admins
  alter column role set default 'admin',
  alter column role set not null;

alter table public.admins
  drop constraint if exists admins_role_allowed;

alter table public.admins
  add constraint admins_role_allowed
  check (
    role = 'admin'
    or role = 'cashier'
    or role = 'admin,cashier'
  );
