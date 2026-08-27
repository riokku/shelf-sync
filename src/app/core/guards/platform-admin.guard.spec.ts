import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { platformAdminGuard } from './platform-admin.guard';
import { AuthService } from '../auth.service';
import { createFakeAuthService, createFakeProfile } from '../../testing/fakes';

describe('platformAdminGuard', () => {
  function configure(authService: AuthService) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService }
      ]
    });
  }

  function runGuard() {
    return TestBed.runInInjectionContext(() => platformAdminGuard({} as never, {} as never));
  }

  it('allows the platform-admin account', async () => {
    configure(createFakeAuthService(createFakeProfile({ is_platform_admin: true })));
    expect(await runGuard()).toBe(true);
  });

  it('redirects an ordinary org admin to /home — this is a stricter, separate audience from adminGuard', async () => {
    configure(createFakeAuthService(createFakeProfile({ role: 'admin', is_platform_admin: false })));
    const result = await runGuard();
    expect(result).not.toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toContain('/home');
  });

  it('redirects to /home when there is no profile at all', async () => {
    configure(createFakeAuthService(null));
    const result = await runGuard();
    expect(result).not.toBe(true);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toContain('/home');
  });
});
