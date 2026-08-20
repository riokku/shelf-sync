-- Per-container quantity tracking: an item's remaining stock can now be
-- broken into individually-editable boxes/containers (e.g. 100 units in 5
-- boxes of 20) rather than tracked only as a single quantity_remaining
-- aggregate. Mirrors add_inventory_item_images's shape: a child table with
-- no organization_id column of its own — org isolation comes from item_id
-- pointing at an already org-scoped inventory_items row, same accepted
-- precedent images use.
--
-- No position/ordering column: display order is created_at asc, and the
-- "Box N" label shown in the UI is computed client-side as the 1-based index
-- in that sorted list, so deleting a box never requires renumbering siblings.
--
-- INSERT/UPDATE/DELETE are granted to any authenticated user (not
-- admin/manager-only) to match the already-widened inventory_items UPDATE
-- grant this same item-detail-popup Edit/Save flow rides on
-- (add_inventory_item_activity_and_edit_access) — any authenticated user can
-- already edit quantity_remaining directly, so editing it via containers
-- needs the same reach.
create table public.inventory_item_containers (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index inventory_item_containers_item_id_idx on public.inventory_item_containers (item_id);

alter table public.inventory_item_containers enable row level security;

create trigger set_inventory_item_containers_updated_at
  before update on public.inventory_item_containers
  for each row
  execute function public.set_updated_at();

create policy "Authenticated users can view inventory item containers"
  on public.inventory_item_containers for select
  to authenticated
  using (true);

create policy "Authenticated users can insert inventory item containers"
  on public.inventory_item_containers for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update inventory item containers"
  on public.inventory_item_containers for update
  to authenticated
  using (true)
  with check (true);

create policy "Authenticated users can delete inventory item containers"
  on public.inventory_item_containers for delete
  to authenticated
  using (true);
