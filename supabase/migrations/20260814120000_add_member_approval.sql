-- Admin approval for org join requests: joining via an invite link
-- (?org=<slug>) used to grant full staff access the instant signup
-- succeeded. Now it creates a pending request instead — an admin must
-- approve it before the new profile counts as a real member. Modeled on the
-- inventory retirement feature's request/approve shape
-- (20260813120000_add_inventory_item_retirement.sql) and on profiles.role's
-- own precedent for "this column can't be trusted to a plain column-grant,
-- it needs a SECURITY DEFINER RPC" (admin_set_user_role in
-- create_profiles.sql).
create type public.membership_status as enum ('pending', 'approved');

-- Default 'approved' backfills every existing row (and any future direct
-- insert) so no currently-active user is retroactively locked out.
alter table public.profiles
  add column membership_status public.membership_status not null default 'approved';

-- Deliberately NOT added to the existing
-- `grant update (email, full_name, nickname, avatar_key)` column list —
-- same reasoning as role: "Users can update their own profile" (auth.uid()
-- = id, no role check) would otherwise let a pending user just approve
-- themselves. Stays settable only via admin_approve_member() below, or row
-- deletion for deny (ManageTeamComponent.removeMember()'s existing
-- mechanism, already admin-only via the DELETE policy — reused as-is, no
-- new RPC needed for that side).

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
  v_membership_status public.membership_status;
begin
  if v_invite_org_id is not null then
    if not exists (select 1 from public.organizations where id = v_invite_org_id) then
      raise exception 'invalid organization invite';
    end if;
    v_org_id := v_invite_org_id;
    v_role := 'staff';
    v_membership_status := 'pending';
  elsif v_org_name is not null and length(trim(v_org_name)) > 0 then
    insert into public.organizations (name, slug)
    values (
      v_org_name,
      lower(regexp_replace(v_org_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(new.id::text, 1, 8)
    )
    returning id into v_org_id;
    -- Founding admin — no one else exists yet to approve them.
    v_role := 'admin';
    v_membership_status := 'approved';
  else
    raise exception 'signup requires an organization name or invite link';
  end if;

  insert into public.profiles (id, email, full_name, nickname, organization_id, role, membership_status)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'nickname',
    v_org_id,
    v_role,
    v_membership_status
  );
  return new;
end;
$$;

-- The crux of the enforcement: every existing RLS policy across
-- inventory_items, tasks, inventory_item_images, inventory_item_activity,
-- and site_settings already gates on organization_id = current_user_org_id().
-- A pending caller now gets NULL back here, so every one of those checks
-- fails closed automatically — no other table's policies need to change.
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select organization_id from public.profiles
  where id = auth.uid() and membership_status = 'approved';
$$;

-- Additive alongside the existing org-scoped SELECT policy. Required
-- because the change above means a pending user's own current_user_org_id()
-- now returns NULL too — without this they couldn't even read their own
-- profile row to discover they're pending.
create policy "Users can always view their own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create or replace function public.admin_approve_member(target_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_target public.profiles;
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

  update public.profiles set membership_status = 'approved' where id = target_id;
end;
$$;

grant execute on function public.admin_approve_member(uuid) to authenticated;
