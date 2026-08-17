import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { manageGuard } from './manage.guard';
import { AuthService } from '../auth.service';
import { createFakeAuthService, createFakeProfile } from '../../testing/fakes';

describe('manageGuard', () => {
  function configure(authService: AuthService) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService }
      ]
    });
  }

  function runGuard() {
    return TestBed.runInInjectionContext(() => manageGuard({} as never, {} as never));
  }

  it('allows an admin', async () => {
    configure(createFakeAuthService(createFakeProfile({ role: 'admin' })));
    expect(await runGuard()).toBe(true);
  });

  it('allows a manager', async () => {
    configure(createFakeAuthService(createFakeProfile({ role: 'manager' })));
    expect(await runGuard()).toBe(true);
  });

  it('redirects staff to /home', async () => {
    configure(createFakeAuthService(createFakeProfile({ role: 'staff' })));
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
