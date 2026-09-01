-- Backs Studio's release-notes CRUD (studio/release-notes,
-- StudioReleaseNotesComponent): a platform admin can post/edit/delete
-- "What's new" entries, each carrying a severity tier ('standard' /
-- 'emphasized' / 'critical') that drives distinct styling client-side.
-- Replaces the hand-maintained CHANGELOG_ENTRIES array
-- (shared/models/changelog.ts) as the source of truth for the in-app
-- "What's new" list both manage/release-notes and studio/release-notes
-- render — see this migration's own backfill at the bottom.
--
-- Platform-wide, not org-scoped, unlike nearly everything else in this
-- schema: every organization reads the exact same list, so there's no
-- organization_id column and no per-org join in any policy below — the
-- first table in this schema like that. Readable by any authenticated user
-- (no anon consumer needed; both routes sit behind approvedGuard);
-- writable only by a platform admin (is_platform_admin(), see
-- add_platform_admin.sql), via plain RLS rather than a SECURITY DEFINER
-- RPC — nothing here needs an atomic side effect on another table (unlike
-- e.g. create_broadcast()), so a flat is_platform_admin() check in each
-- policy's using/with check is enough on its own. (The "same authenticated
-- Postgres role" limitation the Supabase Schema section's own "Important
-- RLS constraint" note describes is specifically about column-level
-- GRANTs; a row-level policy can reference a SECURITY DEFINER helper like
-- this freely, the same way current_user_role()/is_platform_admin() are
-- already used directly inside plenty of other tables' insert/update/
-- delete policies.)
create table public.release_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text not null check (length(trim(description)) > 0),
  severity text not null default 'standard' check (severity in ('standard', 'emphasized', 'critical')),
  -- Editable independently of created_at/updated_at below — lets a platform
  -- admin backfill an older date, or simply control display order, without
  -- it being tied to whenever the row itself was actually inserted/edited.
  -- Display order is posted_at desc, created_at desc (see
  -- StudioReleaseNotesComponent's own load query) — the trailing created_at
  -- tiebreak is what keeps same-day entries in a stable, insertion order.
  posted_at date not null default current_date,
  -- on delete set null (not cascade) — an entry should outlive its author
  -- being later removed as a platform admin, same reasoning
  -- inventory_item_activity/activity_log/broadcasts' own actor columns
  -- already use.
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index release_notes_posted_at_idx on public.release_notes (posted_at desc, created_at desc);

create trigger set_release_notes_updated_at
  before update on public.release_notes
  for each row
  execute function public.set_updated_at();

alter table public.release_notes enable row level security;

create policy "Authenticated users can view release notes"
  on public.release_notes for select
  to authenticated
  using (true);

create policy "Platform admins can create release notes"
  on public.release_notes for insert
  to authenticated
  with check (public.is_platform_admin());

create policy "Platform admins can update release notes"
  on public.release_notes for update
  to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Platform admins can delete release notes"
  on public.release_notes for delete
  to authenticated
  using (public.is_platform_admin());

-- Backfills every entry from the previously hand-maintained
-- CHANGELOG_ENTRIES array (shared/models/changelog.ts, as of this
-- migration) so switching to a DB-backed list doesn't lose any
-- shipped-feature history — every organization's "What's new" feed reads
-- identically the moment this ships. All backfilled as 'standard' severity
-- (the tier concept didn't exist yet) and created_by left null — no single
-- real actor to attribute historical entries to, same reasoning seed.sql's
-- own placeholder rows leave checked_out_to/retired_by null for. Inserted
-- oldest-first so each row's own created_at ordering matches the array's
-- original newest-first display order once read back out via
-- `order by posted_at desc, created_at desc`.
insert into public.release_notes (title, description, severity, posted_at) values
  ('Unsaved-changes protection', 'Manage > Inventory and Manage > Tasks now warn you before losing an in-progress, unsaved item or task.', 'standard', '2026-08-24'::date),
  ('Bulk actions on retirement requests', 'Approve or decline multiple pending retirement requests at once from Manage > Inventory''s Requests tab.', 'standard', '2026-08-24'::date),
  ('In-app notification center', 'A new bell icon in the header keeps a running list of task assignments, transfer offers, and approval requests.', 'standard', '2026-08-24'::date),
  ('Retry failed data loads', 'Inventory, Tasks, and a few Manage pages now show a Retry button instead of an empty list when a page fails to load.', 'standard', '2026-08-24'::date),
  ('Reservations', 'Book a quantity of an item for a future date range without checking it out, from the new Manage > Reservations page.', 'standard', '2026-08-24'::date),
  ('Contextual help tooltips', 'Small "?" icons now explain a handful of non-obvious controls, like container tracking and reservations, right where you need them.', 'standard', '2026-08-25'::date),
  ('In-app Help & FAQ page', 'This page! Answers to common "how do I..." questions about ShelfSync, linked from the header.', 'standard', '2026-08-25'::date),
  ('First-run page guidance', 'Inventory, Tasks, and the Manage hub now show a one-time, dismissible orientation hint the first time you visit.', 'standard', '2026-08-25'::date),
  ('Bolder page headers', 'Inventory, Tasks, and the Manage hub now open with a bold gradient header showing live counts at a glance, and every Manage page picked up a splash of matching color.', 'standard', '2026-08-28'::date),
  ('Quicker way back to Home', 'Inventory, Tasks, Manage, Reservations, Help, Account, and Studio all show a Back button now, right above the page title.', 'standard', '2026-08-28'::date),
  ('Broadcasts', 'Admins and managers can now post org-wide announcements, optionally referencing team members or inventory items. Everyone gets notified and can catch up on the new Broadcasts page.', 'standard', '2026-08-28'::date),
  ('No more bare loading spinners', 'The last page still showing a plain spinner while it loads (the "awaiting approval" screen) now shows a shimmering placeholder instead, matching every other page in the app.', 'standard', '2026-08-28'::date),
  ('Platform account locking', 'Studio > Users now opens a full page for each person, with a toggle to lock their account across every organization — for abuse, not org-level issues.', 'standard', '2026-08-28'::date),
  ('Fewer silent failures', 'Home, Billing, and Studio now show a "couldn''t load, try again" message with a Retry button if a page fails to load, instead of just looking empty.', 'standard', '2026-08-28'::date),
  ('Bulk inventory import', 'Manage > Inventory now has an Import button next to Export — download a CSV template, fill in a row per item in Excel or Sheets, and re-upload to create them all at once.', 'standard', '2026-08-30'::date),
  ('Smarter Save button on tasks', 'Opening a task''s Status dropdown no longer leaves Save clickable until you actually change something.', 'standard', '2026-08-30'::date),
  ('Physical inventory audits', 'A new Manage > Audits page lets you reconcile physical stock counts against the system — start an audit, anyone can submit counts, and admins/managers apply the discrepancies.', 'standard', '2026-08-30'::date),
  ('Org detail shows inventory & task counts', 'Studio > Organizations now shows each org''s item/task/storage usage right in the list, and its per-org detail page shows the same numbers alongside members and recent activity.', 'standard', '2026-08-31'::date),
  ('Command palette (Ctrl/Cmd+K)', 'Jump to any page or search inventory, tasks, reservations, audits, broadcasts, suppliers, orders, team members, and (for platform admins) organizations and users — all from one search box, by name or id.', 'standard', '2026-08-31'::date),
  ('Date-range filtering on Reports', 'Manage > Reports'' stock movement and task throughput sections can now be scoped to the last 7/30/90 days, all time, or a custom range.', 'standard', '2026-08-31'::date),
  ('Studio > Users shows recent signups', 'No more starting from a blank page — Studio > Users now lists the 20 most recent signups by default, with search still narrowing it down to someone specific.', 'standard', '2026-08-31'::date),
  ('Reservation calendar view', 'Manage > Reservations has a Calendar view alongside the list — see what''s booked on any given day at a glance, with a click-through agenda for the day you pick.', 'standard', '2026-09-22'::date),
  ('Overdue checkout reminders', 'A checked-out item can now carry a due-back date. Once it passes, the person holding it and your admins/managers get emailed and notified — repeating every few days until it''s resolved.', 'standard', '2026-09-22'::date),
  ('Studio''s "Mission Control" hero', 'The Studio hub has a new radar-console hero banner up top, in place of the old plain heading.', 'standard', '2026-09-23'::date),
  ('Release Notes in Studio', 'Platform admins can now see "What''s new" from the Studio hub too, not just Manage''s.', 'standard', '2026-09-24'::date);
