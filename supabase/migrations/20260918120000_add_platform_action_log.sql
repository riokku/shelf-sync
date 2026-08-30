-- Platform-admin insight gap: platform_suspend_organization/
-- platform_unsuspend_organization/platform_retire_organization/
-- platform_restore_organization (add_platform_org_suspension_and_retirement)
-- and platform_lock_user_account/platform_unlock_user_account
-- (add_platform_account_lock) have never recorded who did what, when, or
-- why — with a single platform admin today that's invisible, but it
-- becomes a real gap the moment there's ever a second one, and even for
-- one admin it's useful to see "why is this org suspended" without having
-- to remember. Backs a new studio/audit-log page (StudioAuditLogComponent)
-- plus a "Recent platform actions" section on StudioOrgDetailComponent/
-- StudioUserDetailComponent.
--
-- target_label is a point-in-time snapshot (org name / profile_display_name())
-- rather than a live join — same "outlive the thing it references" shape
-- inventory_item_orders.supplier_name already established — so the log
-- still reads correctly after an org is renamed or a profile removed.
create table public.platform_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('suspend', 'unsuspend', 'retire', 'restore', 'lock', 'unlock')),
  target_type text not null check (target_type in ('organization', 'user')),
  target_id uuid not null,
  target_label text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index platform_action_log_created_at_idx on public.platform_action_log (created_at desc);
create index platform_action_log_target_idx on public.platform_action_log (target_type, target_id);

alter table public.platform_action_log enable row level security;

create policy "Platform admins can view the platform action log"
  on public.platform_action_log for select
  to authenticated
  using (public.is_platform_admin());

grant select on public.platform_action_log to authenticated;

-- Six create-or-replace edits below, each diffed against its current
-- version (per this repo's own "diff against the previous version" rule —
-- see fix_task_transfer_org_null_check's own comment for why) to add
-- exactly one insert into platform_action_log at the end. No other logic
-- changes except where noted.

-- platform_suspend_organization: already selects the full v_org row, so
-- v_org.name is available for the log with no extra query.
create or replace function public.platform_suspend_organization(org_id uuid, reason text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org public.organizations;
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can suspend an organization';
  end if;

  select * into v_org from public.organizations where id = org_id;
  if v_org is null then
    raise exception 'organization not found';
  end if;
  if v_org.suspended_at is not null then
    raise exception 'organization is already suspended';
  end if;

  update public.organizations
  set suspended_at = now(), suspended_by = auth.uid(), suspension_reason = reason
  where id = org_id;

  insert into public.platform_action_log (actor_id, action, target_type, target_id, target_label, reason)
    values (auth.uid(), 'suspend', 'organization', org_id, v_org.name, reason);
end;
$$;

-- platform_unsuspend_organization: its "not found" check only ever ran an
-- `exists`, with no row selected — swapped for a `select name into` so the
-- org's name is on hand for the log too, same not-found behavior either way.
create or replace function public.platform_unsuspend_organization(org_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can unsuspend an organization';
  end if;

  select name into v_org_name from public.organizations where id = org_id;
  if v_org_name is null then
    raise exception 'organization not found';
  end if;

  update public.organizations
  set suspended_at = null, suspended_by = null, suspension_reason = null
  where id = org_id;

  insert into public.platform_action_log (actor_id, action, target_type, target_id, target_label)
    values (auth.uid(), 'unsuspend', 'organization', org_id, v_org_name);
end;
$$;

-- platform_retire_organization: already selects the full v_org row.
create or replace function public.platform_retire_organization(org_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org public.organizations;
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can retire an organization';
  end if;

  select * into v_org from public.organizations where id = org_id;
  if v_org is null then
    raise exception 'organization not found';
  end if;
  if v_org.deleted_at is not null then
    raise exception 'organization is already retired';
  end if;

  update public.organizations set deleted_at = now() where id = org_id;

  insert into public.platform_action_log (actor_id, action, target_type, target_id, target_label)
    values (auth.uid(), 'retire', 'organization', org_id, v_org.name);
end;
$$;

-- platform_restore_organization: same exists->select swap as unsuspend above.
create or replace function public.platform_restore_organization(org_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_name text;
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can restore an organization';
  end if;

  select name into v_org_name from public.organizations where id = org_id;
  if v_org_name is null then
    raise exception 'organization not found';
  end if;

  update public.organizations set deleted_at = null where id = org_id;

  insert into public.platform_action_log (actor_id, action, target_type, target_id, target_label)
    values (auth.uid(), 'restore', 'organization', org_id, v_org_name);
end;
$$;

-- platform_lock_user_account: already confirms the profile exists before
-- updating, so profile_display_name(target_id) is guaranteed non-null
-- right after.
create or replace function public.platform_lock_user_account(target_id uuid, reason text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_target_label text;
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can lock a user account';
  end if;

  if target_id = auth.uid() then
    raise exception 'you cannot lock your own account';
  end if;

  if not exists (select 1 from public.profiles where id = target_id) then
    raise exception 'user not found';
  end if;

  update public.profiles
    set account_locked_at = now(), account_locked_by = auth.uid(), account_locked_reason = reason
    where id = target_id;

  v_target_label := public.profile_display_name(target_id);
  insert into public.platform_action_log (actor_id, action, target_type, target_id, target_label, reason)
    values (auth.uid(), 'lock', 'user', target_id, v_target_label, reason);
end;
$$;

grant execute on function public.platform_lock_user_account(uuid, text) to authenticated;

-- platform_unlock_user_account: unlike lock, this never checked the target
-- existed at all (unchanged here) — profile_display_name() returns null for
-- a nonexistent id, so the coalesce guards platform_action_log's own
-- target_label not-null constraint in that edge case.
create or replace function public.platform_unlock_user_account(target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_target_label text;
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can unlock a user account';
  end if;

  update public.profiles
    set account_locked_at = null, account_locked_by = null, account_locked_reason = null
    where id = target_id;

  v_target_label := coalesce(public.profile_display_name(target_id), 'Unknown user');
  insert into public.platform_action_log (actor_id, action, target_type, target_id, target_label)
    values (auth.uid(), 'unlock', 'user', target_id, v_target_label);
end;
$$;

grant execute on function public.platform_unlock_user_account(uuid) to authenticated;
