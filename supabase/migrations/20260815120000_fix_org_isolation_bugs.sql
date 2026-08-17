-- Security fixes from a full review of the org-isolation model:
--
-- 1. current_user_org_id() regressed when admin-approval was added
--    (add_member_approval.sql) — it dropped the organizations/deleted_at
--    join add_organization_deletion.sql added specifically so a
--    soft-deleted org's members lose access schema-wide. Restored below,
--    combined with the membership_status check that replaced it.
--
-- 2. Eight retirement/task-transfer RPCs check org ownership with
--    `v_x.organization_id != current_user_org_id()`. That's NULL-unsafe:
--    current_user_org_id() can legitimately return null (pending
--    membership, or — after fix 1 above — a deleted org), and in
--    PL/pgSQL `uuid != null` is null, and `if null then` does not execute
--    the branch. The check was failing *open* instead of closed for
--    exactly the callers it most needs to reject. Every one re-created
--    below with an explicit null check.
--
-- 3. inventory-images storage bucket never got org-scoped INSERT/DELETE
--    policies when every other table (and the sibling site-assets
--    bucket) did — any admin/manager of any org could write or delete
--    another org's item photos. Fixed by validating the path's leading
--    item_id folder against an inventory_items row in the caller's own
--    org, rather than changing the path format (which would orphan every
--    already-uploaded object from the new policy).

-- 1. current_user_org_id(): restore the deleted-org check dropped by
-- add_member_approval.sql, alongside the membership_status check it added.
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = auth.uid() and p.membership_status = 'approved' and o.deleted_at is null;
$$;

-- 2a. Null-safe org checks — task transfers.
create or replace function public.request_task_transfer(task_id uuid, target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_target_org uuid;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or public.current_user_org_id() is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.assigned_to != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the current assignee (or an admin/manager) can transfer this task';
  end if;

  select organization_id into v_target_org from public.profiles where id = target_id;
  if v_target_org is null or v_target_org != public.current_user_org_id() then
    raise exception 'target user not found in your organization';
  end if;

  if target_id = v_task.assigned_to then
    raise exception 'task is already assigned to that person';
  end if;

  update public.tasks set pending_transfer_to = target_id where id = task_id;
end;
$$;

create or replace function public.cancel_task_transfer(task_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or public.current_user_org_id() is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.assigned_to != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the current assignee (or an admin/manager) can cancel this transfer';
  end if;

  update public.tasks set pending_transfer_to = null where id = task_id;
end;
$$;

create or replace function public.accept_task_transfer(task_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or public.current_user_org_id() is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.pending_transfer_to is null or v_task.pending_transfer_to != auth.uid() then
    raise exception 'no pending transfer to you for this task';
  end if;

  update public.tasks
    set assigned_to = auth.uid(), pending_transfer_to = null
    where id = task_id;
end;
$$;

create or replace function public.decline_task_transfer(task_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or public.current_user_org_id() is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.pending_transfer_to is null or v_task.pending_transfer_to != auth.uid() then
    raise exception 'no pending transfer to you for this task';
  end if;

  update public.tasks set pending_transfer_to = null where id = task_id;
end;
$$;

-- 2b. Null-safe org checks — inventory retirement.
create or replace function public.request_item_retirement(item_id uuid, note text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  select * into v_item from public.inventory_items where id = item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
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

create or replace function public.cancel_item_retirement_request(item_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.inventory_items;
begin
  select * into v_item from public.inventory_items where id = item_id;
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
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

-- approve/decline already independently require admin/manager role, which a
-- pending (staff-role) user can never have — but restoring the
-- deleted-org check in current_user_org_id() (fix 1) means an admin/manager
-- of a just-soft-deleted org would otherwise hit this exact same
-- fail-open bug via a different path, so these two get the same fix for
-- consistency and to close that off pre-emptively.
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
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
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
  if v_item is null or public.current_user_org_id() is null or v_item.organization_id != public.current_user_org_id() then
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

-- 3. inventory-images bucket: org-scope INSERT/DELETE by checking the
-- path's leading item_id folder against an inventory_items row in the
-- caller's own org. inventory_items' own SELECT RLS already limits this
-- subquery to rows the caller can see, so the explicit organization_id
-- check here is belt-and-suspenders, not the only thing standing in the
-- way. SELECT stays public/unscoped — that's the sibling site-assets
-- bucket's own precedent too ("Read stays public so logos still render as
-- plain URLs without signing") and is load-bearing for the photo gallery
-- feature, so it's deliberately not part of this fix.
drop policy "Admins and managers can upload inventory images" on storage.objects;
create policy "Admins and managers can upload inventory images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'inventory-images'
    and public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.inventory_items i
      where i.id::text = (storage.foldername(name))[1]
        and i.organization_id = public.current_user_org_id()
    )
  );

drop policy "Admins and managers can delete inventory images" on storage.objects;
create policy "Admins and managers can delete inventory images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'inventory-images'
    and public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.inventory_items i
      where i.id::text = (storage.foldername(name))[1]
        and i.organization_id = public.current_user_org_id()
    )
  );
