-- Widens Supabase Realtime's postgres_changes feed (see
-- enable_realtime_for_inventory_and_tasks.sql for the original two-table
-- setup and its own doc comment on the publication-membership +
-- replica-identity mechanism) to three tables that previously had none:
--
--   * inventory_item_images — a pure photo add/remove never touches its
--     parent inventory_items row at all, so InventoryComponent/
--     ManageInventoryComponent's existing inventory_items subscription
--     never saw it; this closes exactly the "pure photo-only edit won't
--     push live" gap CLAUDE.md's own Project Overview section flagged as
--     out of scope for the original pass. (inventory_item_containers and
--     inventory_item_discards are deliberately NOT added here — a
--     container edit or a container-tracked discard already re-derives and
--     writes quantity_remaining/quantity_total back onto the parent
--     inventory_items row on every save, which the existing inventory_items
--     subscription already picks up; adding these two as well would be a
--     second, redundant path to the same already-covered refresh.)
--
--   * inventory_item_orders / inventory_item_reservations — manage/orders
--     and manage/reservations had no realtime subscription of any kind
--     before this migration (unlike every other Manage sub-page with a
--     primary list), so marking an order received or actioning a
--     reservation in one tab never showed up in another until a manual
--     reload.
--
-- Every one of these three tables' own SELECT policy is join-based (scoped
-- via item_id -> inventory_items.organization_id, not a flat
-- organization_id column of its own — see add_inventory_item_images.sql /
-- add_inventory_item_orders.sql / add_inventory_item_reservations.sql),
-- which still gates postgres_changes delivery correctly the same way a
-- flat-column policy does (Realtime evaluates the real RLS policy per
-- subscriber, joins included) — but that join needs item_id present on a
-- DELETE's old-row payload to evaluate at all, which default REPLICA
-- IDENTITY (primary key only) wouldn't include. REPLICA IDENTITY FULL is
-- applied to all three regardless of whether the app currently has a
-- hard-delete path for each (inventory_item_orders/inventory_item_reservations
-- have none today), same "cheap, avoids the same failure mode silently
-- reappearing later" reasoning the original migration gives.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_item_images'
  ) then
    alter publication supabase_realtime add table public.inventory_item_images;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_item_orders'
  ) then
    alter publication supabase_realtime add table public.inventory_item_orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_item_reservations'
  ) then
    alter publication supabase_realtime add table public.inventory_item_reservations;
  end if;
end $$;

alter table public.inventory_item_images replica identity full;
alter table public.inventory_item_orders replica identity full;
alter table public.inventory_item_reservations replica identity full;
