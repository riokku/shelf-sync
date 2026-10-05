-- Optional, self-enrolled two-factor authentication (TOTP), enforced at the
-- same choke-point functions every other fail-closed check in this schema
-- already funnels through — current_user_org_id() for ordinary org-scoped
-- access, is_platform_admin() for the Studio/impersonation surface
-- specifically (the single scariest capability in this app, so it gets its
-- own explicit gate rather than relying solely on current_user_org_id()'s).
--
-- Deliberately opt-in, not org-wide-mandatory: the moment *this* account
-- enrolls a verified TOTP factor, every one of its own sessions is required
-- to be at aal2 (Supabase's own "did this session actually complete an MFA
-- challenge" claim, present on every JWT as `aal`) before either function
-- will resolve anything for it. An account that's never enrolled sees zero
-- behavior change — the added clause only ever evaluates true (falls
-- through to the existing checks) when no verified factor exists yet.
--
-- The client mirrors this via a new approvedGuard check (redirects to
-- /mfa-verify) and LoginComponent's own post-sign-in check, but neither is
-- what actually enforces anything — same "the server is what actually
-- enforces it, the client hint is UX only" reasoning is_locked's own RLS
-- `with check` clause already established elsewhere in this schema. A raw
-- API call with a valid aal1-only JWT is blocked here regardless of what
-- any client does.
--
-- Enrollment/verification/unenrollment themselves go entirely through
-- supabase-js's own `auth.mfa.*` client methods (MfaService,
-- core/mfa.service.ts) against Supabase Auth's own auth.mfa_factors table —
-- there is no app-level table or RPC for this, since GoTrue already owns
-- the whole enrollment lifecycle. Reading auth.mfa_factors directly from a
-- SECURITY DEFINER function here works the same way this schema's existing
-- storage.objects reads already do (see get_inventory_photo_storage_usage) —
-- confirmed directly against the hosted project before writing this
-- migration, not just assumed, per this repo's own "a function compiling
-- isn't enough, run it for real" lesson.
--
-- Known gap, deliberately not solved here: Supabase's own TOTP factors have
-- no backup/recovery-code mechanism. Losing the authenticator device with
-- no other platform admin around means recovery is a manual
-- `auth.mfa_factors` delete run directly against the hosted project (the
-- same "real sensitive one-off, not app-mediated" category this schema's
-- own `is_platform_admin` flag already sits in) rather than anything
-- self-service — acceptable for a single-admin app at this stage, but worth
-- revisiting (backup codes, or a second platform admin as a recovery path)
-- before this is ever required rather than opt-in.

-- Diffed against add_platform_account_lock's version (the latest at the
-- time — see that migration's own definition) per this repo's own "diff
-- against the previous version" rule: the only change is the added
-- aal2-or-no-verified-factor clause, ANDed alongside the existing
-- membership/org/lock checks exactly the way each of those was added one at
-- a time in earlier migrations.
create or replace function public.current_user_org_id()
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select p.organization_id
  from public.profiles p
  join public.organizations o on o.id = p.organization_id
  where p.id = auth.uid() and p.membership_status = 'approved' and o.deleted_at is null and o.suspended_at is null
    and p.account_locked_at is null
    and (
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      )
    );
$$;

-- Diffed against fix_platform_admin_lock_bypass's version (the latest at
-- the time). Same clause, same reasoning, applied here too rather than
-- relying on current_user_org_id() alone — is_platform_admin() gates
-- Studio's own RPCs (including platform_lock_user_account/impersonation)
-- directly, with no dependency on current_user_org_id() at all, so without
-- this a locked-out-of-ordinary-access-but-somehow-still-aal1 platform
-- admin session would keep every platform-level capability regardless.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (
      select is_platform_admin
      from public.profiles
      where id = auth.uid()
        and account_locked_at is null
        and (
          coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
          or not exists (
            select 1 from auth.mfa_factors f
            where f.user_id = auth.uid() and f.status = 'verified'
          )
        )
    ),
    false
  );
$$;
