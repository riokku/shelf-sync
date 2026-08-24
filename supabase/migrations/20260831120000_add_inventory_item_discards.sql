-- Structured discard log, backing manage/reports' "Stock movement & loss"
-- section. ModalTableComponent's "Discard" flow (see DiscardModalComponent)
-- already logs a human-readable line to inventory_item_activity —
-- "Discarded 3 units from Box 1. Reason: Water damage" — but that's free
-- text with no queryable quantity/reason/category, so grouping discards by
-- reason or category for a report would mean regex-parsing a message string
-- never meant to be parsed. This table captures the same event
-- structurally, alongside (not instead of) that existing text log, which
-- stays exactly as it is for the item's own activity history.
--
-- Same "child table, no organization_id of its own" shape
-- add_inventory_item_containers/add_inventory_item_orders already use — org
-- isolation comes from item_id pointing at an already org-scoped
-- inventory_items row. SELECT joins through to it (the day-one-correct
-- shape add_inventory_item_orders established, not the original no-join
-- `using (true)` add_inventory_item_containers shipped with and had to
-- retrofit — see add_inventory_item_locking's own note on that).
--
-- INSERT is any authenticated user, self-attributed only
-- (`with check (discarded_by = auth.uid())`), same trust level and shape as
-- inventory_item_activity itself — discarding stock is already "not
-- admin/manager-only" by design (see ModalTableComponent.canDiscard's own
-- doc comment), and the actual stock-reducing writes this log describes
-- (inventory_items.quantity_remaining or inventory_item_containers.quantity)
-- are already independently enforced (including the is_locked check) by
-- their own existing UPDATE policies — this table is a pure audit trail of
-- an action that's gated elsewhere, the same relationship
-- inventory_item_activity already has to the edits it logs. No is_locked
-- check needed here for that same reason. No UPDATE/DELETE grant at all —
-- permanent, same as every other audit-trail table in this schema.
create table public.inventory_item_discards (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  -- Set null (not cascaded) on the box's own deletion — same "outlive the
  -- thing it references" shape checked_out_to/inventory_item_orders.supplier_id
  -- already use, so a discard from a since-deleted box still reads
  -- correctly. Null throughout for a flat (non-container-tracked) item.
  container_id uuid references public.inventory_item_containers (id) on delete set null,
  quantity integer not null check (quantity > 0),
  reason text not null,
  discarded_by uuid references public.profiles (id) on delete set null,
  discarded_at timestamptz not null default now()
);

create index inventory_item_discards_item_id_idx on public.inventory_item_discards (item_id);

alter table public.inventory_item_discards enable row level security;

create policy "Authenticated users can view inventory item discards"
  on public.inventory_item_discards for select
  to authenticated
  using (
    exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_discards.item_id
        and i.organization_id = public.current_user_org_id()
    )
  );

create policy "Authenticated users can log inventory item discards"
  on public.inventory_item_discards for insert
  to authenticated
  with check (
    discarded_by = auth.uid()
    and exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_discards.item_id
        and i.organization_id = public.current_user_org_id()
    )
  );
