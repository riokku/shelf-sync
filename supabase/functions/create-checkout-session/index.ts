// Backs BillingService.startCheckout() — the "Upgrade to Basic/Pro" buttons
// on manage/billing and /pricing (admin-only; see role check below, mirroring
// adminGuard's own boundary). Invoked directly from the browser via
// supabase.functions.invoke(), the same shape impersonate-user already
// established as this app's template for that: real CORS handling, a
// per-request caller-identifying client alongside a module-level
// service_role one, and a flat { error: string } JSON shape on every
// non-2xx response.
//
// Every table write this app makes for a subscription happens inside
// stripe-webhook instead, never here — this function only ever creates a
// Checkout Session and hands back its URL. The org's Stripe Customer is
// found-or-created by Checkout itself (via `customer` when one already
// exists, `customer_email` otherwise), not by this function calling
// stripe.customers.create() directly, so there's exactly one place
// (stripe-webhook) that ever writes the `subscriptions` row.
//
// Session-level `metadata`/`client_reference_id` is only ever visible on
// `checkout.session.*` webhook events — a later `customer.subscription.*`
// event (a Portal-driven upgrade, a renewal) has no idea which Checkout
// Session originally created it. `subscription_data.metadata` copies the
// same organization_id/tier onto the Subscription object itself specifically
// so stripe-webhook can still resolve the org on every later event too.
//
// Per Stripe's own current best practice (see .agents/skills/
// stripe-best-practices/references/billing.md): never pass
// `payment_method_types` — omitting it entirely lets Stripe apply whichever
// payment methods are enabled/eligible per the Dashboard's own dynamic
// payment methods settings.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.6.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;

const APP_URL = 'https://shelf-sync.chrisistinson.workers.dev';

// One Stripe Product per tier (Basic/Pro only — Free has no Stripe object of
// its own), one monthly Price per Product, created once by hand in the
// Stripe test-mode Dashboard rather than via this app's own restricted API
// key (see the plan this shipped from for why: a one-time task that would
// otherwise need a Products/Prices write permission the key never needs
// again afterward). Never put more than one tier's price on a single
// Product — Checkout/invoice line items only ever show the Product name, so
// two tiers sharing one Product would be indistinguishable on a receipt.
const STRIPE_PRICE_IDS: Record<'basic' | 'pro', string> = {
  basic: 'price_1UCXDKBM2MsifrvqjzggiRrM', // $19.99/mo
  pro: 'price_1UCXEMBM2Msifrvqf3PX9Dhq' // $49.99/mo
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// A real client instance, never the deprecated global `stripe.api_key = ...`
// pattern — see the stripe-best-practices skill's own "Critical rules".
const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-08-26.dahlia' });

// Bypasses RLS entirely — used for every read/write below once the caller
// has been confirmed an admin of their own org, same trust level
// impersonate-user's own serviceClient already establishes.
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface CheckoutRequestBody {
  tier?: string;
}

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

function isSubscribableTier(value: string | undefined): value is 'basic' | 'pro' {
  return value === 'basic' || value === 'pro';
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing Authorization header' });
  }

  // Scoped to the caller's own JWT purely to identify who's calling —
  // everything else below runs through serviceClient instead, once that
  // identity has been confirmed an admin.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) {
    return jsonResponse(401, { error: 'Not signed in' });
  }

  const { data: callerProfile } = await serviceClient
    .from('profiles')
    .select('organization_id, role')
    .eq('id', caller.id)
    .maybeSingle();
  if (!callerProfile) {
    return jsonResponse(403, { error: 'Only an admin can change billing plans' });
  }
  // Mirrors adminGuard's own role check exactly — billing is admin-only,
  // same audience as Danger Zone, not the broader admin-or-manager
  // canManage() boundary most of Manage's other sub-pages use.
  if (callerProfile.role !== 'admin') {
    return jsonResponse(403, { error: 'Only an admin can change billing plans' });
  }

  let body: CheckoutRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body' });
  }
  // Free is never a real Stripe object — rejecting it here, not just
  // relying on the client never sending it, keeps this the one place that
  // enforces "Free can't reach Stripe" regardless of what a caller sends.
  if (!isSubscribableTier(body.tier)) {
    return jsonResponse(400, { error: "tier must be 'basic' or 'pro'" });
  }
  const tier = body.tier;
  const organizationId = callerProfile.organization_id;

  // Find-or-create customer: reuse the org's existing Stripe Customer (set
  // by stripe-webhook on a previous checkout) rather than letting Checkout
  // create a second one for the same org on a resubscribe.
  const { data: existingSubscription } = await serviceClient
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', organizationId)
    .maybeSingle();
  const existingCustomerId = existingSubscription?.stripe_customer_id ?? null;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: STRIPE_PRICE_IDS[tier], quantity: 1 }],
      customer: existingCustomerId ?? undefined,
      customer_email: existingCustomerId ? undefined : (caller.email ?? undefined),
      client_reference_id: organizationId,
      metadata: { organization_id: organizationId, tier },
      subscription_data: { metadata: { organization_id: organizationId, tier } },
      success_url: `${APP_URL}/manage/billing?checkout=success`,
      cancel_url: `${APP_URL}/manage/billing?checkout=cancelled`,
      // No payment_method_types — see this file's own doc comment.
      //
      // Managed Payments (Stripe acting as merchant of record, handling tax
      // globally) is on by default for this account and requires every
      // Product to carry a tax_code — caught live, the first real checkout
      // attempt failed with "the product tax code is missing" rather than
      // anything about this app's own code. Explicitly opted out here
      // rather than assigning tax codes to Basic/Pro, since real tax
      // handling (Stripe Tax, automatic_tax, a registration) is already
      // deliberately out of scope for this pass — see this repo's own
      // CLAUDE.md note on that. Revisit both together before any real,
      // non-test charge.
      managed_payments: { enabled: false }
    } as Stripe.Checkout.SessionCreateParams);

    if (!session.url) {
      console.error('Checkout session created with no url:', session.id);
      return jsonResponse(500, { error: 'Failed to start checkout.' });
    }

    return jsonResponse(200, { url: session.url });
  } catch (error) {
    console.error('Failed to create checkout session:', error);
    return jsonResponse(500, { error: 'Failed to start checkout.' });
  }
});
