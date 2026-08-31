-- A checked-out item (is_checked_out/checked_out_to) has never had a
-- return-by date, and nothing ever followed up if it was kept too long —
-- this adds one, plus an automated overdue reminder (email + in-app
-- notification, reusing send-notification-email's existing infrastructure)
-- once it passes. See ModalTableComponent's "Due back" field and
-- isCheckoutOverdue() (shared/models/inventory-item.model.ts) for the
-- client-side half of this.

-- Plain date (matching expiration_date's own type), not a timestamp —
-- meaningful only while is_checked_out, nullable otherwise.
alter table public.inventory_items add column checkout_due_at date;

-- Tracks the last time an overdue reminder actually fired for the
-- *current* checkout, so notify_overdue_checkouts() below doesn't re-email
-- every single day (see that function's own re-notify window). Deliberately
-- excluded from any column grant — nothing client-side ever writes this
-- directly; only the trigger below (via NEW assignment, not subject to
-- column-level grants regardless — same as set_updated_at() already isn't)
-- and notify_overdue_checkouts() itself (SECURITY DEFINER, bypasses RLS)
-- ever touch it.
alter table public.inventory_items add column checkout_overdue_notified_at timestamptz;

-- checked_out_to already rides on the any-authenticated-user column grant
-- add_inventory_item_retirement.sql established; checkout_due_at needs the
-- same additive grant or it silently fails to save despite passing RLS —
-- same pattern add_inventory_item_barcode.sql used for its own new column.
grant update (checkout_due_at) on public.inventory_items to authenticated;

-- Reassigning the item, changing its due date, or checking it back in
-- (which nulls checked_out_to) all mean whatever "already notified" state
-- existed no longer applies to the checkout that's active now — reset it
-- so a fresh overdue period on the same item notifies again instead of
-- staying silent forever because of a stale timestamp from a previous
-- checkout.
create or replace function public.clear_checkout_overdue_notification()
returns trigger
language plpgsql
as $$
begin
  if new.checked_out_to is distinct from old.checked_out_to
     or new.checkout_due_at is distinct from old.checkout_due_at then
    new.checkout_overdue_notified_at := null;
  end if;
  return new;
end;
$$;

create trigger clear_checkout_overdue_notification
  before update on public.inventory_items
  for each row
  execute function public.clear_checkout_overdue_notification();

-- Daily sweep for anything checked out past its due date. SECURITY DEFINER
-- + pg_cron, same shape purge_expired_organizations() already established
-- for a scheduled job with no request/session context. Re-notifies every 3
-- days rather than firing once and going silent forever if the first email
-- gets missed/ignored — nags until the item is returned, its due date is
-- pushed out, or it's reassigned (all three reset checkout_overdue_notified_at
-- via the trigger above).
create or replace function public.notify_overdue_checkouts()
returns void
language plpgsql
security definer set search_path = public, net, vault
as $$
declare
  v_secret text;
  v_item record;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'webhook_secret';

  for v_item in
    select id, name, checkout_due_at, checked_out_to, organization_id
    from public.inventory_items
    where is_checked_out
      and checkout_due_at is not null
      and checkout_due_at < current_date
      and (checkout_overdue_notified_at is null or checkout_overdue_notified_at < now() - interval '3 days')
  loop
    perform net.http_post(
      url := 'https://ailqjqjrzhzspofoslpa.supabase.co/functions/v1/send-notification-email',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', coalesce(v_secret, '')),
      body := jsonb_build_object(
        'type', 'OVERDUE_CHECKOUT',
        'table', 'inventory_items',
        'schema', 'public',
        'record', to_jsonb(v_item),
        'old_record', null
      )
    );

    -- Marked optimistically, same "fire-and-forget, net.http_post is async"
    -- reasoning every trigger-driven webhook call in this schema already
    -- relies on (see call_notification_webhook()'s own doc comment).
    update public.inventory_items
      set checkout_overdue_notified_at = now()
      where id = v_item.id;
  end loop;
end;
$$;

select cron.schedule(
  'notify-overdue-checkouts',
  '0 13 * * *',
  $$select public.notify_overdue_checkouts();$$
);

-- notifications.kind's check constraint (add_notifications.sql, widened by
-- add_broadcasts.sql) needs a sixth value for this new kind — a check
-- constraint can't be altered in place, same as every other widen in this
-- schema (add_more_avatar_presets.sql, add_inventory_item_discard_reasons.sql,
-- add_broadcasts.sql), so this drops and recreates it.
alter table public.notifications drop constraint notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('task_assigned', 'task_transfer', 'retirement_request', 'join_request', 'broadcast', 'checkout_overdue'));
