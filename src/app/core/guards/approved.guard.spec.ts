import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { approvedGuard } from './approved.guard';
import { AuthService } from '../auth.service';
import { createFakeAuthService, createFakeProfile } from '../../testing/fakes';

describe('approvedGuard', () => {
  function configure(authService: AuthService) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService }
      ]
    });
  }

  function runGuard() {
    return TestBed.runInInjectionContext(() =>
      approvedGuard({} as never, { url: '/inventory' } as never)
    );
  }

  function serialize(result: UrlTree) {
    return TestBed.inject(Router).serializeUrl(result);
  }

  it('allows navigation for an approved member', async () => {
    configure(createFakeAuthService(createFakeProfile({ membership_status: 'approved' }), { hasSession: true }));
    expect(await runGuard()).toBe(true);
  });

  it('redirects to /login when there is no session at all', async () => {
    configure(createFakeAuthService(null, { hasSession: false }));
    const result = await runGuard();
    expect(result).not.toBe(true);
    expect(serialize(result as UrlTree)).toContain('/login');
  });

  it('redirects to /pending-approval when there is a session but no profile row (denied/removed)', async () => {
    configure(createFakeAuthService(null, { hasSession: true }));
    const result = await runGuard();
    expect(result).not.toBe(true);
    expect(serialize(result as UrlTree)).toContain('/pending-approval');
  });

  it('redirects to /pending-approval when the profile is still pending', async () => {
    configure(createFakeAuthService(createFakeProfile({ membership_status: 'pending' }), { hasSession: true }));
    const result = await runGuard();
    expect(result).not.toBe(true);
    expect(serialize(result as UrlTree)).toContain('/pending-approval');
  });
});
