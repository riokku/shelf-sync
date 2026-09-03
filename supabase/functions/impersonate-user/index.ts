// Backs ImpersonationService.start() — StudioUserDetailComponent's "Impersonate"
// button, platform-admin-only troubleshooting (see impersonation_sessions'
// own migration comment and CLAUDE.md's Project Overview for the full
// feature). This app's first Edge Function ever invoked directly from the
// browser (supabase.functions.invoke()) rather than only from a Postgres
// trigger/pg_cron the way send-notification-email always is — so it's also
// the first one that needs real CORS handling, and the first one
// authenticated by a genuine signed-in caller's own JWT (verify_jwt stays at
// its default `true` — no config.toml entry, unlike that function's
// verify_jwt = false, which exists specifically because *it* has no user
// JWT to check).
//
// Only the Auth Admin API (the service_role key, which every Edge Function
// already gets injected automatically) can mint a session for a *different*
// user — Postgres/RLS has no equivalent. admin.generateLink({ type:
// 'magiclink' }) is the standard workaround: it returns a hashed_token
// without ever actually sending an email (only a `send*`-shaped call does
// that), which the client then exchanges for a real session via
// supabase.auth.verifyOtp() on the app's one shared client — replacing the
// platform admin's own session with the target's, in place. Everything
// downstream (every page's queries, every guard, RLS) just naturally
// reflects the target user because it genuinely is their session; nothing
// here needs to know that.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Bypasses RLS entirely — used for every read/write below once the caller
// has been confirmed a platform admin, same "already-injected service_role
// key" trust level send-notification-email's own supabase constant has.
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ImpersonateRequestBody {
  targetUserId?: string;
  reason?: string;
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

  // Scoped to the caller's own JWT purely to identify who's calling —
  // everything this function actually does runs through serviceClient
  // above instead, once that identity has been confirmed a platform admin.
  const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) {
    return jsonResponse(401, { error: 'Not signed in' });
  }

  const { data: callerProfile } = await serviceClient
    .from('profiles')
    .select('is_platform_admin')
    .eq('id', caller.id)
    .maybeSingle();
  if (!callerProfile?.is_platform_admin) {
    return jsonResponse(403, { error: 'Only platform admins can impersonate a user' });
  }

  let body: ImpersonateRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body' });
  }
  const targetUserId = body.targetUserId;
  const reason = body.reason?.trim();
  if (!targetUserId || !reason) {
    return jsonResponse(400, { error: 'targetUserId and reason are required' });
  }
  if (targetUserId === caller.id) {
    return jsonResponse(400, { error: 'You cannot impersonate your own account' });
  }

  const { data: targetProfile } = await serviceClient
    .from('profiles')
    .select('*')
    .eq('id', targetUserId)
    .maybeSingle();
  if (!targetProfile) {
    return jsonResponse(404, { error: 'User not found' });
  }
  if (targetProfile.is_platform_admin) {
    return jsonResponse(400, { error: 'Cannot impersonate another platform admin' });
  }

  const { data: targetAuthUser, error: getUserError } = await serviceClient.auth.admin.getUserById(targetUserId);
  const targetEmail = targetAuthUser?.user?.email;
  if (getUserError || !targetEmail) {
    console.error('Failed to resolve target user email:', getUserError);
    return jsonResponse(404, { error: "Could not resolve this user's login email" });
  }

  // Generates the token without sending anything — see this file's own top
  // comment. hashed_token is what verifyOtp() on the client exchanges for a
  // real session.
  const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail
  });
  const hashedToken = linkData?.properties?.hashed_token;
  if (linkError || !hashedToken) {
    console.error('Failed to generate impersonation link:', linkError);
    return jsonResponse(500, { error: 'Failed to start impersonation session' });
  }

  const { data: targetOrg } = await serviceClient
    .from('organizations')
    .select('name')
    .eq('id', targetProfile.organization_id)
    .maybeSingle();

  // impersonation_sessions has no INSERT policy for authenticated/anon at
  // all (add_impersonation_sessions) — this service-role insert is the only
  // way a row is ever created, same shape notifications' own insert-only-via-
  // send-notification-email already established.
  const { error: insertError } = await serviceClient.from('impersonation_sessions').insert({
    platform_admin_id: caller.id,
    target_user_id: targetUserId,
    target_label: targetProfile.nickname || targetProfile.full_name || targetEmail,
    target_organization_id: targetProfile.organization_id,
    target_organization_label: targetOrg?.name ?? 'Unknown organization',
    reason
  });
  if (insertError) {
    console.error('Failed to log impersonation session:', insertError);
    return jsonResponse(500, { error: 'Failed to start impersonation session' });
  }

  return jsonResponse(200, { email: targetEmail, hashedToken });
});
