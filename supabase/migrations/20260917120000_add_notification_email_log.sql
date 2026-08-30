-- Platform-admin insight gap: send-notification-email (add_notification_email_webhooks,
-- add_feedback) fires Resend API calls fire-and-forget from inside a
-- pg_net-triggered Edge Function — nothing anywhere records whether a given
-- send actually succeeded. A misconfigured Resend key, a bounced address,
-- or a rate limit currently fails completely silently. Backs a new
-- studio/email-log page (StudioEmailLogComponent).
--
-- Same "service-role-only insert, platform-admin-only read" shape
-- `notifications` (20260902120000_add_notifications.sql) already
-- established — every row here is inserted by send-notification-email
-- itself via the service_role key it already holds, so no INSERT policy
-- for authenticated/anon is needed or added.
create table public.notification_email_log (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('task_assigned', 'task_transfer', 'retirement_request', 'join_request', 'feedback')),
  recipient_email text not null,
  -- Nullable + `on delete set null` (not cascade) — an email log entry
  -- should outlive the org it was about, same "audit trail survives its
  -- own subject" reasoning inventory_item_orders.supplier_name already
  -- follows for a removed supplier.
  organization_id uuid references public.organizations (id) on delete set null,
  success boolean not null,
  error_message text,
  created_at timestamptz not null default now()
);

create index notification_email_log_created_at_idx on public.notification_email_log (created_at desc);

alter table public.notification_email_log enable row level security;

create policy "Platform admins can view the email log"
  on public.notification_email_log for select
  to authenticated
  using (public.is_platform_admin());

grant select on public.notification_email_log to authenticated;
