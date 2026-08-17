import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { adminGuard } from './admin.guard';
import { AuthService } from '../auth.service';
import { createFakeAuthService, createFakeProfile } from '../../testing/fakes';

describe('adminGuard', () => {
  function configure(authService: AuthService) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService }
      ]
    });
  }

  function runGuard() {
    return TestBed.runInInjectionContext(() => adminGuard({} as never, {} as never));
  }

  it('allows an admin', async () => {
    configure(createFakeAuthService(createFakeProfile({ role: 'admin' })));
    expect(await runGuard()).toBe(true);
  });

  it('redirects a manager to /home — this guard is stricter than manageGuard', async () => {
    configure(createFakeAuthService(createFakeProfile({ role: 'manager' })));
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
