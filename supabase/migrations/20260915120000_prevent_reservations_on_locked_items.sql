-- A locked item (see 20260822130000_add_inventory_item_locking.sql) already
-- blocks a staff member from editing its fields directly or changing its
-- containers, but create_reservation() never checked is_locked at all — a
-- locked item could still be freely booked out from under whatever the lock
-- was meant to protect. Closes that gap the same way every other
-- is_locked-aware write in this schema already does: admin/manager can
-- still act despite the lock, everyone else can't.
--
-- Diffed against 20260904120000_widen_reservation_access_to_staff.sql's
-- version (the latest at the time) per this repo's own "diff against the
-- previous version" lesson (see 20260815120000_fix_org_isolation_bugs.sql) —
-- the only change here is the new is_locked check right after the existing
-- org/existence check; everything else (date/quantity validation, the
-- capacity check, the insert, both activity log writes) is unchanged.
create or replace function public.create_reservation(
  item_id uuid,
  start_date date,
  end_date date,
  quantity integer,
  reserved_for text,
  note text default null
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
    (item_id, start_date, end_date, quantity, reserved_for, note, reserved_by)
    values (item_id, start_date, end_date, quantity, reserved_for, note, auth.uid())
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
