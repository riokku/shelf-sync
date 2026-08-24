-- Email notifications: a task assigned/offered to you, a retirement
-- request needing admin/manager approval, or a join request needing admin
-- approval, each now also sends an email via the send-notification-email
-- Edge Function (Resend under the hood) — everything before this only ever
-- showed up as an in-app badge/toast.
--
-- pg_net gives Postgres itself the ability to make outbound HTTP calls —
-- this is what "Database Webhooks" (Studio's own name for this pattern)
-- run on under the hood. The call is async (queued to a background worker,
-- not awaited inline), so it can't slow down — or fail — the actual
-- insert/update it's attached to.
create extension if not exists pg_net;

-- The Edge Function has no user JWT to verify (it's never called by a
-- signed-in user, only by these triggers), so it authenticates callers via
-- this shared secret instead of Supabase's normal JWT check. The secret
-- itself lives in Vault, not this migration — a trigger's arguments are
-- always static literals (no subquery allowed), so if the secret were
-- baked into the CREATE TRIGGER call below, it would be sitting in
-- plaintext in this file, committed to the repo forever. Reading it here
-- via Vault instead means this migration only ever handles the *lookup*,
-- never the value — the value was set separately, once, directly against
-- the hosted project (matching this app's existing convention for
-- real/sensitive values that don't belong in a committed migration; see
-- e.g. the hosted org's own reseed script in git history).
--
-- Deliberately a purpose-built secret rather than the service_role key
-- (which the function *does* use internally, via the key Supabase injects
-- into every Edge Function automatically) — this one's only power is
-- "can invoke this one function", so even if it leaked it couldn't bypass
-- RLS on anything.
create or replace function public.call_notification_webhook()
returns trigger
language plpgsql
security definer set search_path = public, net, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_secret';

  perform net.http_post(
    url := 'https://ailqjqjrzhzspofoslpa.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(v_secret, '')),
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
    )
  );

  return new;
end;
$$;

-- Four triggers, each scoped by its own `when (...)` clause to exactly the
-- transition worth emailing about — not "any change to this table" — so
-- the Edge Function is only ever invoked for something actually relevant,
-- and doesn't have to re-derive "did the interesting thing actually
-- happen" from a firehose of unrelated row changes. `when` can only
-- reference NEW/OLD (not TG_OP), which is why direct-assignment and
-- transfer-offered need their own separate INSERT/UPDATE triggers rather
-- than one trigger covering both.

create trigger notify_on_task_assigned
  after insert on public.tasks
  for each row
  when (new.assigned_to is not null)
  execute function public.call_notification_webhook();

create trigger notify_on_task_transfer_offered
  after update on public.tasks
  for each row
  when (new.pending_transfer_to is not null and new.pending_transfer_to is distinct from old.pending_transfer_to)
  execute function public.call_notification_webhook();

create trigger notify_on_retirement_requested
  after update on public.inventory_items
  for each row
  when (new.status = 'retirement_pending' and old.status is distinct from 'retirement_pending')
  execute function public.call_notification_webhook();

create trigger notify_on_join_request
  after insert on public.profiles
  for each row
  when (new.membership_status = 'pending')
  execute function public.call_notification_webhook();
