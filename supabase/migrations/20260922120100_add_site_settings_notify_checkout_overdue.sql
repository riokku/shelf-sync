-- Fifth per-org kill switch for send-notification-email, alongside the
-- other four from add_site_settings_email_notification_toggles.sql —
-- Settings > Workflow's "Email notifications" section. Default true,
-- matching every existing kind's own default (this is opt-out, not opt-in).
--
-- Checked inside the Edge Function itself, not the SQL side that decides
-- *whether an item is overdue* — notify_overdue_checkouts() (see
-- add_inventory_item_checkout_due_date.sql) always calls the webhook
-- regardless, same "the trigger firing costs nothing" reasoning every other
-- notification kind's own toggle already follows.
--
-- No RLS/grant changes needed: same reasoning as every other site_settings
-- column added this way — its UPDATE policy is already a flat,
-- non-column-scoped "admin of own org" check, so a new plain column rides
-- along under it.
alter table public.site_settings
  add column notify_checkout_overdue boolean not null default true;
