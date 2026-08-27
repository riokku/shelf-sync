import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';

/** Same shape as adminGuard, checking is_platform_admin instead of
 *  role === 'admin' — this is a different, stricter audience: the app's own
 *  maintainer, not any org's own admin. See the add_platform_admin
 *  migration and AuthService.isPlatformAdmin's own doc comments. */
export const platformAdminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const profile = await authService.getProfile();
  return profile?.is_platform_admin === true ? true : router.createUrlTree(['/home']);
};
