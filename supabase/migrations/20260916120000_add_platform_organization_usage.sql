-- Platform-admin insight gap: Studio's own stat grid (add_platform_admin,
-- StudioComponent) has never shown resource usage *per org* — which orgs
-- are actually driving Supabase storage/egress cost, or already past what
-- the Free tier (shared/models/pricing-tier.ts) allows. Backs a new
-- studio/usage page (StudioUsageComponent).
--
-- Modeled directly on get_inventory_photo_storage_usage()
-- (20260826120000_add_inventory_photo_storage_usage.sql) but cross-org and
-- broader: member/item counts alongside storage, one row per active org.
-- Deliberately a single aggregate-returning RPC rather than a new raw
-- cross-org SELECT policy on inventory_items — a platform admin gets counts
-- to spot which orgs need attention, not read access to any org's actual
-- item contents, which this feature has no need for.
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
      select organization_id, count(*) as member_count
      from public.profiles
      where membership_status = 'approved'
      group by organization_id
    ) pc on pc.organization_id = o.id
    left join (
      select organization_id, count(*) as item_count
      from public.inventory_items
      group by organization_id
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

grant execute on function public.platform_get_organization_usage() to authenticated;
