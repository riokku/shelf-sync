-- Admin-approved dropdown values for inventory_items.category / physical_location /
-- digital_location. Those columns stay plain text — this table only constrains what
-- the create/edit UI offers to pick from, so historical values that don't match any
-- current option are never invalidated.
create table public.inventory_field_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  field_name text not null check (field_name in ('category', 'physical_location', 'digital_location')),
  value text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, field_name, value)
);

alter table public.inventory_field_options enable row level security;

create policy "Users can view their organization's field options"
  on public.inventory_field_options for select
  to authenticated
  using (organization_id = public.current_user_org_id());

create policy "Admins can insert field options for their organization"
  on public.inventory_field_options for insert
  to authenticated
  with check (public.current_user_role() = 'admin' and organization_id = public.current_user_org_id());

create policy "Admins can delete field options for their organization"
  on public.inventory_field_options for delete
  to authenticated
  using (public.current_user_role() = 'admin' and organization_id = public.current_user_org_id());
