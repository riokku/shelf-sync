import { TestBed } from '@angular/core/testing';
import { MfaService } from './mfa.service';
import { SupabaseService } from './supabase.service';

describe('MfaService', () => {
  let service: MfaService;
  let mfa: {
    enroll: jasmine.Spy;
    challengeAndVerify: jasmine.Spy;
    unenroll: jasmine.Spy;
    listFactors: jasmine.Spy;
    getAuthenticatorAssuranceLevel: jasmine.Spy;
  };
  let rpc: jasmine.Spy;

  function configure() {
    mfa = {
      enroll: jasmine.createSpy('enroll'),
      challengeAndVerify: jasmine.createSpy('challengeAndVerify'),
      unenroll: jasmine.createSpy('unenroll'),
      listFactors: jasmine.createSpy('listFactors'),
      getAuthenticatorAssuranceLevel: jasmine.createSpy('getAuthenticatorAssuranceLevel')
    };
    rpc = jasmine.createSpy('rpc');

    TestBed.configureTestingModule({
      providers: [
        {
          provide: SupabaseService,
          useValue: { client: { auth: { mfa }, rpc } }
        }
      ]
    });

    service = TestBed.inject(MfaService);
  }

  beforeEach(() => configure());

  describe('isEnrolled() / getVerifiedTotpFactor()', () => {
    it('is true when listFactors() returns a verified totp factor', async () => {
      mfa.listFactors.and.returnValue(Promise.resolve({
        data: { totp: [{ id: 'factor-1', status: 'verified' }], all: [] },
        error: null
      }));

      expect(await service.isEnrolled()).toBeTrue();
      expect((await service.getVerifiedTotpFactor())?.id).toBe('factor-1');
    });

    it('is false when the only factor on file is unverified (an abandoned enrollment)', async () => {
      mfa.listFactors.and.returnValue(Promise.resolve({
        data: { totp: [{ id: 'factor-1', status: 'unverified' }], all: [] },
        error: null
      }));

      expect(await service.isEnrolled()).toBeFalse();
    });

    it('is false when listFactors() errors', async () => {
      mfa.listFactors.and.returnValue(Promise.resolve({ data: null, error: { message: 'nope' } }));

      expect(await service.isEnrolled()).toBeFalse();
    });
  });

  describe('isVerificationPending()', () => {
    it('is true when currentLevel is aal1 but nextLevel is aal2', async () => {
      mfa.getAuthenticatorAssuranceLevel.and.returnValue(Promise.resolve({
        data: { currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] },
        error: null
      }));

      expect(await service.isVerificationPending()).toBeTrue();
    });

    it('is false once currentLevel already matches nextLevel', async () => {
      mfa.getAuthenticatorAssuranceLevel.and.returnValue(Promise.resolve({
        data: { currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] },
        error: null
      }));

      expect(await service.isVerificationPending()).toBeFalse();
    });

    it('is false for an account with no factor at all (aal1/aal1)', async () => {
      mfa.getAuthenticatorAssuranceLevel.and.returnValue(Promise.resolve({
        data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
        error: null
      }));

      expect(await service.isVerificationPending()).toBeFalse();
    });
  });

  describe('enrollTotp()', () => {
    it('clears out a stale unverified factor before starting a new enrollment', async () => {
      mfa.listFactors.and.returnValue(Promise.resolve({
        data: { all: [{ id: 'stale-1', factor_type: 'totp', status: 'unverified' }] },
        error: null
      }));
      mfa.unenroll.and.returnValue(Promise.resolve({ data: {}, error: null }));
      mfa.enroll.and.returnValue(Promise.resolve({
        data: {
          id: 'factor-2',
          totp: { qr_code: '<svg fill="#000"></svg>', secret: 'SECRET123', uri: 'otpauth://totp/x?secret=SECRET123' }
        },
        error: null
      }));

      const result = await service.enrollTotp();

      expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'stale-1' });
      expect(result.error).toBeNull();
      // Hands back the raw otpauth:// uri, not Supabase's own qr_code SVG
      // string — see enrollTotp()'s own doc comment for why: two earlier
      // attempts at rendering that SVG string directly as a data: URL both
      // failed in a real browser, so the caller renders its own QR image
      // from this uri instead (via the same `qrcode` package
      // QrLabelModalComponent already uses).
      expect(result.enrollment).toEqual({
        factorId: 'factor-2',
        uri: 'otpauth://totp/x?secret=SECRET123',
        secret: 'SECRET123'
      });
    });

    it('leaves a verified factor alone while clearing stale ones', async () => {
      mfa.listFactors.and.returnValue(Promise.resolve({
        data: {
          all: [
            { id: 'verified-1', factor_type: 'totp', status: 'verified' },
            { id: 'stale-1', factor_type: 'totp', status: 'unverified' }
          ]
        },
        error: null
      }));
      mfa.unenroll.and.returnValue(Promise.resolve({ data: {}, error: null }));
      mfa.enroll.and.returnValue(Promise.resolve({
        data: { id: 'factor-2', totp: { qr_code: '<svg></svg>', secret: 'SECRET123' } },
        error: null
      }));

      await service.enrollTotp();

      expect(mfa.unenroll).toHaveBeenCalledOnceWith({ factorId: 'stale-1' });
    });

    it('surfaces the error message on failure', async () => {
      mfa.listFactors.and.returnValue(Promise.resolve({ data: { all: [] }, error: null }));
      mfa.enroll.and.returnValue(Promise.resolve({ data: null, error: { message: 'Too many factors.' } }));

      const result = await service.enrollTotp();

      expect(result.enrollment).toBeNull();
      expect(result.error).toBe('Too many factors.');
    });
  });

  describe('confirmEnrollment() / verifyLogin()', () => {
    it('confirmEnrollment() challenges and verifies the given factor/code', async () => {
      mfa.challengeAndVerify.and.returnValue(Promise.resolve({ data: {}, error: null }));

      const error = await service.confirmEnrollment('factor-1', '123456');

      expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
      expect(error).toBeNull();
    });

    it('confirmEnrollment() surfaces an invalid-code error', async () => {
      mfa.challengeAndVerify.and.returnValue(Promise.resolve({ data: null, error: { message: 'Invalid code.' } }));

      expect(await service.confirmEnrollment('factor-1', '000000')).toBe('Invalid code.');
    });

    it('verifyLogin() uses the same underlying call', async () => {
      mfa.challengeAndVerify.and.returnValue(Promise.resolve({ data: {}, error: null }));

      await service.verifyLogin('factor-1', '123456');

      expect(mfa.challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
    });
  });

  describe('isRequiredOrgWide()', () => {
    it('is true when the RPC returns true', async () => {
      rpc.and.returnValue(Promise.resolve({ data: true, error: null }));

      expect(await service.isRequiredOrgWide()).toBeTrue();
      expect(rpc).toHaveBeenCalledWith('current_org_requires_mfa');
    });

    it('is false when the RPC returns false', async () => {
      rpc.and.returnValue(Promise.resolve({ data: false, error: null }));

      expect(await service.isRequiredOrgWide()).toBeFalse();
    });

    it('fails closed to false on an RPC error', async () => {
      rpc.and.returnValue(Promise.resolve({ data: null, error: { message: 'nope' } }));

      expect(await service.isRequiredOrgWide()).toBeFalse();
    });
  });

  describe('unenroll()', () => {
    it('returns null on success', async () => {
      mfa.unenroll.and.returnValue(Promise.resolve({ data: {}, error: null }));

      expect(await service.unenroll('factor-1')).toBeNull();
      expect(mfa.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' });
    });

    it('surfaces the error message on failure', async () => {
      mfa.unenroll.and.returnValue(Promise.resolve({ data: null, error: { message: 'nope' } }));

      expect(await service.unenroll('factor-1')).toBe('nope');
    });
  });
});
