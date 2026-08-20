-- Lets an admin/manager lock an inventory item against edits by everyone
-- else — no separate "enable locking" toggle, the capability itself is just
-- manager/admin-only by construction, same reasoning the retirement/task-
-- transfer RPCs already use.
alter table public.inventory_items
  add column is_locked boolean not null default false,
  add column locked_by uuid references public.profiles (id) on delete set null,
  add column locked_at timestamptz;

-- Excluded from the any-authenticated column grant below (same reasoning
-- status/retirement_* already are) — the only way these three change is
-- set_inventory_item_lock(). This matters for more than tidiness: the
-- "with check" added to the UPDATE policy further down only works because
-- staff can never submit is_locked themselves — see that policy's own
-- comment for why leaving it in the general grant would actually let staff
-- unlock a locked item.
create or replace function public.set_inventory_item_lock(item_id uuid, locked boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can lock or unlock an item';
  end if;

  select * into v_item from public.inventory_items where id = item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'item not found';
  end if;

  if v_item.is_locked = locked then
    raise exception '%', case when locked then 'item is already locked' else 'item is not locked' end;
  end if;

  update public.inventory_items
    set is_locked = locked,
      locked_by = case when locked then auth.uid() else null end,
      locked_at = case when locked then now() else null end
    where id = item_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (item_id, auth.uid(), case when locked then 'Locked item' else 'Unlocked item' end);

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_item.organization_id, auth.uid(), 'inventory_item', item_id,
      v_item.name || ': ' || case when locked then 'Locked item' else 'Unlocked item' end
    );
end;
$$;

grant execute on function public.set_inventory_item_lock(uuid, boolean) to authenticated;

-- The lock's actual enforcement: a flat column grant can't express "managers
-- can write, staff can't" (every signed-in user is the same Postgres
-- `authenticated` role — see CLAUDE.md's "Important RLS constraint" section),
-- so this has to be a row-level check instead. Diffed against the current
-- live policy (from 20260717120500_scope_inventory_and_tasks_by_organization.sql,
-- its most recent version) before adding the lock clause, per this repo's own
-- "diff against the previous version" lesson — the org check below is
-- unchanged from that version.
drop policy "Authenticated users can update inventory items" on public.inventory_items;
create policy "Authenticated users can update inventory items"
  on public.inventory_items for update
  to authenticated
  using (organization_id = public.current_user_org_id())
  with check (
    organization_id = public.current_user_org_id()
    and (is_locked = false or public.current_user_role() in ('admin', 'manager'))
  );

-- is_locked/locked_by/locked_at are deliberately absent from the column
-- grant above and from every other grant statement in this migration — the
-- existing add_inventory_item_retirement.sql grant (plus barcode's additive
-- one) is the full list of columns `authenticated` can write directly, and
-- staying out of it entirely is what makes them RPC-only, same mechanism
-- status/retirement_* already use.

-- inventory_item_containers has no join back to the parent item in its
-- policies at all today (any-authenticated, org-scoping relies only on the
-- item_id FK) — without this, a locked item's container quantities (and so
-- its effective quantity_remaining) would stay editable by staff, a real
-- bypass of the lock. Mirrors how inventory_item_images' own policies
-- already join through to the parent item for their checks.
drop policy "Authenticated users can insert inventory item containers" on public.inventory_item_containers;
create policy "Authenticated users can insert inventory item containers"
  on public.inventory_item_containers for insert
  to authenticated
  with check (
    exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_containers.item_id
        and (i.is_locked = false or public.current_user_role() in ('admin', 'manager'))
    )
  );

drop policy "Authenticated users can update inventory item containers" on public.inventory_item_containers;
create policy "Authenticated users can update inventory item containers"
  on public.inventory_item_containers for update
  to authenticated
  using (true)
  with check (
    exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_containers.item_id
        and (i.is_locked = false or public.current_user_role() in ('admin', 'manager'))
    )
  );

drop policy "Authenticated users can delete inventory item containers" on public.inventory_item_containers;
create policy "Authenticated users can delete inventory item containers"
  on public.inventory_item_containers for delete
  to authenticated
  using (
    exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_containers.item_id
        and (i.is_locked = false or public.current_user_role() in ('admin', 'manager'))
    )
  );
