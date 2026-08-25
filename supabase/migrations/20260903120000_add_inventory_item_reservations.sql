-- Date-ranged reservations: book a quantity of an item for a future date
-- range (e.g. "50 of our 100 chairs for the Smith wedding, June 1-3")
-- without touching the rest of that item's stock, which stays bookable for
-- non-overlapping dates. Fully separate from is_checked_out/checked_out_to
-- — that flag still means "someone has this in hand right now"; a
-- reservation means "this is spoken for on these dates," with no automatic
-- interaction between the two. Same overall shape as
-- inventory_item_orders (20260828120000_add_inventory_item_orders.sql),
-- with one key difference: creating a reservation needs a capacity check
-- (is there enough *unreserved* stock across the requested range?), which
-- requires aggregating other rows — something a plain RLS `with check`
-- can't express — so creation goes through a SECURITY DEFINER RPC too,
-- rather than a direct grant the way orders' INSERT is.
--
-- reserved_for is free text, not a profiles FK — this books stock for an
-- external customer/event, not an org member the way checked_out_to does.
--
-- Lifecycle is strictly linear with one branch: reserved -> picked_up ->
-- returned, or reserved -> cancelled. Cancelling only applies before
-- pickup — once picked up, the only forward state is returned, same
-- "no going back to pretend it never happened" reasoning orders already
-- has for received.
create table public.inventory_item_reservations (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  quantity integer not null check (quantity > 0),
  reserved_for text not null,
  note text,
  status text not null default 'reserved'
    check (status in ('reserved', 'picked_up', 'returned', 'cancelled')),
  reserved_by uuid references public.profiles (id) on delete set null,
  reserved_at timestamptz not null default now(),
  picked_up_by uuid references public.profiles (id) on delete set null,
  picked_up_at timestamptz,
  returned_by uuid references public.profiles (id) on delete set null,
  returned_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz,
  check (end_date >= start_date)
);

create index inventory_item_reservations_item_id_idx on public.inventory_item_reservations (item_id);

alter table public.inventory_item_reservations enable row level security;

-- Any org member can see what's reserved (joined through to the parent item
-- for org scoping, same day-one-correct shape inventory_item_orders/
-- inventory_item_discards already use rather than a no-join using(true)) —
-- knowing an item is already booked is useful context for anyone, not just
-- admins/managers.
create policy "Authenticated users can view inventory item reservations"
  on public.inventory_item_reservations for select
  to authenticated
  using (
    exists (
      select 1 from public.inventory_items i
      where i.id = inventory_item_reservations.item_id
        and i.organization_id = public.current_user_org_id()
    )
  );

-- No insert/update/delete grant for authenticated at all — stricter than
-- inventory_item_orders (which does grant a direct admin/manager INSERT),
-- because even *creating* a reservation needs the cross-row capacity check
-- below, which a raw RLS with-check can't express. Every write, including
-- creation, goes through the four SECURITY DEFINER RPCs below.

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
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can create a reservation';
  end if;

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

grant execute on function public.create_reservation(uuid, date, date, integer, text, text) to authenticated;

create or replace function public.mark_reservation_picked_up(reservation_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_reservation public.inventory_item_reservations;
  v_item public.inventory_items;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can mark a reservation picked up';
  end if;

  select * into v_reservation from public.inventory_item_reservations where id = reservation_id;
  if v_reservation is null then
    raise exception 'reservation not found';
  end if;

  select * into v_item from public.inventory_items where id = v_reservation.item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'reservation not found';
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

grant execute on function public.mark_reservation_picked_up(uuid) to authenticated;

create or replace function public.mark_reservation_returned(reservation_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_reservation public.inventory_item_reservations;
  v_item public.inventory_items;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can mark a reservation returned';
  end if;

  select * into v_reservation from public.inventory_item_reservations where id = reservation_id;
  if v_reservation is null then
    raise exception 'reservation not found';
  end if;

  select * into v_item from public.inventory_items where id = v_reservation.item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'reservation not found';
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

grant execute on function public.mark_reservation_returned(uuid) to authenticated;

create or replace function public.cancel_reservation(reservation_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_reservation public.inventory_item_reservations;
  v_item public.inventory_items;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can cancel a reservation';
  end if;

  select * into v_reservation from public.inventory_item_reservations where id = reservation_id;
  if v_reservation is null then
    raise exception 'reservation not found';
  end if;

  select * into v_item from public.inventory_items where id = v_reservation.item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'reservation not found';
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

grant execute on function public.cancel_reservation(uuid) to authenticated;
