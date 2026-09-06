// Backs BillingService.openBillingPortal() — manage/billing's "Manage
// billing" button, shown once an org has an active Basic/Pro subscription.
// Same shape as create-checkout-session (and, before that,
// impersonate-user): browser-invoked via supabase.functions.invoke(), real
// CORS handling, a per-request caller-identifying client alongside a
// module-level service_role one, flat { error: string } JSON on failure.
//
// Per Stripe's own guidance (.agents/skills/stripe-best-practices/
// references/billing.md): self-service upgrade/downgrade/cancellation and
// payment-method updates all go through Stripe's own Customer Portal rather
// than a hand-built UI here — this function's only job is minting a Portal
// session URL to redirect to.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@22.6.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY')!;

const APP_URL = 'https://shelf-sync.chrisistinson.workers.dev';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2026-08-26.dahlia' });

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse(401, { error: 'Missing Authorization header' });
  }

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
  if (!callerProfile || callerProfile.role !== 'admin') {
    return jsonResponse(403, { error: 'Only an admin can manage billing' });
  }

  const { data: subscription } = await serviceClient
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('organization_id', callerProfile.organization_id)
    .maybeSingle();
  if (!subscription?.stripe_customer_id) {
    return jsonResponse(400, { error: 'No billing account yet — choose a plan first.' });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${APP_URL}/manage/billing`
    });
    return jsonResponse(200, { url: session.url });
  } catch (error) {
    console.error('Failed to create billing portal session:', error);
    return jsonResponse(500, { error: 'Failed to open the billing portal.' });
  }
});
