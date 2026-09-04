-- Security fix (caught in a follow-up /security-review pass, not live abuse):
-- add_platform_account_lock.sql's whole premise was locking out "a malicious
-- individual" who happens to be a platform admin, but is_platform_admin()
-- never actually consulted account_locked_at — only current_user_org_id()
-- did, which gates ordinary org-scoped RLS, not the Studio RPCs or the
-- impersonate-user Edge Function that are actually gated by
-- is_platform_admin() directly. A locked platform admin therefore kept every
-- platform-level capability, including starting a brand-new impersonation
-- session against any other user, and could even self-unlock via
-- platform_unlock_user_account (itself only gated by is_platform_admin()).
--
-- Fixed the same way current_user_org_id() itself already fails closed for
-- deleted/suspended/locked callers: fold `account_locked_at is null` directly
-- into is_platform_admin()'s own lookup. Every platform RPC and RLS policy
-- that calls is_platform_admin() picks this up for free with no other
-- changes needed. The impersonate-user Edge Function reads the
-- is_platform_admin column directly via the service-role client rather than
-- calling this SQL function, so it needed its own matching check — see that
-- function's own updated comment.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select is_platform_admin from public.profiles where id = auth.uid() and account_locked_at is null),
    false
  );
$$;

-- Second, related gap: platform_lock_user_account only ever refused
-- self-locking, unlike impersonate-user's own explicit "cannot target
-- another platform admin" guard. Locking a peer platform admin degraded
-- their ordinary org-scoped access with no comparable check at all — mirror
-- that same guard here so both actions treat "another platform admin" as an
-- ineligible target the same way.
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

  if exists (select 1 from public.profiles where id = target_id and is_platform_admin) then
    raise exception 'cannot lock another platform admin';
  end if;

  update public.profiles
    set account_locked_at = now(), account_locked_by = auth.uid(), account_locked_reason = reason
    where id = target_id;
end;
$$;
