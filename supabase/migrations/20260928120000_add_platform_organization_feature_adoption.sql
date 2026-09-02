-- Backs a new "org health" badge (Bronze/Silver/Gold) on Studio — a quick
-- signal for which orgs are actually adopting the product's deeper features
-- (containers, reservations, orders, broadcasts, completed audits) versus
-- barely using it, surfaced on studio/usage, studio/organizations, and
-- studio/organizations/:id.
--
-- Extends platform_get_organization_usage() again with 5 more per-org
-- counts, same "extend the existing SECURITY DEFINER RPC rather than add a
-- new cross-org RLS policy pair" reasoning add_platform_organization_task_count
-- already established for task_count. bigint counts, not booleans — matching
-- this function's existing item_count/task_count/storage_bytes shape (a
-- count is strictly more useful than a flag, and "adopted at all" is just
-- `count > 0` client-side) rather than introducing a second, narrower shape
-- alongside them.
--
-- container_count/reservation_count/order_count all join through
-- item_id -> inventory_items.organization_id, same shape this function's
-- own storage_bytes subquery already uses — none of those three tables carry
-- an organization_id column of their own. broadcast_count/
-- completed_audit_count group directly on their own organization_id instead.
--
-- A table function's return columns can't change via `create or replace`
-- (same constraint noted in 20260919120100/20260921120000), so this drops
-- the old signature before recreating it.
drop function public.platform_get_organization_usage(uuid);

create function public.platform_get_organization_usage(p_organization_id uuid default null)
returns table (
  organization_id uuid,
  member_count bigint,
  item_count bigint,
  task_count bigint,
  storage_bytes bigint,
  container_count bigint,
  reservation_count bigint,
  order_count bigint,
  broadcast_count bigint,
  completed_audit_count bigint
)
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
      coalesce(sc.storage_bytes, 0)::bigint,
      coalesce(cc.container_count, 0),
      coalesce(rc.reservation_count, 0),
      coalesce(ordc.order_count, 0),
      coalesce(bc.broadcast_count, 0),
      coalesce(auc.completed_audit_count, 0)
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
    left join (
      select i.organization_id, count(*) as container_count
      from public.inventory_item_containers c
      join public.inventory_items i on i.id = c.item_id
      group by i.organization_id
    ) cc on cc.organization_id = o.id
    left join (
      select i.organization_id, count(*) as reservation_count
      from public.inventory_item_reservations r
      join public.inventory_items i on i.id = r.item_id
      group by i.organization_id
    ) rc on rc.organization_id = o.id
    left join (
      select i.organization_id, count(*) as order_count
      from public.inventory_item_orders ord
      join public.inventory_items i on i.id = ord.item_id
      group by i.organization_id
    ) ordc on ordc.organization_id = o.id
    left join (
      select b.organization_id, count(*) as broadcast_count
      from public.broadcasts b
      group by b.organization_id
    ) bc on bc.organization_id = o.id
    left join (
      select a.organization_id, count(*) as completed_audit_count
      from public.inventory_audits a
      where a.status = 'completed'
      group by a.organization_id
    ) auc on auc.organization_id = o.id
    where
      case
        when p_organization_id is not null then o.id = p_organization_id
        else o.deleted_at is null
      end;
end;
$$;

grant execute on function public.platform_get_organization_usage(uuid) to authenticated;
