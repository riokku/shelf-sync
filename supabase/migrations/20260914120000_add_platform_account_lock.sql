-- Platform-level account lock: an uber-admin (is_platform_admin) can lock a
-- specific user's account across every org — for a malicious individual,
-- as opposed to platform_suspend_organization (blocks a whole org) or
-- admin_set_user_role/admin_approve_member (an org's own admin managing
-- their own team). Same RPC/manual-only, excluded-from-the-ordinary-
-- column-grant shape role/membership_status/is_platform_admin already use —
-- there's no privilege distinction a flat `authenticated` grant could
-- express, same reasoning create_profiles.sql's own revoke/grant already
-- gives for role.
alter table public.profiles add column account_locked_at timestamptz;
alter table public.profiles add column account_locked_by uuid references public.profiles (id) on delete set null;
alter table public.profiles add column account_locked_reason text;

-- current_user_org_id() is the same single choke point
-- add_platform_org_suspension_and_retirement.sql already used to fail every
-- org-scoped RLS policy closed the instant an org is suspended — folding
-- account_locked_at is null in alongside it means a locked user's data
-- access is blocked schema-wide the instant they're locked too, no
-- per-policy changes needed. Diffed against that migration's version (the
-- latest before this one) to make sure the membership_status/deleted_at/
-- suspended_at checks it already carries survive unchanged.
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = auth.uid() and p.membership_status = 'approved' and o.deleted_at is null and o.suspended_at is null
    and p.account_locked_at is null;
$$;

-- Locking/unlocking doesn't touch a Supabase Auth session directly (that
-- would need the service_role admin API, out of scope for a plain
-- migration) — a locked user's existing session still authenticates fine,
-- but current_user_org_id() above blocks every org-scoped query the moment
-- they're locked, and approvedGuard (see that file's own comment) checks
-- account_locked_at directly on the client to redirect them to
-- /pending-approval with a clear reason rather than letting them wander
-- into a page full of silently-broken queries.
create or replace function public.platform_lock_user_account(target_id uuid, reason text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
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
end;
$$;

grant execute on function public.platform_lock_user_account(uuid, text) to authenticated;

create or replace function public.platform_unlock_user_account(target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can unlock a user account';
  end if;

  update public.profiles
    set account_locked_at = null, account_locked_by = null, account_locked_reason = null
    where id = target_id;
end;
$$;

grant execute on function public.platform_unlock_user_account(uuid) to authenticated;
