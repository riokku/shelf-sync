-- Widens inventory_item_reservations from admin/manager-only to every
-- approved org member (matching how item edits/discards already work), but
-- staff-role callers only ever see and act on their *own* reservations
-- (reserved_by = auth.uid()) — admin/manager keep the full org-wide view
-- and can act on anyone's. Staff can still create new reservations freely;
-- the capacity check inside create_reservation() below is unaffected by
-- this (it queries as SECURITY DEFINER, which already bypasses RLS, so it
-- always sums *every* org member's overlapping reservations regardless of
-- who's calling — a staff member's booking is still correctly blocked by
-- someone else's overlapping one, even though they can't see that other
-- reservation in their own list).
--
-- Note this narrows what ModalTableComponent's read-only "Upcoming
-- reservations" item-popup summary shows a staff viewer too, since it reads
-- through this same SELECT policy — a staff member now sees only their own
-- upcoming bookings there, not every booking against that item. Accepted
-- as a direct, intended consequence of "staff only see their own
-- reservations," not a separate decision.
drop policy "Authenticated users can view inventory item reservations" on public.inventory_item_reservations;

create policy "Authenticated users can view their own or their org's reservations"
  on public.inventory_item_reservations for select
  to authenticated
  using (
    exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_reservations.item_id
        and i.organization_id = public.current_user_org_id()
    )
    and (
      public.current_user_role() in ('admin', 'manager')
      or reserved_by = auth.uid()
    )
  );

-- create_reservation(): drop the admin/manager-only gate entirely — any
-- approved org member can now place a reservation, same trust level as
-- editing an item's fields directly or discarding stock. Body otherwise
-- unchanged from 20260903120000_add_inventory_item_reservations.sql.
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

-- mark_reservation_picked_up() / mark_reservation_returned() /
-- cancel_reservation(): admin/manager can still act on any reservation;
-- everyone else only on their own (reserved_by is distinct from auth.uid()
-- — not != , which is NULL-unsafe: reserved_by can itself be null if that
-- profile was later removed, and `uuid != null` evaluates to NULL rather
-- than true/false in PL/pgSQL, silently skipping the raise — the exact
-- failure class 20260815120000_fix_org_isolation_bugs.sql already had to
-- correct elsewhere in this schema). Bodies otherwise unchanged from
-- 20260903120000_add_inventory_item_reservations.sql.
create or replace function public.mark_reservation_picked_up(reservation_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_reservation public.inventory_item_reservations;
  v_item public.inventory_items;
begin
  select * into v_reservation from public.inventory_item_reservations where id = reservation_id;
  if v_reservation is null then
    raise exception 'reservation not found';
  end if;

  select * into v_item from public.inventory_items where id = v_reservation.item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'reservation not found';
  end if;

  if public.current_user_role() not in ('admin', 'manager') and v_reservation.reserved_by is distinct from auth.uid() then
    raise exception 'only an admin, manager, or the person who made this reservation can mark it picked up';
  end if;

  if v_reservation.status != 'reserved' then
    raise exception 'reservation is not awaiting pickup';
  end if;

  update public.inventory_item_reservations
    set status = 'picked_up', picked_up_by = auth.uid(), picked_up_at = now()
    where id = reservation_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (v_item.id, auth.uid(), format('Marked reservation for %s as picked up', v_reservation.reserved_for));

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_item.organization_id, auth.uid(), 'inventory_item', v_item.id,
      format('%s: Marked reservation for %s as picked up', v_item.name, v_reservation.reserved_for)
    );
end;
$$;

create or replace function public.mark_reservation_returned(reservation_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_reservation public.inventory_item_reservations;
  v_item public.inventory_items;
begin
  select * into v_reservation from public.inventory_item_reservations where id = reservation_id;
  if v_reservation is null then
    raise exception 'reservation not found';
  end if;

  select * into v_item from public.inventory_items where id = v_reservation.item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'reservation not found';
  end if;

  if public.current_user_role() not in ('admin', 'manager') and v_reservation.reserved_by is distinct from auth.uid() then
    raise exception 'only an admin, manager, or the person who made this reservation can mark it returned';
  end if;

  if v_reservation.status != 'picked_up' then
    raise exception 'reservation is not currently picked up';
  end if;

  update public.inventory_item_reservations
    set status = 'returned', returned_by = auth.uid(), returned_at = now()
    where id = reservation_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (v_item.id, auth.uid(), format('Marked reservation for %s as returned', v_reservation.reserved_for));

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_item.organization_id, auth.uid(), 'inventory_item', v_item.id,
      format('%s: Marked reservation for %s as returned', v_item.name, v_reservation.reserved_for)
    );
end;
$$;

create or replace function public.cancel_reservation(reservation_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_reservation public.inventory_item_reservations;
  v_item public.inventory_items;
begin
  select * into v_reservation from public.inventory_item_reservations where id = reservation_id;
  if v_reservation is null then
    raise exception 'reservation not found';
  end if;

  select * into v_item from public.inventory_items where id = v_reservation.item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'reservation not found';
  end if;

  if public.current_user_role() not in ('admin', 'manager') and v_reservation.reserved_by is distinct from auth.uid() then
    raise exception 'only an admin, manager, or the person who made this reservation can cancel it';
  end if;

  if v_reservation.status != 'reserved' then
    raise exception 'reservation can no longer be cancelled';
  end if;

  update public.inventory_item_reservations
    set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
    where id = reservation_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (v_item.id, auth.uid(), format('Cancelled reservation for %s', v_reservation.reserved_for));

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_item.organization_id, auth.uid(), 'inventory_item', v_item.id,
      format('%s: Cancelled reservation for %s', v_item.name, v_reservation.reserved_for)
    );
end;
$$;
