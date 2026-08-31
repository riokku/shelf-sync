-- Fills the gap StudioOrgDetailComponent's own doc comment had explicitly
-- flagged: "deliberately not inventory/task counts, which would need a new
-- RLS policy this pass doesn't add." That reasoning predates
-- platform_get_organization_usage() (added later, for StudioUsageComponent's
-- leaderboard) — which is already SECURITY DEFINER and already computes a
-- cross-org inventory item_count by bypassing RLS entirely, so the "needs a
-- new RLS policy" blocker no longer holds. Extending that existing function
-- with a task_count column is simpler than adding a second cross-org SELECT
-- policy pair (on inventory_items and tasks) the way add_platform_admin did
-- for feedback/client_error_log/profiles.
--
-- Also adds an optional p_organization_id filter (default null, so every
-- existing zero-arg call — the leaderboard's own whole-platform query —
-- keeps working unchanged): StudioOrgDetailComponent only ever wants one
-- org's row, not a full leaderboard computed and then discarded down to one.
-- When an id is passed, the org's own deleted_at/suspended_at state is
-- ignored (a platform admin looking at one specific org's detail page wants
-- its real counts regardless of status); the zero-arg leaderboard case keeps
-- excluding deleted orgs exactly as it always has.
--
-- A table function's return columns can't change via `create or replace`
-- (Postgres: "cannot change return type of existing function") — same
-- constraint noted in 20260919120100's own header — so this drops the old
-- signature first.
drop function public.platform_get_organization_usage();

create function public.platform_get_organization_usage(p_organization_id uuid default null)
returns table (organization_id uuid, member_count bigint, item_count bigint, task_count bigint, storage_bytes bigint)
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'only platform admins can view organization usage';
  end if;

  return query
    select
      o.id,
      coalesce(pc.member_count, 0),
      coalesce(ic.item_count, 0),
      coalesce(tc.task_count, 0),
      coalesce(sc.storage_bytes, 0)::bigint
    from public.organizations o
    left join (
      select p.organization_id, count(*) as member_count
      from public.profiles p
      where p.membership_status = 'approved'
      group by p.organization_id
    ) pc on pc.organization_id = o.id
    left join (
      select ii2.organization_id, count(*) as item_count
      from public.inventory_items ii2
      group by ii2.organization_id
    ) ic on ic.organization_id = o.id
    left join (
      select t.organization_id, count(*) as task_count
      from public.tasks t
      group by t.organization_id
    ) tc on tc.organization_id = o.id
    left join (
      select i.organization_id, sum((obj.metadata ->> 'size')::bigint) as storage_bytes
      from storage.objects obj
      join public.inventory_item_images ii on ii.storage_path = obj.name
      join public.inventory_items i on i.id = ii.item_id
      where obj.bucket_id = 'inventory-images'
      group by i.organization_id
    ) sc on sc.organization_id = o.id
    where
      case
        when p_organization_id is not null then o.id = p_organization_id
        else o.deleted_at is null
      end;
end;
$$;
