-- Closes a gap flagged (but deliberately left open) when impersonation
-- first shipped: a data change made *during* an impersonation session reads
-- identically to the target's own normal activity in activity_log/
-- inventory_item_activity — the org-wide feed and an item's own timeline
-- have no way to tell the two apart. This tags both at write time.
--
-- A client-supplied flag/header was considered and rejected: nothing stops
-- any authenticated caller from sending a forged "yes, this was via
-- impersonation" (or, worse, "no, it wasn't") signal on an ordinary insert,
-- and an audit trail that trusts client input for its own integrity isn't
-- trustworthy. Instead this is computed entirely server-side, from state
-- only the platform ever writes: auth.uid() inside every RPC in this schema
-- already correctly reflects the *real* calling session's identity
-- regardless of SECURITY DEFINER (that only elevates the executing role's
-- table privileges — auth.uid() is derived from the caller's own JWT
-- claims, unaffected by it), so during an impersonation session it's
-- genuinely the target's own id, indistinguishable from their real activity
-- by uid alone — but impersonation_sessions itself already records exactly
-- when a session is (or was) open for that target. A BEFORE INSERT trigger
-- on each log table checks that directly, so this needed zero changes to
-- any of the many existing call sites (logActivity()/logInventoryItemActivity()
-- and every retirement/task-transfer/member RPC that inserts one of these
-- rows) — one choke point per table, same shape is_locked's own RLS check
-- or current_user_org_id()'s fail-closed logic already are elsewhere in
-- this schema.
--
-- Each trigger function needs SECURITY DEFINER specifically to see
-- impersonation_sessions at all — that table's own SELECT policy is
-- platform-admin-only (add_impersonation_sessions), so an ordinary caller's
-- own RLS-restricted privileges (including the target's own, mid-session)
-- would see zero rows there and silently compute via_impersonation = false
-- unconditionally without this. Always recomputed unconditionally in the
-- trigger, never merely defaulted when null, so nothing a client sends for
-- this column in its own insert payload (this table has no column-scoped
-- INSERT grant restricting it) can matter either way.
alter table public.activity_log add column via_impersonation boolean not null default false;
alter table public.inventory_item_activity add column via_impersonation boolean not null default false;

create or replace function public.mark_activity_log_via_impersonation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.via_impersonation := exists (
    select 1 from public.impersonation_sessions
    where target_user_id = new.actor_id and ended_at is null
  );
  return new;
end;
$$;

create trigger set_activity_log_via_impersonation
  before insert on public.activity_log
  for each row
  execute function public.mark_activity_log_via_impersonation();

create or replace function public.mark_inventory_item_activity_via_impersonation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  new.via_impersonation := exists (
    select 1 from public.impersonation_sessions
    where target_user_id = new.user_id and ended_at is null
  );
  return new;
end;
$$;

create trigger set_inventory_item_activity_via_impersonation
  before insert on public.inventory_item_activity
  for each row
  execute function public.mark_inventory_item_activity_via_impersonation();

-- One-time backfill for rows that already exist — cheap at this data
-- volume, and means the tag is accurate for history too, not just
-- anything logged from here on. Same correlation the trigger itself uses,
-- just applied retroactively via a closed (or still-open) session's own
-- recorded window instead of "is one open right now".
update public.activity_log al
set via_impersonation = true
where exists (
  select 1 from public.impersonation_sessions s
  where s.target_user_id = al.actor_id
    and al.created_at >= s.started_at
    and al.created_at <= coalesce(s.ended_at, now())
);

update public.inventory_item_activity ia
set via_impersonation = true
where exists (
  select 1 from public.impersonation_sessions s
  where s.target_user_id = ia.user_id
    and ia.created_at >= s.started_at
    and ia.created_at <= coalesce(s.ended_at, now())
);
