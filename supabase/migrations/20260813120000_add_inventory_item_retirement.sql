-- Retirement workflow: any authenticated org member can request retiring an
-- item once it's out of stock; admin/manager approves or declines. Modeled
-- directly on add_task_transfers.sql's request/cancel/accept/decline shape —
-- a status column that must not be writable via a raw table UPDATE (RLS
-- can't restrict by column), gated instead behind SECURITY DEFINER RPCs,
-- with the column-scoped revoke/grant at the bottom closing that gap for the
-- rest of inventory_items too (it never got one, unlike tasks).
alter table public.inventory_items
  add column status text not null default 'active'
    check (status in ('active', 'retirement_pending', 'retired')),
  add column retirement_requested_by uuid references public.profiles (id) on delete set null,
  add column retirement_requested_at timestamptz,
  add column retirement_request_note text,
  add column retired_by uuid references public.profiles (id) on delete set null,
  add column retired_at timestamptz;

create index inventory_items_status_idx on public.inventory_items (status);

-- Any org member, not just admin/manager — same trust level as the existing
-- "any authenticated user can edit item fields" policy. Only callable while
-- there's actually nothing left (mirrors the UI gate in ModalTableComponent,
-- enforced here too so it can't be skipped by calling the RPC directly).
create or replace function public.request_item_retirement(item_id uuid, note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  select * into v_item from public.inventory_items where id = item_id;
  if v_item is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'item not found';
  end if;

  if v_item.status != 'active' then
    raise exception 'item is not active';
  end if;

  if v_item.quantity_remaining != 0 then
    raise exception 'item still has stock remaining';
  end if;

  update public.inventory_items
    set status = 'retirement_pending',
      retirement_requested_by = auth.uid(),
      retirement_requested_at = now(),
      retirement_request_note = note
    where id = item_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (
      item_id,
      auth.uid(),
      case when note is null or note = ''
        then 'Requested retirement'
        else 'Requested retirement. Reason: ' || note
      end
    );
end;
$$;

grant execute on function public.request_item_retirement(uuid, text) to authenticated;

-- Lets the requester back out, or an admin/manager clear a request without
-- approving/declining it outright (e.g. it was submitted by mistake).
create or replace function public.cancel_item_retirement_request(item_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  select * into v_item from public.inventory_items where id = item_id;
  if v_item is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'item not found';
  end if;

  if v_item.status != 'retirement_pending' then
    raise exception 'item has no pending retirement request';
  end if;

  if v_item.retirement_requested_by != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the requester (or an admin/manager) can cancel this request';
  end if;

  update public.inventory_items
    set status = 'active',
      retirement_requested_by = null,
      retirement_requested_at = null,
      retirement_request_note = null
    where id = item_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (item_id, auth.uid(), 'Cancelled retirement request');
end;
$$;

grant execute on function public.cancel_item_retirement_request(uuid) to authenticated;

-- retirement_requested_by/at/note are deliberately left in place here (not
-- cleared) as a record of who asked and why — only retired_by/at get set.
create or replace function public.approve_item_retirement(item_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can approve a retirement request';
  end if;

  select * into v_item from public.inventory_items where id = item_id;
  if v_item is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'item not found';
  end if;

  if v_item.status != 'retirement_pending' then
    raise exception 'item has no pending retirement request';
  end if;

  update public.inventory_items
    set status = 'retired',
      retired_by = auth.uid(),
      retired_at = now()
    where id = item_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (item_id, auth.uid(), 'Approved retirement request — item retired');
end;
$$;

grant execute on function public.approve_item_retirement(uuid) to authenticated;

-- No reason param, matching decline_task_transfer's own shape — the item
-- just goes back to active with no leftover pending state.
create or replace function public.decline_item_retirement(item_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can decline a retirement request';
  end if;

  select * into v_item from public.inventory_items where id = item_id;
  if v_item is null or v_item.organization_id != public.current_user_org_id() then
    raise exception 'item not found';
  end if;

  if v_item.status != 'retirement_pending' then
    raise exception 'item has no pending retirement request';
  end if;

  update public.inventory_items
    set status = 'active',
      retirement_requested_by = null,
      retirement_requested_at = null,
      retirement_request_note = null
    where id = item_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (item_id, auth.uid(), 'Declined retirement request');
end;
$$;

grant execute on function public.decline_item_retirement(uuid) to authenticated;

-- inventory_items never had a column-scoped grant before (unlike tasks) —
-- its widened UPDATE policy is a flat using(true)/with check(true), so any
-- authenticated user could otherwise write status/retirement_*/retired_*
-- directly and skip the RPCs above entirely. This list is exactly the
-- columns modal-table.component.ts's two existing .update(...) calls
-- (saveEdit(), performDiscard()) touch today — behavior for those is
-- unchanged, only the new retirement columns become RPC-only.
revoke update on public.inventory_items from authenticated;
grant update (
  name, description, image, category, physical_location, digital_location,
  applicable_year, expiration_date, supplier_name, supplier_lead_time, order_link,
  quantity_total, quantity_per_container, quantity_allocated, quantity_remaining,
  low_quantity_threshold, price_per_unit, price_per_container,
  is_checked_out, checked_out_to, activity_log
) on public.inventory_items to authenticated;
