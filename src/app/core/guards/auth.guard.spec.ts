import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';
import { AuthService } from '../auth.service';
import { createFakeAuthService, createFakeProfile } from '../../testing/fakes';

describe('authGuard', () => {
  function configure(authService: AuthService) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService }
      ]
    });
  }

  function runGuard(url = '/inventory') {
    // CanActivateFn relies on inject() internally, so it has to run inside
    // an Angular injection context — TestBed.runInInjectionContext is the
    // standard way to do that for a functional guard under test.
    return TestBed.runInInjectionContext(() =>
      authGuard(
        {} as never,
        { url } as never
      )
    );
  }

  it('allows navigation when a session exists', async () => {
    configure(createFakeAuthService(createFakeProfile(), { hasSession: true }));
    const result = await runGuard();
    expect(result).toBe(true);
  });

  it('redirects to /login with a returnUrl preserving the attempted deep link when there is no session', async () => {
    configure(createFakeAuthService(null, { hasSession: false }));
    const result = await runGuard('/inventory?item=abc123');

    expect(result).not.toBe(true);
    const router = TestBed.inject(Router);
    const serialized = router.serializeUrl(result as UrlTree);
    expect(serialized).toContain('/login');
    expect(serialized).toContain(encodeURIComponent('/inventory?item=abc123'));
  });
});
