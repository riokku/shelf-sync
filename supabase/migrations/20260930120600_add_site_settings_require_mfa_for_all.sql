-- Org-wide "require two-factor authentication" toggle — the natural next
-- step add_mfa_enforcement's own doc comment flagged as unbuilt: two-factor
-- there is opt-in per account, with nothing making an org actually require
-- it. This adds a per-org site_settings.require_mfa_for_all switch
-- (Settings > Workflow's new "Security" card) that, once on, means every
-- approved member of that org must have a verified TOTP factor before
-- current_user_org_id() will resolve anything for them — not just "verify
-- this session" (that's what an already-enrolled account's aal2 check
-- already does), but "enroll at all".
--
-- Default false preserves every existing org's behavior unchanged — two-
-- factor stays purely opt-in until an admin turns this on for their org.
--
-- The tricky part: current_user_org_id() is what site_settings' own SELECT
-- policy is scoped by (organization_id = current_user_org_id()), so if the
-- new clause were evaluated by reading site_settings directly inside
-- current_user_org_id() itself, an org that turns this on would immediately
-- make its own site_settings row unreadable to every member who hasn't
-- enrolled yet — including the moment right after the toggle flips, before
-- anyone's had a chance to see why. current_org_requires_mfa() below is a
-- separate SECURITY DEFINER function specifically so this read bypasses RLS
-- entirely (same "bypass RLS for a controlled, narrow purpose" reasoning
-- current_user_role()/current_user_org_id()/is_platform_admin() themselves
-- already rely on) — it has to be answerable independently of whether the
-- enforcement it drives has already kicked in for the caller asking. The
-- client calls it directly as an RPC (MfaService.isRequiredOrgWide(), used
-- by approvedGuard/LoginComponent/AccountComponent) for the exact same
-- reason: a plain `site_settings.select()` would hit the same chicken-and-
-- egg RLS wall on the client side too.
--
-- The column has to exist before current_org_requires_mfa() below can
-- reference it — a plain `create or replace function` doesn't defer
-- resolving the columns its body mentions the way a view definition might
-- appear to.
alter table public.site_settings
  add column require_mfa_for_all boolean not null default false;

create or replace function public.current_org_requires_mfa()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (
      select s.require_mfa_for_all
      from public.profiles p
      left join public.site_settings s on s.organization_id = p.organization_id
      where p.id = auth.uid()
    ),
    false
  );
$$;

-- Diffed against add_mfa_enforcement's version (the latest at the time) per
-- this repo's own "diff against the previous version" rule: the only change
-- is narrowing the existing "aal2, or no verified factor exists" escape
-- hatch to also require the org not to be one that's opted into this. An
-- account with a verified factor is unaffected either way (still just needs
-- aal2, same as before); an unenrolled account in a non-requiring org is
-- also unaffected (still passes through the existing exists-check branch);
-- only an unenrolled account in a requiring org newly fails this check —
-- which is exactly the point, and is what forces approvedGuard's redirect
-- to /account (see that guard's own updated doc comment) since there's no
-- verified factor yet to challenge against via /mfa-verify.
--
-- Deliberately does NOT touch is_platform_admin() — that gate is for
-- Studio's cross-org surface specifically, which isn't scoped to any one
-- org's own site_settings row (a platform admin administers many orgs, or
-- none), so no per-org toggle should be able to affect it either way.
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
      or (
        not public.current_org_requires_mfa()
        and not exists (
          select 1 from auth.mfa_factors f
          where f.user_id = auth.uid() and f.status = 'verified'
        )
      )
    );
$$;
