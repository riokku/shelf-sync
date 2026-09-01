-- Links multiple inventory_item_reservations rows created together (a
-- multi-item booking placed by hand, or one placed from a reservation kit —
-- see 20260927120000_add_reservation_kits.sql) into a single logical
-- reservation: a client-generated uuid shared across every row from the same
-- submission. Null for an ordinary single-item reservation — unchanged
-- behavior for every reservation placed before this migration, and for any
-- single-item one placed after it. Purely a display/bulk-action grouping tag,
-- not a foreign key to anything — the "group" isn't a row of its own
-- anywhere, just a shared value stamped onto sibling rows at creation time,
-- so ManageReservationsComponent can render them as one card (with per-item
-- sub-rows) and offer a bulk pick-up/return/cancel across the group, while
-- each row keeps its own independent status/action for when only part of a
-- multi-item booking moves.
alter table public.inventory_item_reservations
  add column reservation_group_id uuid;

create index inventory_item_reservations_group_id_idx
  on public.inventory_item_reservations (reservation_group_id)
  where reservation_group_id is not null;

-- create_reservation() needs to accept and store the caller-supplied group
-- id. Adding a trailing parameter to an existing function's signature isn't
-- a plain `create or replace` here (see
-- 20260921120000_add_platform_organization_task_count.sql's own comment on
-- why a signature change sometimes needs a drop first) — dropped and
-- recreated to be safe either way.
--
-- Diffed against 20260915120000_prevent_reservations_on_locked_items.sql's
-- version (the latest at the time) per this repo's own "diff against the
-- previous version" rule (see 20260815120000_fix_org_isolation_bugs.sql) —
-- the only changes are the new group_id parameter and passing it through to
-- the insert; the is_locked check, capacity check, and both activity log
-- writes are all unchanged.
drop function if exists public.create_reservation(uuid, date, date, integer, text, text);

create or replace function public.create_reservation(
  item_id uuid,
  start_date date,
  end_date date,
  quantity integer,
  reserved_for text,
  note text default null,
  group_id uuid default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.inventory_items;
  v_already_reserved integer;
  v_available integer;
  v_id uuid;
begin
  select * into v_item from public.inventory_items where id = item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'item not found';
  end if;

  if v_item.is_locked and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'this item is locked and cannot be reserved';
  end if;

  if end_date < start_date then
    raise exception 'end date must be on or after the start date';
  end if;

  if quantity <= 0 then
    raise exception 'quantity must be greater than zero';
  end if;

  select coalesce(sum(r.quantity), 0) into v_already_reserved
    from public.inventory_item_reservations r
    where r.item_id = create_reservation.item_id
      and r.status in ('reserved', 'picked_up')
      and daterange(r.start_date, r.end_date, '[]')
        && daterange(create_reservation.start_date, create_reservation.end_date, '[]');

  v_available := v_item.quantity_remaining - v_already_reserved;

  if quantity > v_available then
    raise exception 'only % available for these dates', v_available;
  end if;

  insert into public.inventory_item_reservations
    (item_id, start_date, end_date, quantity, reserved_for, note, reserved_by, reservation_group_id)
    values (item_id, start_date, end_date, quantity, reserved_for, note, auth.uid(), group_id)
    returning id into v_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (
      item_id, auth.uid(),
      format('Reserved %s units for %s (%s to %s)', quantity, reserved_for, start_date, end_date)
    );

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_item.organization_id, auth.uid(), 'inventory_item', item_id,
      format('%s: Reserved %s units for %s (%s to %s)', v_item.name, quantity, reserved_for, start_date, end_date)
    );

  return v_id;
end;
$$;

grant execute on function public.create_reservation(uuid, date, date, integer, text, text, uuid) to authenticated;
