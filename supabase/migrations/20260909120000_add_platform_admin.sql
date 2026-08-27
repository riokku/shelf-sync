-- The access-control foundation for a new cross-org "Studio" dashboard
-- (StudioComponent and its sub-pages) — the app's own maintainer, not any
-- org's own admin/manager. Every RLS policy and every manage/* route in
-- this schema scopes strictly to the caller's own organization_id; this is
-- the first concept that deliberately spans every org at once.
--
-- profiles.is_platform_admin is RPC/manual-only, same reasoning role/
-- membership_status already have (see create_profiles.sql/add_member_approval.sql)
-- — no column grant is added here at all, since the only writer is a
-- one-off UPDATE run directly against the hosted project (never through the
-- app, never committed to a migration — same "real sensitive one-off value"
-- convention this app's own Vault secrets and hosted-org reseed already
-- follow), not even an RPC.
alter table public.profiles add column is_platform_admin boolean not null default false;

-- Mirrors current_user_role()/current_user_org_id()'s own shape exactly
-- (see create_profiles.sql/create_organizations.sql) — coalesced so a
-- caller with no profile row at all (shouldn't happen, but current_user_*
-- above don't bother either) still gets a clean `false` rather than null.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce((select is_platform_admin from public.profiles where id = auth.uid()), false);
$$;

-- Three new, additional permissive SELECT policies — RLS policies on the
-- same table are OR'd together, so each of these sits alongside that
-- table's existing org-scoped policy without touching it. organizations
-- needs no new policy: its own SELECT policy is already `using (true)` for
-- anon/authenticated (see create_organizations.sql).
create policy "Platform admins can view all feedback"
  on public.feedback for select
  to authenticated
  using (public.is_platform_admin());

create policy "Platform admins can view all client errors"
  on public.client_error_log for select
  to authenticated
  using (public.is_platform_admin());

create policy "Platform admins can view all profiles"
  on public.profiles for select
  to authenticated
  using (public.is_platform_admin());
