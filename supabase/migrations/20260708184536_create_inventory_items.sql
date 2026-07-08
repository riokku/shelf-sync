-- Mirrors src/app/shared/models/inventory-item.model.ts field-for-field.
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  image text,
  category text,
  physical_location text,
  digital_location text,
  applicable_year text,
  expiration_date date,
  supplier_name text,
  supplier_lead_time text,
  order_link text,
  quantity_total integer not null default 0,
  quantity_per_container integer,
  quantity_allocated integer not null default 0,
  quantity_remaining integer not null default 0,
  low_quantity_threshold integer,
  price_per_unit numeric(10, 2),
  price_per_container numeric(10, 2),
  is_checked_out boolean not null default false,
  checked_out_to uuid references public.profiles (id) on delete set null,
  activity_log text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_items enable row level security;

create trigger set_inventory_items_updated_at
  before update on public.inventory_items
  for each row
  execute function public.set_updated_at();

create policy "Authenticated users can view inventory items"
  on public.inventory_items for select
  to authenticated
  using (true);

create policy "Admins and managers can insert inventory items"
  on public.inventory_items for insert
  to authenticated
  with check (public.current_user_role() in ('admin', 'manager'));

create policy "Admins and managers can update inventory items"
  on public.inventory_items for update
  to authenticated
  using (public.current_user_role() in ('admin', 'manager'))
  with check (public.current_user_role() in ('admin', 'manager'));

create policy "Admins and managers can delete inventory items"
  on public.inventory_items for delete
  to authenticated
  using (public.current_user_role() in ('admin', 'manager'));

-- NOTE: staff self-checkout (letting a `staff` user flip is_checked_out /
-- checked_out_to on an item without granting general update rights) is
-- intentionally not scaffolded here. The same authenticated-role-can't-be-
-- split-by-column problem from the profiles migration applies; the right
-- fix is a narrow SECURITY DEFINER RPC (e.g. checkout_item(item_id)), added
-- once the checkout feature is actually built.
