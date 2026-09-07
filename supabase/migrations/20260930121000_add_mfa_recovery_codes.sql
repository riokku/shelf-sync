-- Closes the "known gap, deliberately not solved" add_mfa_enforcement's own
-- doc comment flagged: Supabase's own TOTP factors have no backup/recovery-
-- code mechanism, so losing the authenticator device meant a manual
-- auth.mfa_factors delete run directly against the hosted project — fine
-- for a single-admin app, not fine once more than one account has enrolled.
--
-- Recovery codes are this app's own addition on top of Supabase Auth's MFA,
-- not a Supabase Auth feature — GoTrue has no "verify via backup code" API,
-- and the aal2 claim RLS gates on (current_user_org_id()/is_platform_admin(),
-- see add_mfa_enforcement) is only ever set by GoTrue's own real MFA verify
-- flow, so a custom code can never directly forge it. Instead, redeeming a
-- valid code deletes the account's lost TOTP factor via the Auth Admin API
-- (auth.admin.mfa.deleteFactor(), called from a new mfa-recover Edge
-- Function — see that function's own doc comment) — current_user_org_id()'s
-- existing "aal2, or no verified factor exists" escape hatch (or, for an org
-- that requires MFA, current_org_requires_mfa()'s own narrowing of that same
-- clause) then falls through correctly on the very next query, since that
-- check re-queries auth.mfa_factors live rather than reading a cached claim
-- off the JWT. No session/JWT refresh is needed for this to take effect.
--
-- mfa_recovery_codes has no SELECT/INSERT/UPDATE/DELETE grant for
-- authenticated/anon at all — every access goes through the three
-- SECURITY DEFINER functions below, the same "sensitive table, RPC-only"
-- shape notifications/subscriptions already establish. Codes are stored as
-- a salted-free SHA-256 hash (pgcrypto's digest(), already available on this
-- project in the extensions schema — confirmed live before writing this,
-- not just assumed, per this repo's own "run it for real" rule) rather than
-- plaintext; a fast hash is an accepted, standard choice here specifically
-- because these are server-generated, high-entropy (64-bit) random codes,
-- not user-chosen low-entropy secrets — the slow-hash rationale for
-- passwords doesn't apply.
create table public.mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index mfa_recovery_codes_user_id_idx on public.mfa_recovery_codes (user_id);

alter table public.mfa_recovery_codes enable row level security;

-- Generates a fresh set of 10 codes, replacing (not appending to) whatever
-- set already existed — the standard "regenerating invalidates the old set"
-- behavior every recovery-code implementation uses, so a leaked or
-- partially-used batch can be fully retired with one action. Returns the
-- plaintext codes exactly once; only their hashes are ever persisted. Called
-- right after TwoFactorSetupModalComponent's own confirmEnrollment()
-- succeeds (first-time setup) and from AccountComponent's own "Regenerate
-- recovery codes" button (on demand) — both already-authenticated, normal
-- calls with no extra gate needed beyond auth.uid() itself.
--
-- Each code is 8 random bytes (gen_random_bytes(), pgcrypto's own CSPRNG,
-- not a weaker PRNG) hex-encoded to a 16-character code — 64 bits of
-- entropy, plenty for a single-use secret that isn't exposed to online
-- guessing the way a password is (the redeem RPC below has no attempt
-- counter/lockout of its own, deliberately — see that function's own
-- comment for why this is an accepted tradeoff, not an oversight).
create or replace function public.generate_mfa_recovery_codes()
returns text[]
language plpgsql
security definer set search_path = public
as $$
declare
  v_codes text[] := '{}';
  v_code text;
  i integer;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  delete from public.mfa_recovery_codes where user_id = auth.uid();

  for i in 1..10 loop
    v_code := encode(extensions.gen_random_bytes(8), 'hex');
    v_codes := array_append(v_codes, v_code);
    insert into public.mfa_recovery_codes (user_id, code_hash)
      values (auth.uid(), encode(extensions.digest(v_code, 'sha256'), 'hex'));
  end loop;

  return v_codes;
end;
$$;

grant execute on function public.generate_mfa_recovery_codes() to authenticated;

-- How many unused codes are left — backs AccountComponent's own "N codes
-- remaining" line, so someone burning through their set during real
-- recoveries (or just experimenting) has a visible signal to regenerate
-- before they're actually locked out with none left.
create or replace function public.get_mfa_recovery_code_count()
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::integer from public.mfa_recovery_codes
  where user_id = auth.uid() and used_at is null;
$$;

grant execute on function public.get_mfa_recovery_code_count() to authenticated;

-- Called from the mfa-recover Edge Function via the caller's own forwarded
-- JWT (not the service_role client) specifically so auth.uid() here
-- resolves to the actual account trying to recover, the same "identify via
-- the caller's own client, act via service_role only once that's confirmed"
-- split every Edge Function in this app already uses. Strips anything that
-- isn't a hex digit and lowercases before hashing, so "a1b2-c3d4-e5f6-a7b8"
-- (as displayed) and "A1B2C3D4E5F6A7B8" (typed back without the dashes, any
-- case) both match the same stored hash. The match-and-mark-used step is one
-- atomic `update ... where ... and used_at is null returning id` rather than
-- a separate select-then-update, so two concurrent redemption attempts with
-- the same code can't both succeed.
--
-- No attempt-counter/lockout here — same "rate limiting is out of scope"
-- reasoning this repo's own security-review passes already exclude, and the
-- 64-bit code space makes online guessing impractical regardless; the real
-- protection is that a code only works once and the whole set can be
-- invalidated by regenerating.
create or replace function public.redeem_mfa_recovery_code(p_code text)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_normalized text;
  v_hash text;
  v_matched_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  v_normalized := lower(regexp_replace(p_code, '[^a-fA-F0-9]', '', 'g'));
  if v_normalized = '' then
    return false;
  end if;
  v_hash := encode(extensions.digest(v_normalized, 'sha256'), 'hex');

  update public.mfa_recovery_codes
    set used_at = now()
    where user_id = auth.uid() and code_hash = v_hash and used_at is null
    returning id into v_matched_id;

  return v_matched_id is not null;
end;
$$;

grant execute on function public.redeem_mfa_recovery_code(text) to authenticated;
