-- Wires inventory_items and tasks into Supabase Realtime's postgres_changes
-- feed, so InventoryComponent/ManageInventoryComponent/TasksComponent/
-- ManageTasksComponent/ManageTeamComponent can subscribe to live changes
-- instead of relying purely on manual reload (see shared/utils/realtime.ts).
--
-- Two independent pieces, both required:
--
-- 1. Publication membership. A table's row-level changes never reach the
--    Realtime broadcast layer at all — regardless of RLS — unless the table
--    is a member of the `supabase_realtime` publication (every hosted
--    Supabase project ships one by default; the Realtime toggle in the
--    dashboard's table editor is just a UI wrapper around this same ALTER
--    PUBLICATION). No prior migration has ever added either table to it.
--    Wrapped in existence checks against pg_publication_tables rather than a
--    bare `alter publication ... add table`, since Postgres has no
--    "ADD TABLE IF NOT EXISTS" for publications, and this needs to be safe
--    to re-run / safe if a table was ever added out-of-band (e.g. via the
--    dashboard UI) before this migration first runs.
--
-- 2. Replica identity. Default REPLICA IDENTITY (primary key only) means a
--    DELETE's "old row" payload contains just the id column — none of the
--    other columns, including organization_id. Since delivery of every
--    postgres_changes event (DELETE included) is gated per-subscriber by the
--    table's own RLS SELECT policy (organization_id = current_user_org_id()
--    for both tables — see scope_inventory_and_tasks_by_organization.sql /
--    add_task_transfers.sql), and RLS can't evaluate a predicate against a
--    column that isn't present in the row being checked, a DELETE with only
--    `id` in the old row would fail that check *closed* for everyone,
--    including members of the deleted row's own organization — not just a
--    leak-prevention gap, an outright failure to deliver the event to
--    anyone at all. REPLICA IDENTITY FULL puts every column in both the
--    insert/update "new" row and the delete "old" row, which fixes that.
--    Applied to both tables even though only
--    ManageTasksComponent.deleteTask() currently performs a real hard
--    delete (inventory_items only has soft status changes today, no
--    hard-delete path) — cheap, and avoids the same failure mode silently
--    reappearing the moment any future inventory hard-delete path is added.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_items'
  ) then
    alter publication supabase_realtime add table public.inventory_items;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;

alter table public.inventory_items replica identity full;
alter table public.tasks replica identity full;
