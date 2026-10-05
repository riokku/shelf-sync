-- Lets an admin allow any approved org member (not just admin/manager) to
-- add a new category, physical location, or supplier directly from the
-- inventory item create/edit forms, instead of pre-curating those lists via
-- Settings > Data / manage/suppliers first. Off by default, preserving every
-- existing org's current admin/manager-only curation behavior.
alter table public.site_settings
  add column allow_inline_field_creation boolean not null default false;

-- Additional *permissive* policies, OR'd onto each table's existing
-- insert policy (inventory_field_options: admin-only; suppliers:
-- admin/manager-only) rather than replacing either — an org that leaves
-- this off keeps exactly the same behavior it already had. Scoped to
-- category/physical_location only (not digital_location/discard_reason,
-- neither of which this feature touches) on inventory_field_options.
create policy "Approved members can insert category/location options when allowed"
  on public.inventory_field_options for insert
  to authenticated
  with check (
    organization_id = public.current_user_org_id()
    and field_name in ('category', 'physical_location')
    and exists (
      select 1 from public.site_settings s
      where s.organization_id = public.current_user_org_id()
        and s.allow_inline_field_creation = true
    )
  );

create policy "Approved members can insert suppliers when allowed"
  on public.suppliers for insert
  to authenticated
  with check (
    organization_id = public.current_user_org_id()
    and exists (
      select 1 from public.site_settings s
      where s.organization_id = public.current_user_org_id()
        and s.allow_inline_field_creation = true
    )
  );
