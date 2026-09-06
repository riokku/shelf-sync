import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { approvedGuard } from './approved.guard';
import { AuthService } from '../auth.service';
import { MfaService } from '../mfa.service';
import { createFakeAuthService, createFakeMfaService, createFakeProfile } from '../../testing/fakes';

describe('approvedGuard', () => {
  function configure(authService: AuthService, mfaService: MfaService = createFakeMfaService()) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: MfaService, useValue: mfaService }
      ]
    });
  }

  function runGuard(url = '/inventory') {
    return TestBed.runInInjectionContext(() =>
      approvedGuard({} as never, { url } as never)
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

  it('redirects to /pending-approval for an otherwise-approved but platform-locked account', async () => {
    configure(createFakeAuthService(
      createFakeProfile({ membership_status: 'approved', account_locked_at: '2026-01-01T00:00:00.000Z' }),
      { hasSession: true }
    ));
    const result = await runGuard();
    expect(result).not.toBe(true);
    expect(serialize(result as UrlTree)).toContain('/pending-approval');
  });

  it('redirects to /mfa-verify when this session still owes a two-factor challenge', async () => {
    configure(
      createFakeAuthService(createFakeProfile({ membership_status: 'approved' }), { hasSession: true }),
      createFakeMfaService({ isVerificationPending: true })
    );
    const result = await runGuard();
    expect(result).not.toBe(true);
    expect(serialize(result as UrlTree)).toContain('/mfa-verify');
  });

  it('checks the MFA challenge before the membership status, ahead of /pending-approval', async () => {
    // Deliberately combines "still owes a challenge" with "not yet
    // approved" — /mfa-verify should still win, per approvedGuard's own
    // doc comment on why that check runs first.
    configure(
      createFakeAuthService(createFakeProfile({ membership_status: 'pending' }), { hasSession: true }),
      createFakeMfaService({ isVerificationPending: true })
    );
    const result = await runGuard();
    expect(serialize(result as UrlTree)).toContain('/mfa-verify');
  });

  describe('org-wide "require two-factor" (never enrolled at all)', () => {
    it('redirects to /account when the org requires it and this account has no factor', async () => {
      configure(
        createFakeAuthService(createFakeProfile({ membership_status: 'approved' }), { hasSession: true }),
        createFakeMfaService({ isRequiredOrgWide: true, isEnrolled: false })
      );
      const result = await runGuard();
      expect(result).not.toBe(true);
      expect(serialize(result as UrlTree)).toContain('/account');
    });

    it('allows navigation straight to /account itself, so the person can actually comply', async () => {
      configure(
        createFakeAuthService(createFakeProfile({ membership_status: 'approved' }), { hasSession: true }),
        createFakeMfaService({ isRequiredOrgWide: true, isEnrolled: false })
      );
      expect(await runGuard('/account')).toBe(true);
    });

    it('does not redirect when the org requires it but this account is already enrolled', async () => {
      configure(
        createFakeAuthService(createFakeProfile({ membership_status: 'approved' }), { hasSession: true }),
        createFakeMfaService({ isRequiredOrgWide: true, isEnrolled: true })
      );
      expect(await runGuard()).toBe(true);
    });

    it('does not redirect when the org does not require it, even with nothing enrolled', async () => {
      configure(
        createFakeAuthService(createFakeProfile({ membership_status: 'approved' }), { hasSession: true }),
        createFakeMfaService({ isRequiredOrgWide: false, isEnrolled: false })
      );
      expect(await runGuard()).toBe(true);
    });

    it('/mfa-verify still wins over the org-requirement redirect when this session owes a challenge', async () => {
      configure(
        createFakeAuthService(createFakeProfile({ membership_status: 'approved' }), { hasSession: true }),
        createFakeMfaService({ isVerificationPending: true, isRequiredOrgWide: true, isEnrolled: false })
      );
      const result = await runGuard();
      expect(serialize(result as UrlTree)).toContain('/mfa-verify');
    });
  });
});
