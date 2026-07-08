-- Profiles: one row per auth.users row, holding app-level role info.
create type public.user_role as enum ('admin', 'manager', 'staff');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  role public.user_role not null default 'staff',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Shared trigger function: keep updated_at current on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- security definer so RLS policies can look up the caller's role without
-- recursively evaluating profiles' own SELECT policy.
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create policy "Authenticated users can view all profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Admins can insert profiles"
  on public.profiles for insert
  to authenticated
  with check (public.current_user_role() = 'admin');

create policy "Admins can update any profile"
  on public.profiles for update
  to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Admins can delete profiles"
  on public.profiles for delete
  to authenticated
  using (public.current_user_role() = 'admin');

-- All signed-in users share one Postgres role (`authenticated`), so a plain
-- column-level GRANT can't tell an admin's UPDATE apart from anyone else's.
-- Lock `role` out of ordinary UPDATEs entirely and only allow changing it
-- through this SECURITY DEFINER function, which checks admin status itself.
revoke update on public.profiles from authenticated;
grant update (email, full_name) on public.profiles to authenticated;

create or replace function public.admin_set_user_role(target_id uuid, new_role public.user_role)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if public.current_user_role() != 'admin' then
    raise exception 'only admins can change user roles';
  end if;

  update public.profiles set role = new_role where id = target_id;
end;
$$;

grant execute on function public.admin_set_user_role(uuid, public.user_role) to authenticated;
