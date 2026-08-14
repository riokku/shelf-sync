import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';

/** Same session check as authGuard, plus a membership check — used on every
 *  protected route except /pending-approval itself (which stays on plain
 *  authGuard; guarding it with this too would just bounce it back to
 *  itself). A profile that's missing entirely (denied/removed) or still
 *  `pending` both redirect to /pending-approval rather than into the app. */
export const approvedGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const session = await authService.getSession();
  if (!session) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  const profile = await authService.getProfile();
  if (!profile || profile.membership_status !== 'approved') {
    return router.createUrlTree(['/pending-approval']);
  }

  return true;
};
