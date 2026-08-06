import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';

export const adminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const profile = await authService.getProfile();
  return profile?.role === 'admin' ? true : router.createUrlTree(['/home']);
};
