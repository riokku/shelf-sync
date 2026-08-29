import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';

/** Same session check as authGuard, plus a membership check — used on every
 *  protected route except /pending-approval itself (which stays on plain
 *  authGuard; guarding it with this too would just bounce it back to
 *  itself). A profile that's missing entirely (denied/removed), still
 *  `pending`, or platform-locked (account_locked_at — see the
 *  add_platform_account_lock migration and StudioUserDetailComponent's own
 *  lock toggle) all redirect to /pending-approval rather than into the app;
 *  that page itself tells the three cases apart (see its own doc comment).
 *  Checked explicitly here, not left to current_user_org_id() failing every
 *  org-scoped query — profiles' own SELECT policy always lets a caller read
 *  their *own* row regardless of lock state (see create_organizations.sql's
 *  "Users can always view their own profile" policy), so getProfile() never
 *  fails for a locked user the way it would for e.g. a genuinely deleted
 *  profile; only an explicit check here catches it before letting them
 *  wander into a page full of RLS-blocked, silently-empty queries. */
export const approvedGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const session = await authService.getSession();
  if (!session) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  const profile = await authService.getProfile();
  if (!profile || profile.membership_status !== 'approved' || profile.account_locked_at) {
    return router.createUrlTree(['/pending-approval']);
  }

  return true;
};
