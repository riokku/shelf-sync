-- Platform-admin "impersonate as user" for troubleshooting — a real Auth
-- session swap (minted server-side by the new impersonate-user Edge
-- Function via the Admin API, since only that can issue a session for
-- another user; RLS/Postgres can't), not a client-side "view as" hack. This
-- table is purely the audit trail of when that happened, by whom, on whose
-- account, and why — it never grants access to anything itself.
--
-- Same "service-role-only insert, no authenticated INSERT policy at all"
-- shape add_notifications already established (the Edge Function inserts
-- this row using the service_role key every Edge Function already gets
-- automatically), and the same "point-in-time label snapshot alongside a
-- nullable on-delete-set-null reference" shape add_platform_action_log
-- already established for target_label — so this stays readable even after
-- the target profile/org is later renamed or removed, rather than needing a
-- hard FK the row's own history would otherwise be at the mercy of.
create table public.impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  platform_admin_id uuid references public.profiles (id) on delete set null,
  target_user_id uuid references public.profiles (id) on delete set null,
  target_label text not null,
  target_organization_id uuid references public.organizations (id) on delete set null,
  target_organization_label text not null,
  reason text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index impersonation_sessions_target_user_idx on public.impersonation_sessions (target_user_id, started_at desc);
create index impersonation_sessions_started_at_idx on public.impersonation_sessions (started_at desc);

alter table public.impersonation_sessions enable row level security;

create policy "Platform admins can view impersonation sessions"
  on public.impersonation_sessions for select
  to authenticated
  using (public.is_platform_admin());

grant select on public.impersonation_sessions to authenticated;

-- The normal "Stop impersonating" path — called *while still authenticated
-- as the target* (that's the only session that exists once impersonation
-- has started), so it closes whichever of its own rows is still open rather
-- than taking an id at all. No role check beyond "you have a session" is
-- needed: it can only ever close a row where target_user_id already equals
-- the caller's own id.
create or replace function public.end_current_impersonation()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.impersonation_sessions
  set ended_at = now()
  where target_user_id = auth.uid() and ended_at is null;
end;
$$;

grant execute on function public.end_current_impersonation() to authenticated;

-- Cleanup path for a session nobody explicitly stopped (a closed tab, a
-- crashed browser) — lets a platform admin close a stale row later from
-- their own, real session rather than it sitting open forever. Deliberately
-- not restricted to the platform admin who started that particular
-- session — any platform admin noticing a stale row can close it, the same
-- "whoever notices it" reach every other platform_* cleanup RPC in this
-- schema already has toward any org/user, not just ones they personally
-- touched before.
create or replace function public.platform_end_impersonation_session(session_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can end an impersonation session';
  end if;

  update public.impersonation_sessions
  set ended_at = now()
  where id = session_id and ended_at is null;
end;
$$;

grant execute on function public.platform_end_impersonation_session(uuid) to authenticated;
