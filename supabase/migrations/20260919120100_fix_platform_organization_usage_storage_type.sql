-- Second bug in the same function, caught by actually invoking it (a
-- `create or replace function` never validates a plpgsql body's embedded
-- SQL — that only happens at execution time, which is why this and the
-- ambiguous-column bug in 20260919120000 both slipped past a plain
-- migration push): Postgres's sum(bigint) returns numeric, not bigint (only
-- sum(smallint)/sum(integer) return bigint) — so `coalesce(sc.storage_bytes, 0)`
-- returned numeric, which `return query` checks strictly against the
-- function's declared bigint column and rejects ("structure of query does
-- not match function result type ... Returned type numeric does not match
-- expected type bigint in column 4"). A plain scalar `return expression`
-- (see get_inventory_photo_storage_usage(), unaffected by either of this
-- function's bugs) tolerates this via an implicit assignment cast; `return
-- query` does not. Fix is one explicit ::bigint cast; no other logic
-- changes.
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
