import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';

export const manageGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const profile = await authService.getProfile();
  const canManage = profile?.role === 'admin' || profile?.role === 'manager';
  return canManage ? true : router.createUrlTree(['/home']);
};
