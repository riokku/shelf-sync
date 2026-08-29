-- Org-wide "Broadcast" announcements: an admin/manager writes a title +
-- message, optionally referencing specific team members and/or inventory
-- items, and it's posted to every approved member of the org at once —
-- backs a new /broadcasts page plus a new in-app notification kind (the
-- notification bell already covers "seen it or not," so this feature stays
-- in-app only, no email — see the four existing kinds in add_notifications.sql
-- for the email-backed precedent this deliberately doesn't extend).
--
-- Same overall shape as inventory_item_reservations
-- (20260903120000_add_inventory_item_reservations.sql): no insert grant for
-- `authenticated` at all, since creating a broadcast has to fan out to two
-- other tables (broadcast_references, notifications) as one atomic unit,
-- which a plain RLS `with check` can't express — every creation goes
-- through create_broadcast() below instead, admin/manager gated the same
-- way create_reservation() is. Unlike reservations, an author can edit or
-- delete their own post afterward (a typo shouldn't need a follow-up
-- broadcast to fix), so update/delete are plain RLS scoped to
-- created_by = auth.uid() rather than RPC-only — no cross-table fan-out
-- needed for either of those.
create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  -- Same default-to-caller's-org technique activity_log/feedback already
  -- use — moot here in practice since every insert actually goes through
  -- create_broadcast() (which sets it explicitly), but kept for consistency
  -- with every other org-scoped table in this schema.
  organization_id uuid not null references public.organizations (id) on delete cascade
    default public.current_user_org_id(),
  title text not null check (length(trim(title)) > 0),
  message text not null check (length(trim(message)) > 0),
  -- on delete set null (not cascade) — a broadcast should outlive its
  -- author being later removed from the org, same reasoning
  -- inventory_item_activity/activity_log's own actor columns already use.
  -- Note this also means an orphaned broadcast (author removed) becomes
  -- permanently uneditable/undeletable, since the UPDATE/DELETE policies
  -- below match on created_by = auth.uid() and null never matches — an
  -- acceptable, precedent-consistent edge case (an orphaned feedback row
  -- has the same fate, just with no owner-editing story to begin with).
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index broadcasts_organization_id_created_at_idx on public.broadcasts (organization_id, created_at desc);

create trigger set_broadcasts_updated_at
  before update on public.broadcasts
  for each row
  execute function public.set_updated_at();

alter table public.broadcasts enable row level security;

create policy "Authenticated users can view their organization's broadcasts"
  on public.broadcasts for select
  to authenticated
  using (organization_id = public.current_user_org_id());

-- No insert policy — see this table's own top-of-file comment. Only
-- title/message are ever meant to change client-side (an editing author
-- fixing their own post) — organization_id/created_by/created_at stay
-- fixed for the row's lifetime, same column-scoped-grant shape
-- add_inventory_item_retirement established for inventory_items.
revoke update on public.broadcasts from authenticated;
grant update (title, message) on public.broadcasts to authenticated;

create policy "Authors can update their own broadcasts"
  on public.broadcasts for update
  to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy "Authors can delete their own broadcasts"
  on public.broadcasts for delete
  to authenticated
  using (created_by = auth.uid());

-- Optional references to specific team members and/or inventory items a
-- broadcast is about (e.g. "new items in stock" pointing at those items, or
-- "welcome our new hires" pointing at those profiles) — a polymorphic child
-- table (no organization_id of its own; org isolation comes from the
-- broadcast_id join, same shape inventory_item_containers/orders/discards
-- already use) rather than two uuid[] columns on broadcasts itself, so each
-- reference keeps a real FK (and cascades away cleanly if the referenced
-- member/item is later removed) instead of an unenforced array of ids.
create table public.broadcast_references (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  reference_type text not null check (reference_type in ('member', 'inventory_item')),
  member_id uuid references public.profiles (id) on delete cascade,
  item_id uuid references public.inventory_items (id) on delete cascade,
  check (
    (reference_type = 'member' and member_id is not null and item_id is null) or
    (reference_type = 'inventory_item' and item_id is not null and member_id is null)
  )
);

create index broadcast_references_broadcast_id_idx on public.broadcast_references (broadcast_id);

alter table public.broadcast_references enable row level security;

create policy "Authenticated users can view broadcast references"
  on public.broadcast_references for select
  to authenticated
  using (
    exists (
      select 1 from public.broadcasts b
      where b.id = broadcast_references.broadcast_id
        and b.organization_id = public.current_user_org_id()
    )
  );

-- Direct client insert/delete (not RPC-only) — unlike creation, editing an
-- existing broadcast's references is a single-table concern (add/remove a
-- row here, nothing else has to change alongside it), scoped to whoever
-- owns the parent broadcast. No update policy: changing a reference is a
-- delete-then-insert, same convention inventory_item_images' add/remove
-- flow already uses rather than updating a row in place.
create policy "Authors can add references to their own broadcasts"
  on public.broadcast_references for insert
  to authenticated
  with check (
    exists (
      select 1 from public.broadcasts b
      where b.id = broadcast_references.broadcast_id
        and b.created_by = auth.uid()
    )
  );

create policy "Authors can remove references from their own broadcasts"
  on public.broadcast_references for delete
  to authenticated
  using (
    exists (
      select 1 from public.broadcasts b
      where b.id = broadcast_references.broadcast_id
        and b.created_by = auth.uid()
    )
  );

-- Widen notifications.kind (add_notifications.sql) and activity_log.entity_type
-- (add_activity_log.sql) to cover this new event/entity — both check
-- constraints, can't be altered in place (see add_more_avatar_presets' own
-- note), so drop and recreate.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('task_assigned', 'task_transfer', 'retirement_request', 'join_request', 'broadcast'));

alter table public.activity_log drop constraint activity_log_entity_type_check;
alter table public.activity_log add constraint activity_log_entity_type_check
  check (entity_type in ('inventory_item', 'task', 'member', 'broadcast'));

-- Live updates without polling — same two-part mechanism
-- enable_realtime_for_inventory_and_tasks.sql established. broadcast_references
-- deliberately isn't added here — every reference row is written as part of
-- the same create_broadcast() call that writes the parent row (or, on an
-- edit, alongside a title/message update that already bumps
-- broadcasts.updated_at via the trigger above), so subscribing to
-- broadcasts alone is enough to notice either kind of change, the same
-- reasoning inventory_items' own subscription already covers a container
-- edit re-deriving that row's own quantity columns.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'broadcasts'
  ) then
    alter publication supabase_realtime add table public.broadcasts;
  end if;
end $$;

alter table public.broadcasts replica identity full;

-- The only way a broadcast is ever created: admin/manager only (mirroring
-- create_reservation()'s own role check), fans out to broadcast_references,
-- one notifications row per other approved org member (kind = 'broadcast',
-- excluding the poster themselves — they don't need to be told about their
-- own post), and an activity_log entry, all as one atomic unit. Parameters
-- are p_-prefixed (matching log_client_error()/get_item_upcoming_reservations()'s
-- own convention) specifically because `title`/`message` are also real
-- column names on the table this function writes to — see create_reservation()'s
-- own `create_reservation.item_id`-qualified query for the same shadowing
-- concern this sidesteps instead.
create or replace function public.create_broadcast(
  p_title text,
  p_message text,
  p_member_ids uuid[] default '{}',
  p_item_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
  v_id uuid;
begin
  if public.current_user_role() not in ('admin', 'manager') then
    raise exception 'only an admin or manager can post a broadcast';
  end if;

  v_org_id := public.current_user_org_id();
  if v_org_id is null then
    raise exception 'organization not found';
  end if;

  if length(trim(p_title)) = 0 then
    raise exception 'title is required';
  end if;
  if length(trim(p_message)) = 0 then
    raise exception 'message is required';
  end if;

  insert into public.broadcasts (organization_id, title, message, created_by)
    values (v_org_id, trim(p_title), trim(p_message), auth.uid())
    returning id into v_id;

  -- Silently drops any id that doesn't belong to this organization, rather
  -- than raising — same "just don't attach it" tolerance a stale client-side
  -- picker selection deserves, not a hard failure of the whole broadcast.
  insert into public.broadcast_references (broadcast_id, reference_type, member_id)
    select v_id, 'member', mid
    from unnest(p_member_ids) as mid
    where exists (select 1 from public.profiles p where p.id = mid and p.organization_id = v_org_id);

  insert into public.broadcast_references (broadcast_id, reference_type, item_id)
    select v_id, 'inventory_item', iid
    from unnest(p_item_ids) as iid
    where exists (select 1 from public.inventory_items i where i.id = iid and i.organization_id = v_org_id);

  insert into public.notifications (organization_id, user_id, kind, message, link)
    select v_org_id, p.id, 'broadcast', format('New broadcast: %s', trim(p_title)), '/broadcasts'
    from public.profiles p
    where p.organization_id = v_org_id
      and p.membership_status = 'approved'
      and p.id != auth.uid();

  insert into public.activity_log (organization_id, actor_id, entity_type, entity_id, message)
    values (v_org_id, auth.uid(), 'broadcast', v_id, format('Posted broadcast: %s', trim(p_title)));

  return v_id;
end;
$$;

grant execute on function public.create_broadcast(text, text, uuid[], uuid[]) to authenticated;
