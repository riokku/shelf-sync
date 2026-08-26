-- The previous migration (20260904120000_widen_reservation_access_to_staff.sql)
-- scoped inventory_item_reservations' SELECT policy so a non-admin/manager
-- caller only sees their own rows (reserved_by = auth.uid()) — right for
-- manage/reservations' own org-wide list (staff should only see/act on
-- their own bookings there), but it also silently narrowed
-- ModalTableComponent's "Upcoming reservations" item-popup summary the same
-- way, which should stay visible to everyone regardless of who made the
-- booking — knowing an item is already spoken for is useful context for
-- any viewer deciding whether to check it out right now, the same reasoning
-- that summary's own original doc comment already gives.
--
-- RLS can't express "this same row is visible through one read path but not
-- another" — a policy applies uniformly to every query against the table
-- regardless of which page asked. So this is a second, narrow read path
-- instead: a SECURITY DEFINER function scoped by item_id (not by
-- reserved_by), which bypasses RLS the same way every other RPC in this
-- schema already does for its own controlled purpose. It only ever returns
-- the same "upcoming" shape loadUpcomingReservationsForItem() already
-- queried directly before this — no new fields exposed, no reserved_by
-- name resolution — just widened back to every reservation on that item
-- rather than only the caller's own.
create or replace function public.get_item_upcoming_reservations(p_item_id uuid)
returns setof public.inventory_item_reservations
language sql
stable
security definer set search_path = public
as $$
  select r.*
  from public.inventory_item_reservations r
  join public.inventory_items i on i.id = r.item_id
  where r.item_id = p_item_id
    and i.organization_id = public.current_user_org_id()
    and r.status in ('reserved', 'picked_up')
    and r.end_date >= current_date
  order by r.start_date asc;
$$;

grant execute on function public.get_item_upcoming_reservations(uuid) to authenticated;
