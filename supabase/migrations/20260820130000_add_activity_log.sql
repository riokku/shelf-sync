-- Org-wide activity log: a single cross-entity feed (inventory item
-- create/edit/retirement, task create/status-change/transfer, member
-- join/approval) backing Manage > Activity Log. Modeled directly on
-- inventory_item_activity (20260713225012_add_inventory_item_activity_and_edit_access.sql)
-- but org-scoped instead of item-scoped, since it needs to span every
-- entity type rather than live inside one item's popup.
create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  -- Same default-to-caller's-org technique inventory_items/tasks already use
  -- (20260717120500_scope_inventory_and_tasks_by_organization.sql) so plain
  -- client inserts never need to pass this explicitly. RPC/trigger inserts
  -- below set it explicitly instead of relying on the default, since a
  -- couple of them (handle_new_user in particular) run outside of a normal
  -- authenticated PostgREST call and current_user_org_id() would return null.
  organization_id uuid not null references public.organizations (id)
    default public.current_user_org_id(),
  -- on delete set null (not cascade) — a log entry should outlive the actor
  -- being removed later, same reasoning inventory_item_activity.user_id uses.
  actor_id uuid references public.profiles (id) on delete set null,
  entity_type text not null check (entity_type in ('inventory_item', 'task', 'member')),
  -- No FK — rows can outlive a deleted item or removed profile, and the
  -- entity table differs by entity_type so a single FK can't target it anyway.
  entity_id uuid,
  message text not null,
  created_at timestamptz not null default now()
);

create index activity_log_org_created_at_idx on public.activity_log (organization_id, created_at desc);

alter table public.activity_log enable row level security;

create policy "Authenticated users can view their organization's activity log"
  on public.activity_log for select
  to authenticated
  using (organization_id = public.current_user_org_id());

-- Same self-attribution rule as inventory_item_activity — anyone can log
-- activity, but only ever attributed to themselves.
create policy "Authenticated users can log their own activity"
  on public.activity_log for insert
  to authenticated
  with check (actor_id = auth.uid() and organization_id = public.current_user_org_id());

-- Append-only: no update/delete policy for any role, same as inventory_item_activity.

-- Shared display-name lookup so the RPCs below don't each re-derive
-- profileDisplayName()'s nickname -> full_name -> email fallback by hand.
create or replace function public.profile_display_name(target_id uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(nullif(p.nickname, ''), nullif(p.full_name, ''), p.email, 'Unknown user')
  from public.profiles p
  where p.id = target_id;
$$;

-- Inventory retirement RPCs: add one activity_log insert alongside each
-- existing inventory_item_activity insert, prefixed with the item name
-- (inventory_item_activity doesn't need the name, it's already scoped to
-- one item's popup — the org-wide feed spans many items so it does).
-- cancel_item_retirement_request is deliberately skipped — backing out of a
-- request isn't a meaningful org-feed event. Bodies below are otherwise
-- unchanged from 20260815120000_fix_org_isolation_bugs.sql.
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

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_item.organization_id,
      auth.uid(),
      'inventory_item',
      item_id,
      v_item.name || ': ' || case when note is null or note = ''
        then 'Requested retirement'
        else 'Requested retirement. Reason: ' || note
      end
    );
end;
$$;

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

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_item.organization_id, auth.uid(), 'inventory_item', item_id, v_item.name || ': Approved retirement request — item retired');
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

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_item.organization_id, auth.uid(), 'inventory_item', item_id, v_item.name || ': Declined retirement request');
end;
$$;

-- Task status RPC: the only place status ever changes (assignee or
-- admin/manager alike, see 20260817183925_close_task_assignee_column_gap.sql),
-- so this single insert covers every "task completed" event too.
create or replace function public.update_task_status(task_id uuid, new_status public.task_status)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_status_label text;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or public.current_user_org_id() is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.assigned_to != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the assignee (or an admin/manager) can update this task''s status';
  end if;

  update public.tasks set status = new_status where id = task_id;

  v_status_label := case new_status
    when 'todo' then 'To do'
    when 'in_progress' then 'In Progress'
    when 'done' then 'Done'
  end;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_task.organization_id, auth.uid(), 'task', task_id, format('Marked "%s" as %s', v_task.title, v_status_label));
end;
$$;

-- Task transfer RPCs: log the offer and the resolution (accept/decline).
-- cancel_task_transfer is deliberately skipped — a retracted-before-anyone-
-- saw-it offer isn't a meaningful org-feed event, same reasoning as
-- cancel_item_retirement_request above. Bodies otherwise unchanged from
-- 20260818140000_fix_task_transfer_org_null_check.sql (request_task_transfer)
-- and 20260815120000_fix_org_isolation_bugs.sql (accept/decline).
create or replace function public.request_task_transfer(task_id uuid, target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_task public.tasks;
  v_target public.profiles;
begin
  select * into v_task from public.tasks where id = task_id;
  if v_task is null or public.current_user_org_id() is null or v_task.organization_id != public.current_user_org_id() then
    raise exception 'task not found';
  end if;

  if v_task.assigned_to != auth.uid() and public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only the current assignee (or an admin/manager) can transfer this task';
  end if;

  select * into v_target from public.profiles where id = target_id;
  if v_target is null or public.current_user_org_id() is null or v_target.organization_id != public.current_user_org_id() then
    raise exception 'target user not found in your organization';
  end if;

  if v_target.membership_status != 'approved' then
    raise exception 'target user has not been approved to join this organization yet';
  end if;

  if target_id = v_task.assigned_to then
    raise exception 'task is already assigned to that person';
  end if;

  update public.tasks set pending_transfer_to = target_id where id = task_id;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_task.organization_id, auth.uid(), 'task', task_id, format('Offered "%s" to %s', v_task.title, public.profile_display_name(target_id)));
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

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_task.organization_id, auth.uid(), 'task', task_id, format('%s accepted "%s"', public.profile_display_name(auth.uid()), v_task.title));
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

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_task.organization_id, auth.uid(), 'task', task_id, format('%s declined "%s"', public.profile_display_name(auth.uid()), v_task.title));
end;
$$;

-- New member joins: handle_new_user() runs as an AFTER INSERT trigger on
-- auth.users, outside of a normal authenticated PostgREST call — auth.uid()
-- and current_user_org_id() aren't reliable here, so organization_id and
-- actor_id are both set explicitly from values the function already has
-- (v_org_id, new.id), and the name lookup runs *after* the profiles insert
-- immediately above it so profile_display_name(new.id) has a row to read.
-- Body otherwise unchanged from 20260814120000_add_member_approval.sql.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_org_name text := new.raw_user_meta_data ->> 'organization_name';
  v_invite_org_id uuid := nullif(new.raw_user_meta_data ->> 'invite_organization_id', '')::uuid;
  v_role public.user_role;
  v_membership_status public.membership_status;
begin
  if v_invite_org_id is not null then
    if not exists (select 1 from public.organizations where id = v_invite_org_id) then
      raise exception 'invalid organization invite';
    end if;
    v_org_id := v_invite_org_id;
    v_role := 'staff';
    v_membership_status := 'pending';
  elsif v_org_name is not null and length(trim(v_org_name)) > 0 then
    insert into public.organizations (name, slug)
    values (
      v_org_name,
      lower(regexp_replace(v_org_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(new.id::text, 1, 8)
    )
    returning id into v_org_id;
    -- Founding admin — no one else exists yet to approve them.
    v_role := 'admin';
    v_membership_status := 'approved';
  else
    raise exception 'signup requires an organization name or invite link';
  end if;

  insert into public.profiles (id, email, full_name, nickname, organization_id, role, membership_status)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'nickname',
    v_org_id,
    v_role,
    v_membership_status
  );

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_org_id,
      new.id,
      'member',
      new.id,
      public.profile_display_name(new.id) || case when v_membership_status = 'approved'
        then ' joined as the founding admin'
        else ' joined the organization'
      end
    );

  return new;
end;
$$;

-- Member approval: log alongside the existing membership_status update.
-- Body otherwise unchanged from 20260814120000_add_member_approval.sql.
create or replace function public.admin_approve_member(target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_target public.profiles;
begin
  if public.current_user_role() != 'admin' then
    raise exception 'only admins can approve join requests';
  end if;

  select * into v_target from public.profiles where id = target_id;
  if v_target is null or v_target.organization_id != public.current_user_org_id() then
    raise exception 'user not found in your organization';
  end if;

  if v_target.membership_status != 'pending' then
    raise exception 'this user does not have a pending join request';
  end if;

  update public.profiles set membership_status = 'approved' where id = target_id;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_target.organization_id, auth.uid(), 'member', target_id, format('Approved %s''s join request', public.profile_display_name(target_id)));
end;
$$;
