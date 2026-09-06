-- Real Stripe subscription billing — replaces manage/billing's own
-- hardcoded-onto-Free preview (see ManageBillingComponent's doc comment)
-- with one row per org tracking its actual plan. One row per org, same
-- shape site_settings has used since scope_site_settings_by_organization —
-- upsert-friendly via onConflict: 'organization_id'.
--
-- No seed row is inserted anywhere (not even in handle_new_user()) — a
-- missing row is treated by the app as an implicit Free tier, the same way
-- a missing site_settings row already falls back to defaults everywhere it's
-- read. Purely additive: nothing about signup changes.
--
-- status mirrors Stripe's own Subscription.status values verbatim (see
-- https://docs.stripe.com/api/subscriptions/object#subscription_object-status)
-- so the webhook handler can pass them straight through with no translation
-- table of its own.
--
-- stripe_customer_id/stripe_subscription_id are kept even after a
-- cancellation (tier flips back to 'free', status to 'canceled') so a later
-- resubscribe reuses the same Stripe Customer rather than creating a
-- duplicate — the same "outlive what it references" shape
-- inventory_item_orders.supplier_name already establishes elsewhere in this
-- schema, just for an id rather than a label.
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'basic', 'pro')),
  status text not null default 'active'
    check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid', 'paused')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_organization_id_key unique (organization_id)
);

alter table public.subscriptions enable row level security;

-- Reuses the same trigger function create_profiles already established for
-- every other updated_at column in this schema.
create trigger set_subscriptions_updated_at
  before update on public.subscriptions
  for each row
  execute function public.set_updated_at();

-- Any approved org member can read their own org's plan — tier isn't
-- sensitive the same way payment details are, mirroring site_settings' own
-- read breadth rather than admin-only. manage/billing itself stays
-- admin-gated at the route level (adminGuard) regardless.
create policy "Users can view their organization's subscription"
  on public.subscriptions for select
  to authenticated
  using (organization_id = public.current_user_org_id());

-- Deliberately no insert/update/delete policy or grant for
-- authenticated/anon at all — every write happens via the stripe-webhook
-- Edge Function's service_role client (the only thing that should ever be
-- able to move an org between tiers), the same "service-role-only insert"
-- shape add_notifications/add_notification_email_log already establish.
grant select on public.subscriptions to authenticated;
