import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { MfaService } from '../mfa.service';

/** Same session check as authGuard, plus a membership check — used on every
 *  protected route except /pending-approval and /mfa-verify themselves
 *  (which stay on plain authGuard; guarding either with this too would just
 *  bounce it back to itself). A profile that's missing entirely
 *  (denied/removed), still `pending`, or platform-locked (account_locked_at
 *  — see the add_platform_account_lock migration and
 *  StudioUserDetailComponent's own lock toggle) all redirect to
 *  /pending-approval rather than into the app; that page itself tells the
 *  three cases apart (see its own doc comment). Checked explicitly here, not
 *  left to current_user_org_id() failing every org-scoped query — profiles'
 *  own SELECT policy always lets a caller read their *own* row regardless of
 *  lock state (see create_organizations.sql's "Users can always view their
 *  own profile" policy), so getProfile() never fails for a locked user the
 *  way it would for e.g. a genuinely deleted profile; only an explicit check
 *  here catches it before letting them wander into a page full of
 *  RLS-blocked, silently-empty queries.
 *
 *  The MFA check runs *before* the membership check, ahead of even knowing
 *  whether this profile is approved — proving it's really this person comes
 *  first, and current_user_org_id() itself now enforces the identical gate
 *  at the database layer (see the add_mfa_enforcement migration) regardless
 *  of whether this client-side check is ever reached, so there's no real
 *  scenario where getting the order "wrong" would leak anything; this is
 *  purely about landing on the more useful of two redirect targets.
 *
 *  A second, related case sits right alongside it: an org can also turn on
 *  Settings > Workflow's "Require two-factor authentication" toggle (see
 *  the add_site_settings_require_mfa_for_all migration), which means an
 *  approved member who has *never* enrolled two-factor at all — not "this
 *  session still owes a challenge," genuinely nothing set up yet — can't be
 *  sent to /mfa-verify (there's no factor there to challenge against). That
 *  case redirects to /account instead, the same page's "Two-factor
 *  authentication" card now doubling as the forced-setup step (see
 *  AccountComponent's own mfaRequiredByOrg). Exempts navigation to /account
 *  itself so the person can actually reach the page that lets them comply —
 *  every other destination bounces here until they do. Same "the server is
 *  what actually enforces it, the client hint is UX only" split as every
 *  other check in this guard: current_user_org_id() denies this caller
 *  regardless of whether this redirect is ever reached. */
export const approvedGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const mfaService = inject(MfaService);
  const router = inject(Router);

  const session = await authService.getSession();
  if (!session) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  if (await mfaService.isVerificationPending()) {
    return router.createUrlTree(['/mfa-verify'], { queryParams: { returnUrl: state.url } });
  }

  const destinationPath = state.url.split('?')[0];
  if (destinationPath !== '/account' && await mfaService.isRequiredOrgWide() && !(await mfaService.isEnrolled())) {
    return router.createUrlTree(['/account']);
  }

  const profile = await authService.getProfile();
  if (!profile || profile.membership_status !== 'approved' || profile.account_locked_at) {
    return router.createUrlTree(['/pending-approval']);
  }

  return true;
};
