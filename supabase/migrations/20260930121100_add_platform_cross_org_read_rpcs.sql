-- Security hardening deliberately deferred when add_platform_admin first
-- shipped (see that migration's own comment, and the cross-org leak it and
-- fix_org_isolation_bugs' sibling fix already documented): that migration's
-- three "Platform admins can view all X" policies on profiles/feedback/
-- client_error_log are *additional* permissive SELECT policies, OR'd
-- together with each table's existing org-scoped one. Postgres RLS has no
-- way to know "this particular query came from Studio" versus "this is an
-- ordinary page's own query" — so the moment a caller is both
-- is_platform_admin *and* an actual member of a real org (true the moment
-- a second real organization existed), literally any plain, unfiltered
-- query anywhere in the app against these three tables returned every
-- org's rows, not just the caller's own. The fix applied at the time was
-- narrower and lower-risk: adding an explicit organization_id filter to
-- every *ordinary* page's own query (~20 call sites) rather than touching
-- Studio's own already-working reads.
--
-- This migration is the deferred, architecturally-correct half: three new
-- SECURITY DEFINER RPCs (each gated by is_platform_admin() directly, same
-- "raise exception, not a silent empty result" style
-- platform_get_organization_usage() already established) that are the only
-- way any cross-org read of these three tables happens from here on.
-- Studio's own components (studio-*.component.ts, in the very next commit)
-- switch to calling these instead of a plain `.from(table).select(...)`.
-- Once that's live, a *separate*, later migration drops the three
-- blanket permissive policies entirely — deliberately not in this same
-- migration, so the new RPCs exist and the frontend has a chance to
-- actually deploy against them before the old (leaky, but at least
-- currently-relied-on) policies disappear. See that follow-up migration's
-- own comment for why the two are split this way.
--
-- Each RPC accepts optional filters (an id list, a single organization id,
-- a status, a since-timestamp) matching the specific shapes Studio's own
-- call sites already need — a null filter means "no restriction on that
-- dimension", not "match nothing".
create or replace function public.platform_list_profiles(p_ids uuid[] default null, p_organization_id uuid default null)
returns setof public.profiles
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can list profiles across organizations';
  end if;

  return query
    select * from public.profiles p
    where (p_ids is null or p.id = any(p_ids))
      and (p_organization_id is null or p.organization_id = p_organization_id);
end;
$$;

grant execute on function public.platform_list_profiles(uuid[], uuid) to authenticated;

create or replace function public.platform_list_feedback(p_organization_id uuid default null, p_status text default null)
returns setof public.feedback
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can list feedback across organizations';
  end if;

  return query
    select * from public.feedback f
    where (p_organization_id is null or f.organization_id = p_organization_id)
      and (p_status is null or f.status = p_status)
    order by f.created_at desc;
end;
$$;

grant execute on function public.platform_list_feedback(uuid, text) to authenticated;

-- p_limit is a real `limit` clause, not a client-side slice — Postgres
-- treats `limit null` as unbounded, so passing nothing behaves exactly like
-- omitting a LIMIT clause at all, no coalesce needed. The one caller that
-- wants a cap (StudioErrorLogComponent, currently .limit(200)) can now push
-- that limit down to the database instead of fetching everything and
-- discarding the rest client-side.
create or replace function public.platform_list_client_errors(p_organization_id uuid default null, p_since timestamptz default null, p_limit integer default null)
returns setof public.client_error_log
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can list client errors across organizations';
  end if;

  return query
    select * from public.client_error_log c
    where (p_organization_id is null or c.organization_id = p_organization_id)
      and (p_since is null or c.created_at >= p_since)
    order by c.created_at desc
    limit p_limit;
end;
$$;

grant execute on function public.platform_list_client_errors(uuid, timestamptz, integer) to authenticated;
