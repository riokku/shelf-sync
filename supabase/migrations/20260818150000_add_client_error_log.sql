-- Supabase-native error tracking: GlobalErrorHandler (src/app/core/
-- global-error-handler.ts) fire-and-forgets every uncaught client error
-- here via log_client_error() rather than a third-party service — no new
-- vendor, stays inside the one piece of infra this project already has.
--
-- organization_id/user_id are NOT trusted from the client — a caller could
-- fabricate them on a raw table insert, so writes only ever happen through
-- the SECURITY DEFINER RPC below, which derives both server-side from
-- auth.uid(). Deliberately profiles.organization_id directly rather than
-- current_user_org_id() — that helper returns null for a pending-approval
-- or soft-deleted-org caller (by design, see fix_org_isolation_bugs.sql),
-- but exactly those callers are still worth attributing errors to; only
-- read access below is limited to an approved admin/manager's own org.
create table public.client_error_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  organization_id uuid references public.organizations (id) on delete set null,
  message text not null,
  stack text,
  url text,
  user_agent text,
  app_env text,
  created_at timestamptz not null default now()
);

create index client_error_log_organization_id_created_at_idx
  on public.client_error_log (organization_id, created_at desc);

alter table public.client_error_log enable row level security;

-- No general INSERT/UPDATE/DELETE policy at all — log_client_error() is a
-- SECURITY DEFINER function, so it writes regardless of RLS (same technique
-- admin_set_user_role()/admin_approve_member() use to touch a column no
-- ordinary policy grants). Anyone who isn't an approved admin/manager of a
-- row's own organization has no access to this table whatsoever.
create policy "Admins and managers can view their organization's error log"
  on public.client_error_log for select
  to authenticated
  using (
    public.current_user_role() in ('admin', 'manager')
    and organization_id = public.current_user_org_id()
  );

-- Errors logged before a profile/session exists at all (a crash on the
-- landing/login/register page) land with organization_id null and are only
-- reachable via direct SQL for now — there's no cross-org "platform admin"
-- role in this schema to safely expose them to in the app itself.
create or replace function public.log_client_error(
  p_message text,
  p_stack text default null,
  p_url text default null,
  p_user_agent text default null,
  p_app_env text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.client_error_log (user_id, organization_id, message, stack, url, user_agent, app_env)
  values (
    auth.uid(),
    (select organization_id from public.profiles where id = auth.uid()),
    left(p_message, 2000),
    left(p_stack, 8000),
    left(p_url, 2000),
    left(p_user_agent, 500),
    left(p_app_env, 50)
  );
exception
  -- Error logging must never itself become the reason something breaks
  -- louder (e.g. auth.uid() touching profiles under an unexpected RLS
  -- state). Swallow and drop the report rather than raising back to a
  -- caller that's already in the middle of handling a different failure.
  when others then
    null;
end;
$$;

-- to public (anon + authenticated) — a crash can happen before sign-in.
grant execute on function public.log_client_error(text, text, text, text, text) to anon, authenticated;
