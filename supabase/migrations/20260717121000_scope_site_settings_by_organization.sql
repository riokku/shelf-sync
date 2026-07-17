-- site_settings moves from a single global singleton row to one row per
-- organization (real white-labeling instead of one theme/logo for everyone).
alter table public.site_settings drop constraint site_settings_singleton;
alter table public.site_settings drop constraint site_settings_pkey;
alter table public.site_settings alter column id drop default;
alter table public.site_settings alter column id type uuid using gen_random_uuid();
alter table public.site_settings alter column id set default gen_random_uuid();
alter table public.site_settings add primary key (id);

alter table public.site_settings
  add column organization_id uuid references public.organizations (id) on delete cascade;

update public.site_settings
  set organization_id = (select id from public.organizations where slug = 'legacy-organization')
  where organization_id is null;

alter table public.site_settings
  alter column organization_id set not null,
  add constraint site_settings_organization_id_key unique (organization_id);

-- No pre-login org context exists to key branding off of (there's no
-- subdomain-per-tenant setup), so this table is no longer anon-readable.
-- Pre-login pages fall back to the app's built-in default theme/logo instead.
drop policy "Anyone can view site settings" on public.site_settings;
create policy "Users can view their organization's site settings"
  on public.site_settings for select
  to authenticated
  using (organization_id = public.current_user_org_id());

drop policy "Admins can update site settings" on public.site_settings;
create policy "Admins can update their organization's site settings"
  on public.site_settings for update
  to authenticated
  using (public.current_user_role() = 'admin' and organization_id = public.current_user_org_id())
  with check (public.current_user_role() = 'admin' and organization_id = public.current_user_org_id());

-- Each org's row is now created lazily on its admin's first Customize save
-- (there's no singleton pre-seed anymore), so this needs an insert policy
-- where the old singleton shape didn't.
create policy "Admins can insert their organization's site settings"
  on public.site_settings for insert
  to authenticated
  with check (public.current_user_role() = 'admin' and organization_id = public.current_user_org_id());

-- Logo storage paths are now namespaced per org ({organization_id}/logo.ext);
-- restrict writes to an admin's own org's folder. Read stays public so logos
-- still render as plain URLs without signing.
drop policy "Admins can upload site assets" on storage.objects;
create policy "Admins can upload site assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'site-assets'
    and public.current_user_role() = 'admin'
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

drop policy "Admins can update site assets" on storage.objects;
create policy "Admins can update site assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'site-assets'
    and public.current_user_role() = 'admin'
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

drop policy "Admins can delete site assets" on storage.objects;
create policy "Admins can delete site assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'site-assets'
    and public.current_user_role() = 'admin'
    and (storage.foldername(name))[1] = public.current_user_org_id()::text
  );
