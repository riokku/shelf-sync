-- Per-org kill switches for each of the four email notification kinds
-- add_notification_email_webhooks introduced — surfaced on Customize >
-- Workflow's new "Email notifications" section, alongside
-- require_retirement_approval/bulk_edit_enabled in that same tab. Default
-- true for all four, preserving current behavior (every notification kind
-- has been unconditionally on since that migration) for every existing org.
--
-- Checked inside the send-notification-email Edge Function itself, not the
-- Postgres trigger side — the trigger firing costs nothing (net.http_post
-- is async), and keeping "should this actually send" as Edge Function logic
-- means the trigger function stays a single dumb dispatcher regardless of
-- how many notification kinds/settings get added later, rather than
-- growing a per-trigger-type branch to know which site_settings column to
-- check.
--
-- No RLS/grant changes needed: same reasoning as every other site_settings
-- column added this way — its UPDATE policy is already a flat,
-- non-column-scoped "admin of own org" check, so new plain columns ride
-- along under it.
alter table public.site_settings
  add column notify_task_assigned boolean not null default true,
  add column notify_task_transfer boolean not null default true,
  add column notify_retirement_request boolean not null default true,
  add column notify_join_request boolean not null default true;
