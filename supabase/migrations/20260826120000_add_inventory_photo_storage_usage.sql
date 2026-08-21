-- Real photo storage usage for manage/billing, replacing the placeholder
-- number ManageBillingComponent has shown until now. storage.objects is
-- Supabase Storage's own backing table and isn't exposed to PostgREST
-- directly, so this has to be a SECURITY DEFINER function (same reasoning
-- as every other cross-table/role-checked RPC in this schema) rather than a
-- plain query the client could run itself.
--
-- Scoped to the caller's own org via inventory_item_images -> inventory_items
-- (organization_id), not by parsing storage_path's "<item_id>/..." prefix —
-- joining back through the tables that already carry org scoping is the same
-- approach every other org-isolation check in this schema uses, and doesn't
-- assume anything about the path format staying stable.
--
-- Admin-only, matching manage/billing's own adminGuard (billing is financial
-- information — same audience as Danger Zone, stricter than the
-- admin-or-manager manageGuard most of Manage's other sub-pages use).
create or replace function public.get_inventory_photo_storage_usage()
returns bigint
language plpgsql
stable
security definer set search_path = public
as $$
begin
  if public.current_user_role() != 'admin' then
    raise exception 'only admins can view storage usage';
  end if;

  return coalesce((
    select sum((o.metadata ->> 'size')::bigint)
    from storage.objects o
    join public.inventory_item_images ii on ii.storage_path = o.name
    join public.inventory_items i on i.id = ii.item_id
    where o.bucket_id = 'inventory-images'
      and i.organization_id = public.current_user_org_id()
  ), 0);
end;
$$;

grant execute on function public.get_inventory_photo_storage_usage() to authenticated;
