-- Fixes a real bug in platform_get_organization_usage()
-- (20260916120000_add_platform_organization_usage.sql), caught live on
-- studio/usage: "column reference \"organization_id\" is ambiguous".
--
-- The function's own `returns table (organization_id uuid, ...)` makes
-- `organization_id` an implicit PL/pgSQL variable in scope for the whole
-- function body — any *unqualified* reference to a column of the same name
-- anywhere in the embedded SQL becomes ambiguous between "the plpgsql
-- variable" and "the table column". The `pc`/`ic` subqueries below
-- (profiles/inventory_items) both selected and grouped by a bare
-- `organization_id` with no table alias; the third (`sc`, storage) already
-- qualified it as `i.organization_id` and was never affected — which is
-- why the error was consistent rather than intermittent. Fix is to alias
-- every table and qualify every organization_id reference, same as `sc`
-- already did; no other logic changes.
create or replace function public.platform_get_organization_usage()
returns table (organization_id uuid, member_count bigint, item_count bigint, storage_bytes bigint)
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
      coalesce(sc.storage_bytes, 0)
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
      select i.organization_id, sum((obj.metadata ->> 'size')::bigint) as storage_bytes
      from storage.objects obj
      join public.inventory_item_images ii on ii.storage_path = obj.name
      join public.inventory_items i on i.id = ii.item_id
      where obj.bucket_id = 'inventory-images'
      group by i.organization_id
    ) sc on sc.organization_id = o.id
    where o.deleted_at is null;
end;
$$;
