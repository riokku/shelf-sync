-- Real usage-cap enforcement against PRICING_TIERS.limits
-- (src/app/shared/models/pricing-tier.ts) — add_subscriptions' own doc
-- comment flagged this as the one thing real Stripe billing didn't yet
-- change: an org could already exceed its own tier's caps before this,
-- since nothing anywhere checked one. This is the server-side backstop
-- (ManageInventoryComponent/ManageTeamComponent both add a matching
-- proactive client-side check/banner alongside this, same "client warns,
-- server actually enforces" shape add_inventory_item_images' own
-- enforce_inventory_item_image_limit trigger already established for the
-- per-item 10-photo cap).
--
-- pricing_tier_limits() hardcodes the same three numbers PRICING_TIERS
-- itself defines, deliberately duplicated rather than shared — this schema
-- has no table those TypeScript numbers could live in without a bigger
-- "make pricing data-driven" change than this pass calls for, and small
-- constant maps are already duplicated across layers elsewhere in this app
-- this same way (e.g. stripe-webhook's own STRIPE_PRICE_IDS, duplicated
-- from create-checkout-session's copy). If PRICING_TIERS' own numbers ever
-- change, this function needs updating to match by hand.
create or replace function public.pricing_tier_limits(p_tier text)
returns table (max_items integer, max_members integer, storage_limit_mb integer)
language sql
immutable
as $$
  select
    case p_tier when 'pro' then null::integer when 'basic' then 1000 else 100 end,
    case p_tier when 'pro' then null::integer when 'basic' then 10 else 3 end,
    case p_tier when 'basic' then 5000 when 'pro' then 25000 else 500 end;
$$;

-- Mirrors BillingService.currentTier's own client-side fallback exactly
-- (pricingTierByKey(subscription()?.tier ?? 'free')) — a missing
-- subscriptions row, same as an unrecognized/future tier value, resolves to
-- Free's own limits via pricing_tier_limits()'s own else-branch above.
create or replace function public.get_organization_tier(p_org_id uuid)
returns text
language sql
stable
as $$
  select coalesce((select tier from public.subscriptions where organization_id = p_org_id), 'free');
$$;

-- Inventory item cap — a before insert trigger, same shape/precedent
-- enforce_inventory_item_image_limit already established for the per-item
-- photo cap, just counting an org's own inventory_items rows instead of one
-- item's own images. Counts every row regardless of status (active/
-- retirement_pending/retired) to match ManageBillingComponent's own
-- inventoryItemCount query exactly (a plain unfiltered count) — so the
-- number an admin sees on Billing and the number this enforces against
-- never disagree. Not security definer: inventory_items' own INSERT policy
-- already requires organization_id = current_user_org_id(), so new.organization_id
-- here is always the caller's own org, and both inventory_items and
-- subscriptions are already readable to any approved member of their own
-- org under existing RLS.
--
-- A known, accepted race: ImportInventoryModalComponent inserts rows in
-- small concurrent chunks (~15 at a time via Promise.all), so several rows
-- in the same chunk can all read the same "current count" before any of
-- them commit, letting a bulk import land slightly over the cap in that
-- edge case. Same tolerance this schema already extends to other
-- best-effort bulk actions (no RPC accepts an array of ids anywhere in this
-- schema) — not worth a stricter (and slower) locking scheme for a rare
-- edge case at the exact boundary of a plan's cap.
create or replace function public.enforce_inventory_item_org_limit()
returns trigger
language plpgsql
as $$
declare
  v_max_items integer;
  v_current_count integer;
begin
  select max_items into v_max_items
  from public.pricing_tier_limits(public.get_organization_tier(new.organization_id));

  if v_max_items is not null then
    select count(*) into v_current_count
    from public.inventory_items
    where organization_id = new.organization_id;

    if v_current_count >= v_max_items then
      raise exception 'Your organization has reached its plan''s inventory item limit (%). Upgrade your plan to add more.', v_max_items;
    end if;
  end if;

  return new;
end;
$$;

create trigger inventory_items_org_limit
  before insert on public.inventory_items
  for each row
  execute function public.enforce_inventory_item_org_limit();

-- Photo storage cap — same underlying query shape
-- get_inventory_photo_storage_usage() already established (storage.objects
-- joined back to inventory_item_images -> inventory_items for org scoping),
-- and security definer for the identical reason that RPC is: storage.objects
-- isn't exposed to PostgREST/ordinary RLS-scoped access the way this
-- schema's own tables are.
--
-- uploadInventoryItemImages() uploads the file to Storage *before* inserting
-- this row (see that function), so by the time this trigger fires the new
-- object already exists in storage.objects — just not yet joined to any
-- inventory_item_images row, which is why the object's own size is summed
-- separately (v_new_object_bytes) rather than being included in the
-- existing-photos join.
--
-- Accepted edge case: if this raises, the file itself is left orphaned in
-- the inventory-images bucket (uploaded, but with no inventory_item_images
-- row pointing at it) — uploadInventoryItemImages()'s own loop stops at the
-- first failed row insert, so at most one orphaned object per rejected
-- upload. Not cleaned up automatically; a wasted few KB/MB sitting right at
-- an org's own cap isn't worth a compensating-delete mechanism for this pass.
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
  if v_org_id is null then
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

create trigger inventory_item_images_org_storage_limit
  before insert on public.inventory_item_images
  for each row
  execute function public.enforce_inventory_item_image_org_storage_limit();

-- Team member cap — enforced at admin_approve_member() (diffed against its
-- add_activity_log version, the latest at the time) rather than at signup/
-- join-request time: a pending join request costs an org nothing against
-- its own cap (ManageBillingComponent's own teamMemberCount query already
-- only counts membership_status = 'approved', so a pending queue can still
-- accumulate freely) — only actually admitting someone as a full member is
-- what this blocks. Simpler than rejecting inside handle_new_user() (an
-- auth.users trigger, whose own exception would fail signUp() itself with a
-- much less specific error) for a case that isn't the actual seat boundary
-- anyway.
--
-- Same accepted-race caveat as the item-count trigger above:
-- applyBulkApprove() fires one admin_approve_member() call per selected
-- profile via Promise.all, so several concurrent approvals can all read the
-- same "already approved" count before any of them commit.
create or replace function public.admin_approve_member(target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_target public.profiles;
  v_max_members integer;
  v_approved_count integer;
begin
  if public.current_user_role() != 'admin' then
    raise exception 'only admins can approve join requests';
  end if;

  select * into v_target from public.profiles where id = target_id;
  if v_target is null or v_target.organization_id != public.current_user_org_id() then
    raise exception 'user not found in your organization';
  end if;

  if v_target.membership_status != 'pending' then
    raise exception 'this user does not have a pending join request';
  end if;

  select max_members into v_max_members
  from public.pricing_tier_limits(public.get_organization_tier(v_target.organization_id));

  if v_max_members is not null then
    select count(*) into v_approved_count
    from public.profiles
    where organization_id = v_target.organization_id and membership_status = 'approved';

    if v_approved_count >= v_max_members then
      raise exception 'Your organization has reached its plan''s team member limit (%). Upgrade your plan before approving more members.', v_max_members;
    end if;
  end if;

  update public.profiles set membership_status = 'approved' where id = target_id;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_target.organization_id, auth.uid(), 'member', target_id, format('Approved %s''s join request', public.profile_display_name(target_id)));
end;
$$;
