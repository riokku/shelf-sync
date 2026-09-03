-- Structural fix for a recurring, documented gotcha: every new notification
-- kind has had to widen *two* separate CHECK constraints
-- (notifications.kind and notification_email_log.kind) since they're two
-- independent plain-text columns, each with its own drop-and-recreate
-- constraint — and missing the second one has already caused a real, live
-- gap once (add_notification_email_log_checkout_overdue_kind), silently,
-- since a failed log insert is swallowed by its own best-effort
-- console.error rather than surfacing anywhere. This was nearly repeated a
-- second time with 'impersonation_started' (add_impersonation_started_notification
-- got both right, but only because that earlier lesson was fresh).
--
-- Fix: both columns move onto one shared enum type, notification_kind, so
-- there's structurally only one place to widen going forward
-- (`alter type public.notification_kind add value 'x'`, additive, no
-- retyping the existing list from memory the way a check constraint's
-- drop-and-recreate requires) rather than two coupled edits someone has to
-- remember to make together.
--
-- Deliberate tradeoff, worth being explicit about: the two tables' old
-- constraints didn't actually list the same values — notifications allows
-- 'broadcast' (in-app only, no email) but not 'feedback' (no in-app row);
-- notification_email_log is the reverse. Unifying onto one shared type means
-- each column's *type* now technically permits all eight values, including
-- the one combination that should never occur on that particular table
-- (e.g. a 'broadcast' row in notification_email_log). This is an acceptable
-- loosening, not a real safety regression: neither table has any INSERT
-- grant for `authenticated`/`anon` at all (see add_notifications/
-- add_notification_email_log's own doc comments) — every row on both tables
-- is written by specific, hardcoded call sites (send-notification-email's
-- own insertNotifications()/logEmailAttempt(), and create_broadcast()'s own
-- direct insert for 'broadcast' specifically), never by generic/dynamic
-- code that could plausibly mix the two up. The CHECK constraints were
-- always a typo backstop, not a real security boundary, and this keeps that
-- backstop (an invalid kind entirely is still rejected by the enum type
-- itself) while dropping only the narrower, table-specific slice of it.
--
-- Bonus, not the point of this migration but worth knowing: `supabase gen
-- types` represents a real Postgres enum as a literal TypeScript union
-- (unlike a plain checked `text` column, which it can't introspect into one
-- and just types as `string`) — so NotificationKind in
-- shared/models/notification.model.ts gets real compile-time narrowing for
-- free once types are regenerated, where it previously resolved to `string`.
--
-- Nuance for future maintainers: `alter type ... add value` can't be used
-- in the same transaction that also *uses* the new value (a long-standing
-- Postgres restriction on enums) — fine for simply widening the type and
-- letting already-deployed application code reference it afterward (the
-- normal case), but a migration that both adds a value and, say, backfills
-- rows using it in one file would need to split across two migrations.
create type public.notification_kind as enum (
  'task_assigned', 'task_transfer', 'retirement_request', 'join_request',
  'broadcast', 'checkout_overdue', 'impersonation_started', 'feedback'
);

-- Constraint dropped *before* the column type change, not after — caught
-- live on the first push attempt ("operator does not exist: notification_kind
-- = text"): Postgres has to revalidate an existing CHECK constraint's
-- expression against the column's new type as part of ALTER COLUMN TYPE
-- itself, and a plain `=` has no defined meaning between the new enum type
-- and the constraint's own text literals at that point — dropping the
-- constraint first removes the thing being (re)validated, rather than
-- fixing the comparison itself.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  alter column kind type public.notification_kind using kind::public.notification_kind;

alter table public.notification_email_log drop constraint notification_email_log_kind_check;
alter table public.notification_email_log
  alter column kind type public.notification_kind using kind::public.notification_kind;
