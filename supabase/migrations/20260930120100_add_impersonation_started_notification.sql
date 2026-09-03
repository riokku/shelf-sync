-- Impersonation transparency: starting an impersonation session now also
-- notifies the impersonated person plus every other admin in their org
-- (deduplicated when they're the same person) — same "notify the person
-- directly affected, plus everyone accountable for the org" shape
-- notify_overdue_checkouts()'s own recipient resolution already established
-- for its own two-audience notification. Reuses the existing
-- call_notification_webhook()/send-notification-email pipeline unchanged —
-- that function already posts tg_table_name/the new row generically, so
-- this needed only a new trigger, not a new Postgres-side function (same
-- reasoning add_feedback's own notify_on_feedback_submitted trigger already
-- established for itself). No `when (...)` clause, same as that trigger —
-- every impersonation_sessions insert is worth notifying about, there's no
-- irrelevant transition to filter out.
--
-- Deliberately NOT gated behind Settings > Workflow's per-org "Email
-- notifications" toggles the way every other kind except feedback already
-- is — this is a security/trust notice about an external party (a platform
-- admin) accessing the org's data, not an internal workflow convenience an
-- org might reasonably want to mute. isEmailNotificationEnabled() is simply
-- never checked for this kind in the Edge Function, same exemption
-- resultForFeedback() already has for itself. Unlike feedback, though, this
-- kind *does* still insert into `notifications` (the in-app bell) — the
-- audience here is real org members, not an external maintainer address.
create trigger notify_on_impersonation_started
  after insert on public.impersonation_sessions
  for each row
  execute function public.call_notification_webhook();

-- Both check constraints need the new kind — see
-- add_notification_email_log_checkout_overdue_kind's own doc comment for
-- why a new notification *kind* touches two separate constraints
-- (notifications.kind and notification_email_log.kind), and why missing the
-- second one fails silently rather than as a visible error. Both drop-and-
-- recreate, same as every other widen in this schema (a check constraint
-- can't be altered in place).
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('task_assigned', 'task_transfer', 'retirement_request', 'join_request', 'broadcast', 'checkout_overdue', 'impersonation_started'));

alter table public.notification_email_log drop constraint notification_email_log_kind_check;
alter table public.notification_email_log
  add constraint notification_email_log_kind_check
  check (kind in ('task_assigned', 'task_transfer', 'retirement_request', 'join_request', 'feedback', 'checkout_overdue', 'impersonation_started'));
