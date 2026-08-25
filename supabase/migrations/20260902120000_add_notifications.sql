-- In-app notification center: a bell icon in HeaderComponent showing an
-- unread count and a dropdown list, backing the same four events that
-- already trigger an email via send-notification-email (see
-- add_notification_email_webhooks / add_site_settings_email_notification_toggles)
-- — a task directly assigned to you, a task transfer offered to you, an
-- inventory item's retirement request needing admin/manager approval, and a
-- new member's join request needing admin approval.
--
-- Deliberately no INSERT policy for `authenticated`/`anon` here — every row
-- is inserted by send-notification-email itself, using the service_role key
-- Supabase already injects into every Edge Function (see that function's
-- own doc comment for why it already holds that key). This keeps recipient
-- resolution (who exactly gets notified for a given event — a single
-- assignee/transfer target, or every admin/manager/admin in the org) in
-- exactly one place: the same profileEmail()/orgEmailsByRole() logic that
-- function already has for building each event's email(s), rather than
-- duplicating that resolution a second time in PL/pgSQL triggers. In-app
-- notifications are also deliberately NOT gated by the per-org
-- notify_task_assigned/etc. toggles the way the email send is — those
-- toggles only ever meant "should this send an email", not "should this
-- happen at all"; an in-app notification costs a viewer nothing the way an
-- unwanted email does.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('task_assigned', 'task_transfer', 'retirement_request', 'join_request')),
  message text not null,
  -- App-relative path (e.g. '/tasks', '/manage/inventory') the bell
  -- dropdown's row navigates to on click — same four destinations
  -- send-notification-email's own emailShell() CTA links already use.
  link text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Partial index for the unread-count query (the bell badge), plus a general
-- one for the dropdown's own newest-first list.
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;
create index notifications_user_created_at_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

-- Only read_at is ever meant to change client-side (marking one or all
-- read) — a narrow, self-service column grant, same shape
-- profiles.last_active_at already has, not a flat row-level grant.
create policy "Users can update their own notifications"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Live badge/list updates without polling — same two-part mechanism
-- enable_realtime_for_inventory_and_tasks.sql already established (see that
-- migration's own doc comment for the full reasoning behind both pieces).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

alter table public.notifications replica identity full;
