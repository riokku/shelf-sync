// The only place any row in `subscriptions` is ever written — every other
// path (create-checkout-session, create-billing-portal-session) only ever
// reads that table and redirects to a Stripe-hosted URL, per this app's own
// "one write path per table" convention. Subscription state changes happen
// asynchronously and after checkout (a renewal, a Portal-driven upgrade, a
// failed card) — per Stripe's own guidance (.agents/skills/
// stripe-best-practices/references/billing.md), a webhook handler for the
// full subscription lifecycle is never optional, so this handles exactly
// the six events that guidance calls mandatory.
//
// Called directly by Stripe, never by the browser — no CORS handling
// needed (mirrors send-notification-email's shape, not
// create-checkout-session's), and authenticated by Stripe's own webhook
// signature (constructEventAsync — Deno's crypto has no sync verifier, so
// Node's usual constructEvent isn't available here) rather than this app's
// own x-webhook-secret shared-secret scheme, which is specific to the
// Postgres-trigger-originated calls send-notification-email otherwise
// handles. verify_jwt is set to false for this function in config.toml for
// the same reason it already is for that one: Stripe's caller has no
// Supabase-issued JWT either.
//
// Response codes deliberately depart from send-notification-email's
// "always 200, best-effort" philosophy: a signature failure is a genuine
// 400, and a database write failure inside a handler is a 500 (logged
// first) rather than a swallowed 200 — an inaccurate subscription row is
// worth Stripe's own automatic retry (backed off over ~3 days), unlike a
// missed notification email.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.6.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Duplicated from create-checkout-session's own copy (no _shared/ directory
// exists yet in this app's Edge Functions — see the plan this shipped
// from) — used only as a defensive fallback below, when a subscription's
// own metadata.tier is somehow missing, by reverse-looking-up the tier from
// whichever Price is actually on the subscription.
const STRIPE_PRICE_IDS: Record<'basic' | 'pro', string> = {
  basic: 'price_1UCXDKBM2MsifrvqjzggiRrM', // $19.99/mo
  pro: 'price_1UCXEMBM2Msifrvqf3PX9Dhq' // $49.99/mo
};

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-08-26.dahlia' });

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface SubscriptionRow {
  organization_id: string;
  tier: 'free' | 'basic' | 'pro';
  status: Stripe.Subscription.Status;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
}

function tierFromPriceId(priceId: string | undefined): 'basic' | 'pro' | null {
  if (priceId === STRIPE_PRICE_IDS.basic) return 'basic';
  if (priceId === STRIPE_PRICE_IDS.pro) return 'pro';
  return null;
}

// Recent Stripe API versions moved current_period_end/current_period_start
// off the top-level Subscription object onto each SubscriptionItem (to
// support multiple prices per subscription) — read defensively from either
// location so this keeps working regardless of exactly which shape the
// linked account's API version returns.
function periodEndOf(subscription: Stripe.Subscription): string | null {
  const itemPeriodEnd = (subscription.items.data[0] as unknown as { current_period_end?: number })?.current_period_end;
  const periodEnd = itemPeriodEnd ?? (subscription as unknown as { current_period_end?: number }).current_period_end;
  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}

function rowFromSubscription(organizationId: string, subscription: Stripe.Subscription): SubscriptionRow {
  const priceId = subscription.items.data[0]?.price?.id;
  const metadataTier = subscription.metadata?.tier;
  const tier: 'basic' | 'pro' =
    metadataTier === 'basic' || metadataTier === 'pro' ? metadataTier : tierFromPriceId(priceId) ?? 'basic';

  return {
    organization_id: organizationId,
    tier,
    status: subscription.status,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId ?? null,
    current_period_end: periodEndOf(subscription),
    cancel_at_period_end: subscription.cancel_at_period_end
  };
}

async function upsertSubscription(row: SubscriptionRow): Promise<string | null> {
  const { error } = await supabase.from('subscriptions').upsert(row, { onConflict: 'organization_id' });
  return error?.message ?? null;
}

function organizationIdFromSubscription(subscription: Stripe.Subscription): string | null {
  return subscription.metadata?.organization_id ?? null;
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<string | null> {
  // Delayed payment methods (e.g. some bank debits) land here with
  // payment_status 'unpaid' and get finished by
  // checkout.session.async_payment_succeeded instead — nothing to record
  // yet if so.
  if (session.payment_status !== 'paid') {
    return null;
  }
  return handleCheckoutSessionPaid(session);
}

async function handleCheckoutSessionPaid(session: Stripe.Checkout.Session): Promise<string | null> {
  const organizationId = session.client_reference_id ?? (session.metadata?.organization_id as string | undefined) ?? null;
  if (!organizationId) {
    console.error('checkout.session event with no organization_id to correlate:', session.id);
    return null;
  }
  if (!session.subscription) {
    console.error('checkout.session event with no subscription:', session.id);
    return null;
  }

  // The Checkout Session itself carries no status/period-end — the real
  // Subscription object is the source of truth for those.
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return upsertSubscription(rowFromSubscription(organizationId, subscription));
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<string | null> {
  // event.data.object *is* the Subscription here — it has no
  // client_reference_id of its own (that only ever exists on a Checkout
  // Session), which is exactly why subscription_data.metadata was set at
  // checkout time: this is the only field that survives onto a later
  // Portal-driven upgrade/downgrade or plain renewal.
  const organizationId = organizationIdFromSubscription(subscription);
  if (!organizationId) {
    console.error('customer.subscription.updated with no organization_id metadata:', subscription.id);
    return null;
  }
  return upsertSubscription(rowFromSubscription(organizationId, subscription));
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<string | null> {
  const { error } = await supabase
    .from('subscriptions')
    .update({ tier: 'free', status: 'canceled', cancel_at_period_end: false })
    .eq('stripe_subscription_id', subscription.id);
  return error?.message ?? null;
}

async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<string | null> {
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) {
    // A one-off invoice not tied to any subscription — nothing to sync.
    return null;
  }
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const organizationId = organizationIdFromSubscription(subscription);
  if (!organizationId) {
    console.error('invoice.paid subscription with no organization_id metadata:', subscriptionId);
    return null;
  }
  return upsertSubscription(rowFromSubscription(organizationId, subscription));
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<string | null> {
  const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id;
  if (!subscriptionId) {
    return null;
  }
  // Stripe's own dunning/retry schedule owns the grace period here — this
  // just reflects the failure so ManageBillingComponent can show a warning;
  // no forced downgrade.
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', subscriptionId);
  return error?.message ?? null;
}

Deno.serve(async req => {
  const signature = req.headers.get('Stripe-Signature');
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature ?? '', STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return new Response('Invalid signature', { status: 400 });
  }

  let writeError: string | null = null;
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        writeError = await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'checkout.session.async_payment_succeeded':
        writeError = await handleCheckoutSessionPaid(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.updated':
        writeError = await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        writeError = await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        writeError = await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        writeError = await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      default:
        // An event type we don't act on — plain 200 so Stripe stops
        // retrying it, same as every case above once handled successfully.
        return new Response('OK', { status: 200 });
    }
  } catch (error) {
    console.error(`Failed to handle ${event.type}:`, error);
    return new Response('Internal error', { status: 500 });
  }

  if (writeError) {
    console.error(`Failed to write subscription state for ${event.type}:`, writeError);
    return new Response('Database write failed', { status: 500 });
  }

  return new Response('OK', { status: 200 });
});
