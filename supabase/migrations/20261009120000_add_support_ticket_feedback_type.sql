-- Adds 'support_ticket' to feedback.type's allowed values.
--
-- FeedbackModalComponent's dialog title was retitled in this same pass to
-- "Submit feedback or support ticket", but the dropdown still offered only
-- bug/feature_request/general/other — someone who actually needed help had
-- to file it as "General feedback" or "Other", which is exactly the
-- distinction StudioFeedbackComponent's own triage list most needs to see.
--
-- A check constraint can't be altered in place, so this drops and recreates
-- it with the widened value list — same convention add_more_avatar_presets
-- and add_broadcasts already use for their own constraint widens. Deliberately
-- a plain checked text column rather than converting to a real Postgres enum
-- the way unify_notification_kind_enum did for notifications.kind: that
-- conversion earned its keep because *two* separate tables' constraints had to
-- be widened together and only one of them failed loudly when someone forgot
-- (see add_notification_email_log_checkout_overdue_kind's own lesson).
-- feedback.type has exactly one constraint in exactly one place, so there's no
-- coupled second edit for an enum to protect against here.
--
-- Two things mirror this list and are kept in sync by hand (same as
-- notifications.kind already is):
--   - FeedbackType / FEEDBACK_TYPES / FEEDBACK_TYPE_LABELS in
--     src/app/shared/models/feedback.ts
--   - FEEDBACK_TYPE_LABELS in supabase/functions/send-notification-email
--     (a separately deployed Deno function — it can't import from the app's
--     own source tree)
-- No backfill: every existing row keeps whichever type it was filed under.
alter table public.feedback drop constraint feedback_type_check;

alter table public.feedback
  add constraint feedback_type_check
  check (type in ('support_ticket', 'bug', 'feature_request', 'general', 'other'));
