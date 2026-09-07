// Backs MfaService.redeemRecoveryCode() — the /mfa-verify "lost your
// device" path (see add_mfa_recovery_codes' own migration comment for the
// full feature). Same shape impersonate-user already established for this
// app's second directly-browser-invoked Edge Function: real CORS handling,
// a per-request caller-identifying client (the caller's own forwarded
// Authorization header against the anon key, used only for
// `.auth.getUser()`/the actual redeem RPC call) alongside a module-level
// service_role client, a flat `{ error: string }` JSON body on every
// non-2xx response. verify_jwt stays at its config.toml default `true` —
// this always has a real signed-in caller (an aal1 session from a normal
// password sign-in — MFA enrollment never blocks that, only the
// subsequent org-scoped access does), unlike send-notification-email's own
// `verify_jwt = false`.
//
// Unlike impersonate-user, this never takes a target user id at all — it
// only ever acts on the caller's own account (auth.uid(), resolved from
// their own JWT), so there's no cross-user targeting surface to gate in
// the first place.
//
// The actual code check (hash, normalize, mark-used) happens entirely in
// Postgres via redeem_mfa_recovery_code() — called through callerClient
// (the caller's own JWT), not serviceClient, specifically so that RPC's own
// auth.uid() resolves to the real caller rather than nothing (a
// service_role call has no `sub` claim at all). Only once that RPC reports
// a genuine match does this function reach for the one thing only
// service_role can do: removing the account's lost TOTP factor(s) via the
// Auth Admin API (auth.admin.mfa.deleteFactor()), which is what actually
// lets current_user_org_id()'s "aal2, or no verified factor exists" RLS
// check fall through again on this account's very next query — no session/
// JWT refresh needed, since that check re-queries auth.mfa_factors live.
//
// deleteFactor()'s own documented behavior: removing a *verified* factor
// signs the account out of every active session, including the one making
// this very request. MfaService.redeemRecoveryCode()'s own doc comment
// covers what the client does about that (sign out for real, send the user
// back to /login) — nothing here needs to account for it beyond knowing it
// will happen.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Bypasses RLS entirely — used only for the one thing that needs it below
// (removing the caller's own TOTP factor via the Admin API), same trust
// level impersonate-user's own serviceClient already establishes.
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface RecoverRequestBody {
  code?: string;
}

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

  // Identifies the caller *and* is what redeem_mfa_recovery_code() itself
  // runs as below — its own auth.uid() has to resolve to this exact caller.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) {
    return jsonResponse(401, { error: 'Not signed in' });
  }

  let body: RecoverRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body' });
  }
  const code = body.code?.trim();
  if (!code) {
    return jsonResponse(400, { error: 'A recovery code is required' });
  }

  const { data: redeemed, error: redeemError } = await callerClient.rpc('redeem_mfa_recovery_code', { p_code: code });
  if (redeemError) {
    console.error('redeem_mfa_recovery_code failed:', redeemError);
    return jsonResponse(500, { error: 'Failed to check that recovery code.' });
  }
  if (!redeemed) {
    return jsonResponse(400, { error: 'That recovery code is invalid or has already been used.' });
  }

  const { data: factorsData, error: listError } = await serviceClient.auth.admin.mfa.listFactors({ userId: caller.id });
  if (listError) {
    // The code is already marked used at this point — logged, not
    // surfaced as a failure to redeem, since retrying would just report
    // "invalid or already used" and leave the caller stuck. The lost
    // factor(s) may still need a manual cleanup in this case; worth
    // knowing about via the function's own logs.
    console.error('Failed to list factors after a valid recovery code redemption:', listError);
    return jsonResponse(200, { success: true });
  }

  const totpFactors = (factorsData?.factors ?? []).filter(factor => factor.factor_type === 'totp');
  for (const factor of totpFactors) {
    const { error: deleteError } = await serviceClient.auth.admin.mfa.deleteFactor({ id: factor.id, userId: caller.id });
    if (deleteError) {
      console.error(`Failed to delete factor ${factor.id} after a valid recovery code redemption:`, deleteError);
    }
  }

  return jsonResponse(200, { success: true });
});
