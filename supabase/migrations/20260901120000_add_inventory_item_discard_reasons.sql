-- Structured, admin-curated discard reasons: DiscardModalComponent's reason
-- field becomes a multi-select drawing from this list instead of free text,
-- so manage/reports' "Top reasons" breakdown groups on a real controlled
-- vocabulary rather than however differently two people happened to phrase
-- the same thing in a text box.
--
-- Reuses inventory_field_options rather than a new dedicated table — same
-- admin-curated-list shape category/physical_location already have, just a
-- new field_name. A check constraint can't be altered in place (see
-- add_more_avatar_presets' own note), so this drops and recreates it.
alter table public.inventory_field_options drop constraint inventory_field_options_field_name_check;
alter table public.inventory_field_options add constraint inventory_field_options_field_name_check
  check (field_name in ('category', 'physical_location', 'digital_location', 'discard_reason'));

-- inventory_item_discards.reason becomes an array — a discard can have more
-- than one reason selected at once (e.g. "Water damage" and "Wear and
-- tear"), and each one should count toward its own total in manage/reports'
-- "Top reasons" breakdown rather than the combination becoming its own
-- distinct bucket. `using array[reason]` preserves every row already
-- logged under the previous single-reason shape as a one-element array.
alter table public.inventory_item_discards
  alter column reason type text[] using array[reason],
  add constraint inventory_item_discards_reason_not_empty check (cardinality(reason) > 0);

-- Seeds a sensible starting list for every organization that exists today —
-- without this, discarding stock (previously always possible via free text)
-- would suddenly require an admin to first visit Settings > Data and add
-- options before anyone could discard anything at all. `on conflict do
-- nothing` against the table's own (organization_id, field_name, value)
-- uniqueness in case this is ever re-run.
insert into public.inventory_field_options (organization_id, field_name, value)
select o.id, 'discard_reason', reason
from public.organizations o
cross join unnest(array['Damaged', 'Lost or missing', 'Expired', 'Wear and tear', 'Other']) as reason
on conflict (organization_id, field_name, value) do nothing;

-- New organizations get the same starting list going forward. Diffed
-- against the previous version of this function
-- (20260820130000_add_activity_log.sql's, the most recent at the time)
-- before adding the insert, per this repo's own "diff against the previous
-- version" lesson (see fix_task_transfer_org_null_check's own note on the
-- same pattern) — everything else here is unchanged from that version.
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

    insert into public.inventory_field_options (organization_id, field_name, value)
      select v_org_id, 'discard_reason', reason
      from unnest(array['Damaged', 'Lost or missing', 'Expired', 'Wear and tear', 'Other']) as reason;
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

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_org_id,
      new.id,
      'member',
      new.id,
      public.profile_display_name(new.id) || case when v_membership_status = 'approved'
        then ' joined as the founding admin'
        else ' joined the organization'
      end
    );

  return new;
end;
$$;
