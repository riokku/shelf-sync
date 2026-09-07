-- Security-review follow-up on add_pricing_tier_usage_limits (same-day):
-- enforce_inventory_item_image_org_storage_limit() is security definer (it
-- has to be, to read storage.objects at all — see that migration's own
-- comment), which means it runs *before* the pre-existing "Admins and
-- managers can insert inventory item images" RLS policy gets a chance to
-- reject an insert whose item_id belongs to a different organization (its
-- own `with check` already requires the item's org to match
-- current_user_org_id() — see scope_inventory_and_tasks_by_organization).
-- BEFORE ROW triggers always fire before RLS's own WITH CHECK is evaluated
-- on the same statement, so as originally written this trigger would
-- compute and evaluate *that other org's* real photo-storage total against
-- its plan's cap before RLS ever got a chance to reject the row for the
-- real reason (org mismatch).
--
-- No actual unauthorized write was ever possible either way — that RLS
-- policy still rejects the row regardless of what this trigger decides.
-- The narrow issue is a read-side one: an authenticated user of any org who
-- already knows another org's own inventory_item id (not obtainable
-- anywhere in this app's normal navigation, but not cryptographically
-- unguessable the way a raw random UUID nobody's ever seen is) could
-- attempt an insert naming it and learn, from which specific error comes
-- back ("photo storage limit" vs. an RLS policy violation), whether that
-- other org is at or near its own plan's storage cap — a low-value but
-- real cross-tenant information disclosure that only exists because this
-- one trigger is the one place in this migration that bypasses RLS to see
-- across organizations at all (the sibling inventory_items-count trigger
-- is plain, not security definer, so its own equivalent query is already
-- silently zeroed out by the caller's own RLS for a foreign org's id).
--
-- Fixed by having the trigger bail out immediately whenever the resolved
-- item doesn't belong to the caller's own org (or doesn't resolve at all),
-- deferring entirely to the real RLS policy to reject the insert for the
-- actual reason — the same "let the real check own the real rejection"
-- shape this schema already uses in other security-definer functions
-- (e.g. current_user_org_id() itself is what every RLS policy defers to,
-- not a definer function silently reimplementing that boundary less
-- carefully in one extra place).
create or replace function public.enforce_inventory_item_image_org_storage_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_storage_limit_mb integer;
  v_existing_bytes bigint;
  v_new_object_bytes bigint;
begin
  select organization_id into v_org_id from public.inventory_items where id = new.item_id;
  if v_org_id is null or v_org_id != public.current_user_org_id() then
    return new;
  end if;

  select storage_limit_mb into v_storage_limit_mb
  from public.pricing_tier_limits(public.get_organization_tier(v_org_id));

  if v_storage_limit_mb is not null then
    select coalesce(sum((o.metadata ->> 'size')::bigint), 0) into v_existing_bytes
    from storage.objects o
    join public.inventory_item_images ii on ii.storage_path = o.name
    join public.inventory_items i on i.id = ii.item_id
    where o.bucket_id = 'inventory-images'
      and i.organization_id = v_org_id;

    select coalesce((o.metadata ->> 'size')::bigint, 0) into v_new_object_bytes
    from storage.objects o
    where o.bucket_id = 'inventory-images' and o.name = new.storage_path;

    if (v_existing_bytes + v_new_object_bytes) > (v_storage_limit_mb::bigint * 1024 * 1024) then
      raise exception 'Your organization has reached its plan''s photo storage limit (%MB). Upgrade your plan to add more.', v_storage_limit_mb;
    end if;
  end if;

  return new;
end;
$$;
