-- Recurring inventory audits: today an audit is always one-off and manually
-- started (start_inventory_audit()). This lets an admin/manager set up a
-- weekly/monthly/quarterly cadence (org-wide, or scoped to one
-- physical_location, same as a one-off audit) that auto-starts the real
-- audit on schedule via pg_cron. Once the next occurrence is within 7 days,
-- it shows as "Upcoming" to every approved member (manage/audits) — visible,
-- but its scope can no longer be edited; pausing/cancelling the whole series
-- stays allowed regardless, since that's "skip/stop it," not "change what it
-- does."
--
-- Org-level table (its own organization_id), same shape inventory_audits
-- itself uses — not a child-via-item_id table, since a schedule isn't scoped
-- to one item. next_occurrence_date is the one mutable piece of state a
-- schedule carries between runs (advanced by run_scheduled_inventory_audits()
-- below each time it fires); active is a plain reversible pause/resume flag,
-- not a separate cancelled state — there's no meaningful difference between
-- "paused indefinitely" and "cancelled" for a recurring series, and keeping
-- one boolean means one toggle RPC covers both instead of two nearly-
-- identical ones.
create table public.inventory_audit_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade
    default public.current_user_org_id(),
  physical_location text,
  frequency text not null check (frequency in ('weekly', 'monthly', 'quarterly')),
  note text,
  next_occurrence_date date not null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index inventory_audit_schedules_organization_id_idx on public.inventory_audit_schedules (organization_id);
-- Partial index matching run_scheduled_inventory_audits()'s own WHERE clause
-- exactly, so the daily sweep doesn't scan every schedule in every org.
create index inventory_audit_schedules_due_idx on public.inventory_audit_schedules (next_occurrence_date) where active;

alter table public.inventory_audit_schedules enable row level security;

-- Same open-to-any-approved-member visibility real audits already have via
-- inventory_audits' own SELECT policy — "upcoming" needs to be seen org-wide,
-- not just by whoever manages schedules.
create policy "Authenticated users can view their organization's audit schedules"
  on public.inventory_audit_schedules for select
  to authenticated
  using (organization_id = public.current_user_org_id());

-- No insert/update/delete policy for `authenticated` at all — same shape
-- inventory_audits itself uses. Every write goes through the RPCs below,
-- which is what makes the "locked while upcoming" rule and the cron's own
-- system-triggered inserts possible in the first place.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_audit_schedules'
  ) then
    alter publication supabase_realtime add table public.inventory_audit_schedules;
  end if;
end $$;

alter table public.inventory_audit_schedules replica identity full;

-- Traces a schedule-spawned audit back to the schedule that created it — on
-- delete set null (not cascade), same "a log/record should outlive the
-- thing that produced it" reasoning inventory_item_orders.supplier_id
-- already establishes, so deleting a schedule row (this schema never
-- actually does, but the FK shouldn't assume that) wouldn't take a real,
-- already-run audit down with it.
alter table public.inventory_audits
  add column schedule_id uuid references public.inventory_audit_schedules (id) on delete set null;

-- Admin/manager only, same trust level start_inventory_audit() already
-- established for starting one manually. Validates frequency is one of the
-- three supported cadences and that the first occurrence isn't already in
-- the past, then inserts — nothing to snapshot yet, unlike starting a real
-- audit, since this just schedules a future one.
create or replace function public.create_audit_schedule(
  p_physical_location text default null,
  p_frequency text default null,
  p_note text default null,
  p_first_occurrence_date date default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_id uuid;
  v_location text;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can create a recurring audit schedule';
  end if;

  v_org_id := public.current_user_org_id();
  if v_org_id is null then
    raise exception 'organization not found';
  end if;

  if p_frequency is null or p_frequency not in ('weekly', 'monthly', 'quarterly') then
    raise exception 'frequency must be one of: weekly, monthly, quarterly';
  end if;

  if p_first_occurrence_date is null or p_first_occurrence_date < current_date then
    raise exception 'first occurrence date must be today or later';
  end if;

  v_location := nullif(trim(p_physical_location), '');

  insert into public.inventory_audit_schedules
      (organization_id, physical_location, frequency, note, next_occurrence_date, created_by)
    values (v_org_id, v_location, p_frequency, nullif(trim(p_note), ''), p_first_occurrence_date, auth.uid())
    returning id into v_id;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_org_id, auth.uid(), 'inventory_audit', v_id,
      format('Set up a %s recurring audit (%s), starting %s', p_frequency, coalesce(v_location, 'whole organization'), p_first_occurrence_date)
    );

  return v_id;
end;
$$;

grant execute on function public.create_audit_schedule(text, text, text, date) to authenticated;

-- Admin/manager only. Refuses once the schedule's own next_occurrence_date
-- is within a week — the "upcoming, locked" window described above — so a
-- last-minute scope change can't land moments before it's due to fire.
-- set_audit_schedule_active() below deliberately has no equivalent check.
create or replace function public.update_audit_schedule(
  p_schedule_id uuid,
  p_physical_location text default null,
  p_frequency text default null,
  p_note text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_schedule public.inventory_audit_schedules;
  v_location text;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can edit a recurring audit schedule';
  end if;

  select * into v_schedule from public.inventory_audit_schedules where id = p_schedule_id;
  if v_schedule is null or public.current_user_org_id() is null or v_schedule.organization_id != public.current_user_org_id() then
    raise exception 'audit schedule not found';
  end if;

  if v_schedule.next_occurrence_date - current_date <= 7 then
    raise exception 'this schedule starts within a week and can no longer be edited — pause or cancel it instead';
  end if;

  if p_frequency is null or p_frequency not in ('weekly', 'monthly', 'quarterly') then
    raise exception 'frequency must be one of: weekly, monthly, quarterly';
  end if;

  v_location := nullif(trim(p_physical_location), '');

  update public.inventory_audit_schedules
    set physical_location = v_location, frequency = p_frequency, note = nullif(trim(p_note), '')
    where id = p_schedule_id;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_schedule.organization_id, auth.uid(), 'inventory_audit', p_schedule_id,
      format('Updated a recurring audit schedule (%s)', coalesce(v_location, 'whole organization'))
    );
end;
$$;

grant execute on function public.update_audit_schedule(uuid, text, text, text) to authenticated;

-- Admin/manager only, but deliberately NOT subject to update_audit_schedule()'s
-- own 7-day lock above — pausing or resuming the whole series ("we're closed
-- that week, skip it") stays allowed right up to the day it fires; only
-- changing what it actually does (location/frequency/note) is locked.
create or replace function public.set_audit_schedule_active(
  p_schedule_id uuid,
  p_active boolean
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_schedule public.inventory_audit_schedules;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can pause or resume a recurring audit schedule';
  end if;

  select * into v_schedule from public.inventory_audit_schedules where id = p_schedule_id;
  if v_schedule is null or public.current_user_org_id() is null or v_schedule.organization_id != public.current_user_org_id() then
    raise exception 'audit schedule not found';
  end if;

  update public.inventory_audit_schedules set active = p_active where id = p_schedule_id;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_schedule.organization_id, auth.uid(), 'inventory_audit', p_schedule_id,
      case when p_active then 'Resumed a recurring audit schedule' else 'Paused a recurring audit schedule' end
    );
end;
$$;

grant execute on function public.set_audit_schedule_active(uuid, boolean) to authenticated;

-- Daily sweep, SECURITY DEFINER + pg_cron, same shape
-- notify_overdue_checkouts()/purge_expired_organizations() already
-- established for a scheduled job with no request/session context — there's
-- no auth.uid() here, so a spawned audit is attributed to the schedule's own
-- created_by instead. Reimplements start_inventory_audit()'s own
-- snapshot-insert logic directly rather than calling that RPC (which is
-- role/session-gated and always attributes to auth.uid()).
--
-- Each schedule's own attempt runs inside its own begin/exception block so
-- one org's failure (most likely: nothing left in scope for that location)
-- can't abort the rest of the run for every other org's schedule — same
-- "one bad row can't block the batch" reasoning notify_overdue_checkouts()'s
-- own per-item loop already relies on. next_occurrence_date always advances
-- afterward, success or failure, so a schedule with a temporarily-empty
-- scope retries at its *next* real occurrence instead of failing (and
-- logging a skip) every single day forever.
create or replace function public.run_scheduled_inventory_audits()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_schedule record;
  v_location text;
  v_audit_id uuid;
  v_item_count integer;
begin
  for v_schedule in
    select * from public.inventory_audit_schedules
    where active and next_occurrence_date <= current_date
  loop
    v_location := nullif(trim(v_schedule.physical_location), '');
    v_audit_id := null;

    begin
      insert into public.inventory_audits (organization_id, physical_location, note, started_by, schedule_id)
        values (v_schedule.organization_id, v_location, v_schedule.note, v_schedule.created_by, v_schedule.id)
        returning id into v_audit_id;

      insert into public.inventory_audit_counts (audit_id, item_id, expected_quantity)
        select v_audit_id, i.id, i.quantity_remaining
        from public.inventory_items i
        where i.organization_id = v_schedule.organization_id
          and i.status != 'retired'
          and (v_location is null or i.physical_location = v_location);

      select count(*) into v_item_count from public.inventory_audit_counts where audit_id = v_audit_id;

      if v_item_count = 0 then
        raise exception 'no items in scope';
      end if;

      insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
        values (
          v_schedule.organization_id, v_schedule.created_by, 'inventory_audit', v_audit_id,
          format('Started a recurring inventory audit (%s) — %s item%s to count',
            coalesce(v_location, 'whole organization'), v_item_count, case when v_item_count = 1 then '' else 's' end)
        );
    exception when others then
      -- Rolls back whatever this schedule's own attempt did so far (the
      -- audit-and-counts insert, if it got that far) via plpgsql's implicit
      -- subtransaction, then records why this occurrence was skipped rather
      -- than silently losing the failure.
      insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
        values (
          v_schedule.organization_id, v_schedule.created_by, 'inventory_audit', v_schedule.id,
          format('Skipped a recurring inventory audit (%s): %s', coalesce(v_location, 'whole organization'), sqlerrm)
        );
    end;

    update public.inventory_audit_schedules
      set next_occurrence_date = (
        case v_schedule.frequency
          when 'weekly' then v_schedule.next_occurrence_date + interval '7 days'
          when 'monthly' then v_schedule.next_occurrence_date + interval '1 month'
          else v_schedule.next_occurrence_date + interval '3 months'
        end
      )::date
      where id = v_schedule.id;
  end loop;
end;
$$;

select cron.schedule(
  'run-scheduled-inventory-audits',
  '0 6 * * *',
  $$select public.run_scheduled_inventory_audits();$$
);
