-- Singleton row holding site-wide customization: the active theme preset
-- (see the [data-theme] blocks in src/styles.scss) and an optional custom
-- logo. Readable by anyone (including anon) so the branding applies on the
-- login/register pages too, not just once signed in; writable by admins only.
create table public.site_settings (
  id integer primary key default 1,
  theme text not null default 'default',
  logo_storage_path text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  constraint site_settings_singleton check (id = 1)
);

insert into public.site_settings (id) values (1);

alter table public.site_settings enable row level security;

create trigger set_site_settings_updated_at
  before update on public.site_settings
  for each row
  execute function public.set_updated_at();

create policy "Anyone can view site settings"
  on public.site_settings for select
  to anon, authenticated
  using (true);

create policy "Admins can update site settings"
  on public.site_settings for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- Storage bucket for the custom logo upload.
insert into storage.buckets (id, name, public)
values ('site-assets', 'site-assets', true)
on conflict (id) do nothing;

create policy "Public can view site assets"
  on storage.objects for select
  using (bucket_id = 'site-assets');

create policy "Admins can upload site assets"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'site-assets'
    and public.current_user_role() = 'admin'
  );

create policy "Admins can update site assets"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'site-assets'
    and public.current_user_role() = 'admin'
  );

create policy "Admins can delete site assets"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'site-assets'
    and public.current_user_role() = 'admin'
  );
