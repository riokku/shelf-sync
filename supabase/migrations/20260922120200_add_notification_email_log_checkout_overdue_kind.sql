-- add_inventory_item_checkout_due_date.sql widened notifications.kind's own
-- check constraint for the new 'checkout_overdue' kind but missed this
-- table's separate, identically-shaped one — caught live via studio/
-- email-log staying empty after a manual notify_overdue_checkouts() test
-- run: logEmailAttempt()'s insert was silently failing the check constraint
-- and being swallowed by its own best-effort console.error (same "never
-- block/throw over a logging write" reasoning that function's own doc
-- comment describes), so the send itself succeeded but nothing recorded it.
-- Same drop-and-recreate approach every other check-constraint widen in
-- this schema already uses (a check constraint can't be altered in place).
alter table public.notification_email_log drop constraint notification_email_log_kind_check;
alter table public.notification_email_log
  add constraint notification_email_log_kind_check
  check (kind in ('task_assigned', 'task_transfer', 'retirement_request', 'join_request', 'feedback', 'checkout_overdue'));
