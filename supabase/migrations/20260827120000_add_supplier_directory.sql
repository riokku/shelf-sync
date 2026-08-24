-- Supplier directory: a proper org-scoped suppliers table, replacing
-- inventory_items.supplier_name (free text, independently retyped on every
-- item from the same supplier) with a real supplier_id foreign key. Per-item
-- logistics — supplier_lead_time and order_link, which genuinely can vary
-- item to item even from the same supplier (a custom order vs. a stocked
-- one; a specific product page vs. a general storefront) — are deliberately
-- left as-is on inventory_items rather than folded into this table.
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  -- Same default-to-caller's-org technique inventory_items/tasks/activity_log
  -- already use (see e.g. 20260820130000_add_activity_log.sql) so plain
  -- client inserts never need to pass this explicitly.
  organization_id uuid not null references public.organizations (id) on delete cascade
    default public.current_user_org_id(),
  name text not null,
  contact_name text,
  email text,
  phone text,
  website text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create trigger set_suppliers_updated_at
  before update on public.suppliers
  for each row
  execute function public.set_updated_at();

alter table public.suppliers enable row level security;

-- Any org member can read the directory (needed for the supplier picker on
-- the item create/edit forms), but only admin/manager can curate it —
-- richer than inventory_field_options' admin-only insert/delete (this also
-- needs update, for editing a supplier's contact info), but the same "any
-- authenticated user picks from an admin/manager-curated list" shape.
create policy "Users can view their organization's suppliers"
  on public.suppliers for select
  to authenticated
  using (organization_id = public.current_user_org_id());

create policy "Admins and managers can insert suppliers for their organization"
  on public.suppliers for insert
  to authenticated
  with check (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

create policy "Admins and managers can update suppliers for their organization"
  on public.suppliers for update
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  )
  with check (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

create policy "Admins and managers can delete suppliers for their organization"
  on public.suppliers for delete
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

alter table public.inventory_items
  add column supplier_id uuid references public.suppliers (id) on delete set null;

-- Backfill: one directory row per distinct existing supplier_name (per org),
-- then point every item with that name at it. Deliberately doesn't carry
-- supplier_lead_time/order_link over — those stay item-level fields,
-- unchanged by this migration.
insert into public.suppliers (organization_id, name)
select distinct organization_id, supplier_name
from public.inventory_items
where supplier_name is not null and btrim(supplier_name) <> ''
on conflict (organization_id, name) do nothing;

update public.inventory_items i
set supplier_id = s.id
from public.suppliers s
where s.organization_id = i.organization_id
  and s.name = i.supplier_name;

-- supplier_name's data is fully preserved above (as suppliers.name) before
-- being dropped — the item's own supplier is now exclusively a relational
-- link, same "no dangling free-text duplicate of a now-relational value"
-- shape checked_out_to already has (a real FK, with the display label
-- resolved client-side via toInventoryItem(), never stored redundantly as
-- text on the row).
alter table public.inventory_items drop column supplier_name;

-- Additive grant, same pattern 20260818160000_add_inventory_item_barcode.sql
-- used for its own new column — inventory_items has had a column-scoped
-- UPDATE grant since 20260813120000_add_inventory_item_retirement.sql, so a
-- brand new column isn't writable until explicitly added here. Dropping
-- supplier_name above already removed it from that grant automatically.
grant update (supplier_id) on public.inventory_items to authenticated;
