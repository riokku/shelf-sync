-- Any signed-in user (not just admin/manager) can now edit inventory item
-- details from the item popup, with edits logged to a real activity table.
-- Insert/delete stay admin/manager-only — this only widens UPDATE.
drop policy "Admins and managers can update inventory items" on public.inventory_items;

create policy "Authenticated users can update inventory items"
  on public.inventory_items for update
  to authenticated
  using (true)
  with check (true);

-- Structured activity log backing the item detail popup's Activity Log tab.
-- inventory_items.activity_log (free text) predates this and is unused by
-- the app; this table is the real source going forward.
create table public.inventory_item_activity (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create index inventory_item_activity_item_id_idx on public.inventory_item_activity (item_id);

alter table public.inventory_item_activity enable row level security;

create policy "Authenticated users can view inventory item activity"
  on public.inventory_item_activity for select
  to authenticated
  using (true);

-- Anyone can log activity, same trust level as the item edit access above,
-- but only ever attributed to themselves (no logging activity as someone
-- else).
create policy "Authenticated users can log their own inventory item activity"
  on public.inventory_item_activity for insert
  to authenticated
  with check (user_id = auth.uid());
