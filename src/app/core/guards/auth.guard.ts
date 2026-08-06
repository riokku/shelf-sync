import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const session = await authService.getSession();
  if (session) {
    return true;
  }

  // Preserves deep links (e.g. inventory?item=<id>) through a login
  // redirect — LoginComponent reads this back and navigates there instead
  // of the plain /home landing page once the user's actually signed in.
  return router.createUrlTree(['/'], { queryParams: { returnUrl: state.url } });
};
