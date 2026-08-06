-- Org-level soft delete with a grace period, plus supporting fixes needed to
-- make deletion (and the more mundane "remove one team member" case) behave
-- sanely rather than surprising an admin with side effects.

-- 1. Soft-delete marker. Deletion is "set deleted_at", not an actual DELETE —
--    the real purge happens on a schedule (see purge_expired_organizations
--    below) after a 30-day grace period, so an accidental click (or a
--    support request to undo) has a recovery window. Recovery today is a
--    manual `update organizations set deleted_at = null where id = ...` —
--    there's no self-service "undo" UI yet.
alter table public.organizations add column deleted_at timestamptz;

-- 2. current_user_org_id() is the single choke point nearly every RLS policy
--    in this schema uses (inventory_items, tasks, profiles, site_settings,
--    inventory_field_options all gate on organization_id = current_user_org_id()).
--    Making it return null once the caller's org is soft-deleted means every
--    one of those policies fails closed automatically, with no need to touch
--    each policy individually.
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = auth.uid() and o.deleted_at is null;
$$;

-- 3. Let an admin flip their own org's deleted_at — no policy at all existed
--    for organizations UPDATE before this (the table was select-only). Scoped
--    to just this one column, same self-service-column-grant pattern as
--    profiles' full_name/nickname/avatar_key.
create policy "Admins can soft-delete their own organization"
  on public.organizations for update
  to authenticated
  using (public.current_user_role() = 'admin' and id = public.current_user_org_id())
  with check (public.current_user_role() = 'admin' and id = public.current_user_org_id());

grant update (deleted_at) on public.organizations to authenticated;

-- 4. tasks.created_by previously cascaded, so removing a team member would
--    silently delete every task they'd ever *created* — not just unassign
--    them, actually destroy the task and its history, even if it was
--    reassigned to someone else long ago. Match assigned_to's behavior:
--    keep the task, just drop the now-dangling reference.
alter table public.tasks drop constraint tasks_created_by_fkey;
alter table public.tasks
  add constraint tasks_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- 5. organization_id FKs on the three tenant-scoped tables never specified an
--    ON DELETE action (defaults to NO ACTION, i.e. blocks the delete). The
--    scheduled purge below needs a single `delete from organizations` to
--    actually cascade through everything rather than erroring.
alter table public.profiles drop constraint profiles_organization_id_fkey;
alter table public.profiles
  add constraint profiles_organization_id_fkey
  foreign key (organization_id) references public.organizations (id) on delete cascade;

alter table public.inventory_items drop constraint inventory_items_organization_id_fkey;
alter table public.inventory_items
  add constraint inventory_items_organization_id_fkey
  foreign key (organization_id) references public.organizations (id) on delete cascade;

alter table public.tasks drop constraint tasks_organization_id_fkey;
alter table public.tasks
  add constraint tasks_organization_id_fkey
  foreign key (organization_id) references public.organizations (id) on delete cascade;

-- Note: this cascades through inventory_items -> inventory_item_images /
-- inventory_item_activity (already on delete cascade from item_id), and
-- profiles -> auth.users has no reverse cascade, so a purged org's members
-- keep their bare auth.users row (they can still authenticate, just with no
-- profile — every RLS policy that reads current_user_role()/
-- current_user_org_id() then fails closed). Fully deleting the auth.users
-- row requires the Supabase Admin API (service role), which the app's
-- client-side anon/authenticated key can't call — out of scope here.

-- 6. Scheduled purge — runs daily, deletes any organization whose grace
--    period has elapsed. security definer + pg_cron so it runs without a
--    request/session context (there is no "current user" for a cron job).
create extension if not exists pg_cron with schema extensions;

create or replace function public.purge_expired_organizations()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  delete from public.organizations
  where deleted_at is not null and deleted_at < now() - interval '30 days';
end;
$$;

select cron.schedule(
  'purge-expired-organizations',
  '0 3 * * *',
  $$select public.purge_expired_organizations();$$
);
