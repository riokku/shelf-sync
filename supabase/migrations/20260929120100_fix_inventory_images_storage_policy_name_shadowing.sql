-- Real, severe bug found while investigating a live report ("Item created,
-- but image upload failed: new row violates row-level security policy" —
-- every upload, for every org, since fix_org_isolation_bugs.sql shipped).
--
-- That migration's own org-scoping fix for the inventory-images bucket
-- added a correlated subquery against inventory_items:
--
--   exists (
--     select 1 from public.inventory_items i
--     where i.id::text = (storage.foldername(name))[1]
--       and i.organization_id = public.current_user_org_id()
--   )
--
-- The bare `name` inside storage.foldername(name) was meant to reference
-- storage.objects.name (the object path being inserted/deleted — this
-- policy's own table), the same way scope_site_settings_by_organization.sql
-- already uses a bare `name` for the sibling site-assets bucket. But
-- inventory_items *also* has a `name` column (the item's own display name),
-- and introducing `inventory_items i` as a correlated subquery makes that
-- the innermost scope — plain SQL (unlike PL/pgSQL's `variable_conflict =
-- error` setting, which is what caught this schema's *other* ambiguous-name
-- bugs, e.g. fix_platform_organization_usage_ambiguity/
-- fix_complete_inventory_audit_ambiguity) resolves an unqualified column to
-- the nearest enclosing scope with a match, silently, with no error at
-- migration-push time or ever. Confirmed live: pg_policies already shows
-- the persisted expression as `storage.foldername(i.name)` — i.e. it's been
-- splitting the *item's own name* ("Folding Chairs") on '/' this whole
-- time, not the upload path. A plain name with no slash in it makes
-- storage.foldername() return an *empty* array, so `(...)[1]` is null, and
-- `i.id::text = null` is never true — the exists() clause was unconditionally
-- false, rejecting every single inventory photo upload and delete since this
-- shipped, regardless of role or org.
--
-- Fixed by explicitly qualifying the outer table (storage.objects.name)
-- rather than leaving it bare — the only safe way to reference an outer
-- column once a correlated subquery might introduce a same-named one, and
-- worth remembering as its own category alongside this schema's other
-- "diff against the previous version"/ambiguous-name lessons: qualifying a
-- column doesn't help if it's qualified against the *wrong* table, and
-- plain SQL won't ever flag it — only actually calling the policy (or, as
-- here, a live user hitting it) does.
drop policy "Admins and managers can upload inventory images" on storage.objects;
create policy "Admins and managers can upload inventory images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'inventory-images'
    and public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.inventory_items i
      where i.id::text = (storage.foldername(storage.objects.name))[1]
        and i.organization_id = public.current_user_org_id()
    )
  );

drop policy "Admins and managers can delete inventory images" on storage.objects;
create policy "Admins and managers can delete inventory images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'inventory-images'
    and public.current_user_role() in ('admin', 'manager')
    and exists (
      select 1 from public.inventory_items i
      where i.id::text = (storage.foldername(storage.objects.name))[1]
        and i.organization_id = public.current_user_org_id()
    )
  );
