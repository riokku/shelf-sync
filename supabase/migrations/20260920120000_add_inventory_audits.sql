-- Physical inventory audits ("cycle counts"): reconcile what the system
-- thinks is in stock against what's actually on the shelf. An admin/manager
-- starts an audit (org-wide, or scoped to one physical_location), which
-- snapshots every in-scope item's current quantity_remaining as its
-- expected value; any approved org member can then submit what they
-- actually counted; an admin/manager reviews the resulting discrepancies
-- and applies corrections (or leaves them as a permanent record).
--
-- inventory_audits is an org-level table (its own organization_id), not a
-- per-item child — same shape broadcasts (20260913120000_add_broadcasts.sql)
-- already established for an org-wide event that isn't scoped to one item,
-- rather than the containers/discards/orders/reservations shape (all
-- children of a single item via item_id). inventory_audit_counts is a
-- child of the audit (audit_id, cascading), one row per item snapshotted at
-- start time — pre-populating every in-scope item up front (rather than
-- only recording rows for items someone actually counts) is what makes
-- "38 of 50 counted" and "this item was never found" possible at all.
--
-- Scope at start time is every item with status != 'retired' (active *and*
-- retirement_pending — a retirement can only be requested at zero
-- remaining, so finding stock on a pending-retirement item during an audit
-- is itself a meaningful discrepancy, not noise to exclude), optionally
-- filtered to one physical_location (a plain text match against the same
-- admin-curated list inventory_items.physical_location itself already
-- draws from — not FK-enforced, same "curated list is a UI suggestion, not
-- a DB constraint" precedent that column already has).
--
-- expected_quantity is a point-in-time snapshot, same "outlive what it
-- references" shape inventory_item_orders.supplier_name already
-- establishes — applying a discrepancy later shifts the item's *live*
-- value by the counted-vs-expected delta rather than overwriting it
-- absolutely, so other legitimate activity on the item during the audit
-- window (checkouts, discards, other edits) isn't silently erased. See
-- apply_audit_count() below for the exact formula.
create table public.inventory_audits (
  id uuid primary key default gen_random_uuid(),
  -- Same default-to-caller's-org technique activity_log/feedback/broadcasts
  -- already use — moot in practice since start_inventory_audit() always
  -- sets it explicitly, kept for consistency with every other org-scoped
  -- table in this schema.
  organization_id uuid not null references public.organizations (id) on delete cascade
    default public.current_user_org_id(),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'cancelled')),
  physical_location text,
  note text,
  started_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz not null default now(),
  completed_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancelled_at timestamptz
);

create index inventory_audits_organization_id_idx on public.inventory_audits (organization_id);

alter table public.inventory_audits enable row level security;

create policy "Authenticated users can view their organization's inventory audits"
  on public.inventory_audits for select
  to authenticated
  using (organization_id = public.current_user_org_id());

-- No insert/update/delete policy for `authenticated` at all — every write,
-- including creation, goes through the RPCs below. Starting one has to
-- fan out a bulk snapshot insert into inventory_audit_counts as one atomic
-- unit, which a plain RLS `with check` can't express, and every later
-- status transition is otherwise a permanent audit trail.

create table public.inventory_audit_counts (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.inventory_audits (id) on delete cascade,
  item_id uuid not null references public.inventory_items (id) on delete cascade,
  expected_quantity integer not null,
  counted_quantity integer check (counted_quantity is null or counted_quantity >= 0),
  counted_by uuid references public.profiles (id) on delete set null,
  counted_at timestamptz,
  note text,
  applied_by uuid references public.profiles (id) on delete set null,
  applied_at timestamptz,
  unique (audit_id, item_id)
);

create index inventory_audit_counts_audit_id_idx on public.inventory_audit_counts (audit_id);
create index inventory_audit_counts_item_id_idx on public.inventory_audit_counts (item_id);

alter table public.inventory_audit_counts enable row level security;

-- Joined through to the parent audit for org scoping — the "day-one-correct"
-- join shape inventory_item_discards/inventory_item_orders already
-- established, not the no-join shape inventory_item_containers originally
-- shipped with and had to retrofit later.
create policy "Authenticated users can view inventory audit counts"
  on public.inventory_audit_counts for select
  to authenticated
  using (
    exists (
      select 1 from public.inventory_audits a
      where a.id = inventory_audit_counts.audit_id
        and a.organization_id = public.current_user_org_id()
    )
  );

-- No insert/update/delete policy for `authenticated` at all — snapshot rows
-- are bulk-inserted by start_inventory_audit(), counted by
-- submit_audit_count(), and reconciled by apply_audit_count(), all below.

-- Widen activity_log.entity_type (add_activity_log.sql, already widened
-- once for 'broadcast' by add_broadcasts.sql) to cover this new entity —
-- a check constraint, can't be altered in place, so drop and recreate.
alter table public.activity_log drop constraint activity_log_entity_type_check;
alter table public.activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('inventory_item', 'task', 'member', 'broadcast', 'inventory_audit'));

-- Live updates without polling — same two-part mechanism
-- enable_realtime_for_inventory_and_tasks.sql/widen_realtime_to_child_tables.sql
-- already established. REPLICA IDENTITY FULL is applied to both even though
-- neither has a delete path today, since inventory_audit_counts' own
-- join-based RLS SELECT policy needs audit_id present on a DELETE's old-row
-- payload to evaluate at all — default (PK-only) replica identity wouldn't
-- include it.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_audits'
  ) then
    alter publication supabase_realtime add table public.inventory_audits;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_audit_counts'
  ) then
    alter publication supabase_realtime add table public.inventory_audit_counts;
  end if;
end $$;

alter table public.inventory_audits replica identity full;
alter table public.inventory_audit_counts replica identity full;

-- The only way an audit is ever started: admin/manager only, snapshots
-- every in-scope item's current quantity_remaining as expected_quantity in
-- one bulk insert...select (same fan-out shape create_broadcast()'s own
-- notifications insert already demonstrates). Raises if nothing matched the
-- scope, rather than silently creating an empty, pointless audit — the
-- whole function rolls back automatically since a `raise exception`
-- unwinds everything already done in this call. Parameters are p_-prefixed
-- since physical_location/note are also real column names on the table
-- this function writes to (same reasoning create_broadcast()'s own
-- p_title/p_message have).
create or replace function public.start_inventory_audit(
  p_physical_location text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_id uuid;
  v_location text;
  v_item_count integer;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can start an inventory audit';
  end if;

  v_org_id := public.current_user_org_id();
  if v_org_id is null then
    raise exception 'organization not found';
  end if;

  v_location := nullif(trim(p_physical_location), '');

  insert into public.inventory_audits (organization_id, physical_location, note, started_by)
    values (v_org_id, v_location, nullif(trim(p_note), ''), auth.uid())
    returning id into v_id;

  insert into public.inventory_audit_counts (audit_id, item_id, expected_quantity)
    select v_id, i.id, i.quantity_remaining
    from public.inventory_items i
    where i.organization_id = v_org_id
      and i.status != 'retired'
      and (v_location is null or i.physical_location = v_location);

  select count(*) into v_item_count from public.inventory_audit_counts where audit_id = v_id;

  if v_item_count = 0 then
    raise exception 'no items found in scope for this audit';
  end if;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_org_id, auth.uid(), 'inventory_audit', v_id,
      format('Started an inventory audit (%s) — %s item%s to count',
        coalesce(v_location, 'whole organization'), v_item_count, case when v_item_count = 1 then '' else 's' end)
    );

  return v_id;
end;
$$;

grant execute on function public.start_inventory_audit(text, text) to authenticated;

-- Any approved member of the audit's own org can submit (or re-submit, to
-- fix a mistake) a count while the audit is still in_progress — no role
-- check beyond that, same staff-level trust
-- widen_reservation_access_to_staff.sql already established for physical
-- warehouse work. current_user_org_id() being non-null alone already
-- guarantees an approved member of an active org, so no separate role
-- check is needed the way every admin/manager-gated RPC in this file has.
create or replace function public.submit_audit_count(
  audit_count_id uuid,
  p_counted_quantity integer,
  p_note text default null
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_count public.inventory_audit_counts;
  v_audit public.inventory_audits;
  v_item_name text;
begin
  select * into v_count from public.inventory_audit_counts where id = audit_count_id;
  if v_count is null then
    raise exception 'audit count row not found';
  end if;

  select * into v_audit from public.inventory_audits where id = v_count.audit_id;
  if v_audit is null or public.current_user_org_id() is null or v_audit.organization_id != public.current_user_org_id() then
    raise exception 'audit not found';
  end if;

  if v_audit.status != 'in_progress' then
    raise exception 'this audit is no longer in progress';
  end if;

  if p_counted_quantity < 0 then
    raise exception 'counted quantity cannot be negative';
  end if;

  update public.inventory_audit_counts
    set counted_quantity = p_counted_quantity, counted_by = auth.uid(), counted_at = now(),
      note = nullif(trim(p_note), '')
    where id = audit_count_id;

  select name into v_item_name from public.inventory_items where id = v_count.item_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (
      v_count.item_id, auth.uid(),
      format('Counted %s units during inventory audit (expected %s)', p_counted_quantity, v_count.expected_quantity)
    );

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_audit.organization_id, auth.uid(), 'inventory_item', v_count.item_id,
      format('%s: Counted %s units during inventory audit (expected %s)',
        coalesce(v_item_name, 'Item'), p_counted_quantity, v_count.expected_quantity)
    );
end;
$$;

grant execute on function public.submit_audit_count(uuid, integer, text) to authenticated;

-- Admin/manager only — reconciling the system of record is a more
-- consequential action than recording what you observed, the same trust
-- split approve_item_retirement (admin/manager) vs. discarding stock (any
-- authenticated user) already draws elsewhere in this schema. Shifts the
-- item's *live* quantity_remaining/quantity_total by the counted-vs-
-- expected delta rather than overwriting them absolutely — see this
-- table's own top-of-file comment for why. Refuses a container-tracked
-- item outright (mirroring receive_inventory_item_order()'s own
-- has-containers branch) since there's no reliable way to know which box
-- was miscounted; that item's boxes still have to be corrected by hand.
create or replace function public.apply_audit_count(audit_count_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_count public.inventory_audit_counts;
  v_audit public.inventory_audits;
  v_item public.inventory_items;
  v_has_containers boolean;
  v_delta integer;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can apply an audit count';
  end if;

  select * into v_count from public.inventory_audit_counts where id = audit_count_id;
  if v_count is null then
    raise exception 'audit count row not found';
  end if;

  select * into v_audit from public.inventory_audits where id = v_count.audit_id;
  if v_audit is null or public.current_user_org_id() is null or v_audit.organization_id != public.current_user_org_id() then
    raise exception 'audit not found';
  end if;

  if v_audit.status != 'in_progress' then
    raise exception 'this audit is no longer in progress';
  end if;

  if v_count.counted_quantity is null then
    raise exception 'this item has not been counted yet';
  end if;

  select * into v_item from public.inventory_items where id = v_count.item_id;
  if v_item is null then
    raise exception 'item not found';
  end if;

  select exists (
    select 1 from public.inventory_item_containers where item_id = v_item.id
  ) into v_has_containers;

  if v_has_containers then
    raise exception 'this item is tracked by container — adjust its boxes directly instead';
  end if;

  v_delta := v_count.counted_quantity - v_count.expected_quantity;

  update public.inventory_items
    set quantity_remaining = quantity_remaining + v_delta,
      quantity_total = quantity_total + v_delta
    where id = v_item.id;

  update public.inventory_audit_counts
    set applied_by = auth.uid(), applied_at = now()
    where id = audit_count_id;

  insert into public.inventory_item_activity (item_id, user_id, message)
    values (
      v_item.id, auth.uid(),
      format('Applied inventory audit count: expected %s, counted %s (adjusted by %s%s)',
        v_count.expected_quantity, v_count.counted_quantity,
        case when v_delta > 0 then '+' else '' end, v_delta)
    );

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (
      v_item.organization_id, auth.uid(), 'inventory_item', v_item.id,
      format('%s: Applied inventory audit count (expected %s, counted %s)',
        v_item.name, v_count.expected_quantity, v_count.counted_quantity)
    );
end;
$$;

grant execute on function public.apply_audit_count(uuid) to authenticated;

-- Finalizes the audit's own record — deliberately does NOT auto-apply
-- whatever discrepancies are still unapplied (a manager might deliberately
-- choose not to trust a particular count); those stay visible in the
-- completed audit's history rather than being forced through. Applying and
-- completing are independent actions, see this table's own top-of-file
-- comment.
create or replace function public.complete_inventory_audit(audit_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_audit public.inventory_audits;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can complete an inventory audit';
  end if;

  select * into v_audit from public.inventory_audits where id = audit_id;
  if v_audit is null or public.current_user_org_id() is null or v_audit.organization_id != public.current_user_org_id() then
    raise exception 'audit not found';
  end if;

  if v_audit.status != 'in_progress' then
    raise exception 'this audit is not in progress';
  end if;

  update public.inventory_audits
    set status = 'completed', completed_by = auth.uid(), completed_at = now()
    where id = audit_id;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_audit.organization_id, auth.uid(), 'inventory_audit', audit_id, 'Completed an inventory audit');
end;
$$;

grant execute on function public.complete_inventory_audit(uuid) to authenticated;

create or replace function public.cancel_inventory_audit(audit_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_audit public.inventory_audits;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can cancel an inventory audit';
  end if;

  select * into v_audit from public.inventory_audits where id = audit_id;
  if v_audit is null or public.current_user_org_id() is null or v_audit.organization_id != public.current_user_org_id() then
    raise exception 'audit not found';
  end if;

  if v_audit.status != 'in_progress' then
    raise exception 'this audit is not in progress';
  end if;

  update public.inventory_audits
    set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now()
    where id = audit_id;

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_audit.organization_id, auth.uid(), 'inventory_audit', audit_id, 'Cancelled an inventory audit');
end;
$$;

grant execute on function public.cancel_inventory_audit(uuid) to authenticated;
