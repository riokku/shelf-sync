-- Platform-level org lifecycle actions for Studio (StudioOrganizationsComponent /
-- OrgDetailModalComponent) — the last of the four Studio admin features
-- requested alongside the Studio dashboard stat-grid, the org detail
-- drill-down, and cross-org user lookup. Two distinct actions, per their
-- own distinct purpose:
--
--   * Suspend — an immediate, reversible access block for abuse/non-payment.
--     Does NOT start any delete countdown; an org can sit suspended
--     indefinitely until a platform admin lifts it.
--   * Retire — the platform-side counterpart to manage/danger-zone's own
--     self-service org delete (add_organization_deletion.sql), for when an
--     org's contract concludes. Same soft-delete-then-scheduled-purge
--     mechanism (organizations.deleted_at), just triggerable by a platform
--     admin on *any* org rather than only that org's own admin on their own.
--
-- Both reuse organizations' existing `using (true)` SELECT policy for reads
-- (see create_organizations.sql) — only the writes are new, and those go
-- through SECURITY DEFINER RPCs rather than a widened UPDATE policy, so a
-- platform admin gets exactly these two levers and nothing else (not
-- rename/re-slug power over an org they don't belong to).

-- 1. Suspension columns. suspended_by is a profiles FK (not auth.users)
--    matching this schema's own convention for "who did this" columns
--    elsewhere (retirement_requested_by, locked_by, etc.) — `on delete set
--    null` so a later-removed platform admin's own profile row disappearing
--    doesn't block deleting it.
alter table public.organizations add column suspended_at timestamptz;
alter table public.organizations add column suspended_by uuid references public.profiles (id) on delete set null;
alter table public.organizations add column suspension_reason text;

-- 2. current_user_org_id() is the same single choke point
--    add_organization_deletion.sql already used to fail every org-scoped RLS
--    policy closed once an org is soft-deleted — extending it to also check
--    suspended_at means a suspended org's members lose all data access the
--    same way, no per-policy changes needed. Diffed against
--    fix_org_isolation_bugs.sql's version (the latest before this one) to
--    make sure the membership_status/deleted_at checks it already carries
--    survive unchanged — see that migration's own note on why this matters.
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = auth.uid() and p.membership_status = 'approved' and o.deleted_at is null and o.suspended_at is null;
$$;

-- 3. Suspend / unsuspend — platform-admin only, checked inside the function
--    (mirrors admin_set_user_role()'s own shape: raise, don't silently
--    no-op, on a failed permission check).
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
end;
$$;

create or replace function public.platform_unsuspend_organization(org_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can unsuspend an organization';
  end if;

  if not exists (select 1 from public.organizations where id = org_id) then
    raise exception 'organization not found';
  end if;

  update public.organizations
  set suspended_at = null, suspended_by = null, suspension_reason = null
  where id = org_id;
end;
$$;

-- 4. Retire / restore — the platform-side counterpart to
--    ManageDangerZoneComponent.deleteOrganization()'s own direct table
--    update, which only an org's own admin can reach (its RLS policy checks
--    id = current_user_org_id()). restore_organization also happens to be
--    the self-service "undo" add_organization_deletion.sql's own comment
--    noted didn't exist yet ("Recovery today is a manual update... there's
--    no self-service UI yet") — still not self-service for an org's own
--    admin, but at least no longer a manual SQL statement against the
--    hosted project.
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
end;
$$;

create or replace function public.platform_restore_organization(org_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can restore an organization';
  end if;

  if not exists (select 1 from public.organizations where id = org_id) then
    raise exception 'organization not found';
  end if;

  update public.organizations set deleted_at = null where id = org_id;
end;
$$;
