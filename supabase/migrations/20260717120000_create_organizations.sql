-- Organizations: the tenant boundary. Every profile belongs to exactly one.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

alter table public.organizations enable row level security;

-- Orgs are only ever created by handle_new_user() below (security definer,
-- bypasses RLS as table owner). The only client-facing need is resolving an
-- invite link's slug pre-signup, so anon/authenticated both get read access;
-- there is no insert/update/delete policy for any role.
create policy "Anyone can view organizations"
  on public.organizations for select
  to anon, authenticated
  using (true);

-- Backfill target for any profiles/inventory_items/tasks that predate orgs.
insert into public.organizations (name, slug)
values ('Legacy Organization', 'legacy-organization');

alter table public.profiles
  add column organization_id uuid references public.organizations (id);

update public.profiles
  set organization_id = (select id from public.organizations where slug = 'legacy-organization')
  where organization_id is null;

alter table public.profiles
  alter column organization_id set not null;

-- security definer so RLS policies can look up the caller's org without
-- recursively evaluating profiles' own SELECT policy (mirrors current_user_role()).
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- Rewritten to create-or-join an organization at signup time, based on
-- metadata the client passes through supabase.auth.signUp()'s options.data:
--   - organization_name: creates a new org, caller becomes its 'admin'
--   - invite_organization_id: joins an existing org, caller becomes 'staff'
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_org_name text := new.raw_user_meta_data ->> 'organization_name';
  v_invite_org_id uuid := nullif(new.raw_user_meta_data ->> 'invite_organization_id', '')::uuid;
  v_role public.user_role;
begin
  if v_invite_org_id is not null then
    if not exists (select 1 from public.organizations where id = v_invite_org_id) then
      raise exception 'invalid organization invite';
    end if;
    v_org_id := v_invite_org_id;
    v_role := 'staff';
  elsif v_org_name is not null and length(trim(v_org_name)) > 0 then
    insert into public.organizations (name, slug)
    values (
      v_org_name,
      lower(regexp_replace(v_org_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(new.id::text, 1, 8)
    )
    returning id into v_org_id;
    v_role := 'admin';
  else
    raise exception 'signup requires an organization name or invite link';
  end if;

  insert into public.profiles (id, email, full_name, nickname, organization_id, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'nickname',
    v_org_id,
    v_role
  );
  return new;
end;
$$;

-- Scope profile visibility/management to the caller's own organization.
drop policy "Authenticated users can view all profiles" on public.profiles;

create policy "Users can view profiles in their organization"
  on public.profiles for select
  to authenticated
  using (organization_id = public.current_user_org_id());

drop policy "Admins can update any profile" on public.profiles;

create policy "Admins can update profiles in their organization"
  on public.profiles for update
  to authenticated
  using (public.current_user_role() = 'admin' and organization_id = public.current_user_org_id())
  with check (public.current_user_role() = 'admin' and organization_id = public.current_user_org_id());

drop policy "Admins can delete profiles" on public.profiles;

create policy "Admins can delete profiles in their organization"
  on public.profiles for delete
  to authenticated
  using (public.current_user_role() = 'admin' and organization_id = public.current_user_org_id());

drop policy "Admins can insert profiles" on public.profiles;

create policy "Admins can insert profiles in their organization"
  on public.profiles for insert
  to authenticated
  with check (public.current_user_role() = 'admin' and organization_id = public.current_user_org_id());

-- Cross-org role escalation fix: an admin could previously target any user
-- id in the whole database, not just their own organization's members.
create or replace function public.admin_set_user_role(target_id uuid, new_role public.user_role)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if public.current_user_role() != 'admin' then
    raise exception 'only admins can change user roles';
  end if;

  if (select organization_id from public.profiles where id = target_id) != public.current_user_org_id() then
    raise exception 'cannot change role for a user outside your organization';
  end if;

  update public.profiles set role = new_role where id = target_id;
end;
$$;
