import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { ImpersonationService } from './impersonation.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { createFakeAuthService, createFakeProfile } from '../testing/fakes';

const STORAGE_KEY = 'shelf-sync:impersonation';

/** Hand-rolled rather than the shared createFakeSupabaseService() — this
 *  spec needs to control functions.invoke()/auth.verifyOtp()/rpc()
 *  independently and assert exactly what each was called with, which the
 *  shared fake's chainable query builder isn't shaped for (same reasoning
 *  auth.service.spec.ts's own hand-rolled fake gives for itself). */
function createFakeSupabaseClient(options: {
  invokeResult?: { data?: unknown; error?: unknown };
  verifyOtpResult?: { data?: unknown; error?: unknown };
} = {}) {
  const invokeSpy = jasmine.createSpy('invoke')
    .and.resolveTo(options.invokeResult ?? { data: null, error: null });
  const verifyOtpSpy = jasmine.createSpy('verifyOtp')
    .and.resolveTo(options.verifyOtpResult ?? { data: {}, error: null });
  const rpcSpy = jasmine.createSpy('rpc').and.resolveTo({ data: null, error: null });

  const client = {
    functions: { invoke: invokeSpy },
    auth: { verifyOtp: verifyOtpSpy },
    rpc: rpcSpy
  };

  return { client, invokeSpy, verifyOtpSpy, rpcSpy };
}

function setup(options: {
  invokeResult?: { data?: unknown; error?: unknown };
  verifyOtpResult?: { data?: unknown; error?: unknown };
  authService?: AuthService;
} = {}) {
  const { client, invokeSpy, verifyOtpSpy, rpcSpy } = createFakeSupabaseClient(options);
  const navigateSpy = jasmine.createSpy('navigate').and.resolveTo(true);
  const authService = options.authService ?? createFakeAuthService(createFakeProfile());

  TestBed.configureTestingModule({
    providers: [
      { provide: SupabaseService, useValue: { client } },
      { provide: AuthService, useValue: authService },
      { provide: Router, useValue: { navigate: navigateSpy } }
    ]
  });

  const service = TestBed.inject(ImpersonationService);
  TestBed.flushEffects();
  return { service, invokeSpy, verifyOtpSpy, rpcSpy, navigateSpy, authService };
}

describe('ImpersonationService', () => {
  beforeEach(() => localStorage.removeItem(STORAGE_KEY));
  afterEach(() => localStorage.removeItem(STORAGE_KEY));

  it('is not impersonating by default', () => {
    const { service } = setup();
    expect(service.isImpersonating()).toBeFalse();
  });

  it('restores a previously-persisted flag on construction (survives a refresh)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      targetUserId: 'target-1',
      targetLabel: 'Alex Rivera',
      targetOrgLabel: 'Studio Rio',
      startedAt: '2026-01-01T00:00:00.000Z'
    }));

    const { service } = setup();

    expect(service.isImpersonating()).toBeTrue();
    expect(service.targetLabel()).toBe('Alex Rivera');
    expect(service.targetOrgLabel()).toBe('Studio Rio');
  });

  describe('start()', () => {
    it('sets state, persists it, and navigates to /home on success', async () => {
      const target = createFakeProfile({ id: 'target-1', full_name: 'Alex Rivera', nickname: null, email: 'alex@example.com' });
      const { service, invokeSpy, verifyOtpSpy, navigateSpy } = setup({
        invokeResult: { data: { email: 'alex@example.com', hashedToken: 'tok-123' }, error: null },
        verifyOtpResult: { data: {}, error: null }
      });

      const error = await service.start(target, 'Studio Rio', 'Investigating missing items');

      expect(error).toBeNull();
      expect(invokeSpy).toHaveBeenCalledWith('impersonate-user', {
        body: { targetUserId: 'target-1', reason: 'Investigating missing items' }
      });
      // token_hash, not email/token — see start()'s own comment for the real
      // bug this guards against (auth-js has two distinct VerifyOtpParams
      // shapes, and this app's magic-link flow needs the token_hash one).
      expect(verifyOtpSpy).toHaveBeenCalledWith({ token_hash: 'tok-123', type: 'magiclink' });
      expect(service.isImpersonating()).toBeTrue();
      expect(service.targetLabel()).toBe('Alex Rivera');
      expect(service.targetOrgLabel()).toBe('Studio Rio');
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).targetUserId).toBe('target-1');
    });

    it("falls back to the profile's email when neither nickname nor full_name is set", async () => {
      const target = createFakeProfile({ id: 'target-1', full_name: null, nickname: null, email: 'alex@example.com' });
      const { service } = setup({
        invokeResult: { data: { email: 'alex@example.com', hashedToken: 'tok-123' }, error: null }
      });

      await service.start(target, 'Studio Rio', 'reason');

      expect(service.targetLabel()).toBe('alex@example.com');
    });

    it("surfaces the Edge Function's own JSON error body rather than a generic message", async () => {
      const target = createFakeProfile({ id: 'target-1' });
      const httpError = new FunctionsHttpError({
        json: async () => ({ error: 'Only platform admins can impersonate a user' })
      });
      const { service } = setup({ invokeResult: { data: null, error: httpError } });

      const error = await service.start(target, 'Studio Rio', 'reason');

      expect(error).toBe('Only platform admins can impersonate a user');
      expect(service.isImpersonating()).toBeFalse();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it("returns verifyOtp's own error message and leaves state untouched on failure", async () => {
      const target = createFakeProfile({ id: 'target-1' });
      const { service } = setup({
        invokeResult: { data: { email: 'alex@example.com', hashedToken: 'tok-123' }, error: null },
        verifyOtpResult: { data: null, error: { message: 'Token has expired or is invalid' } }
      });

      const error = await service.start(target, 'Studio Rio', 'reason');

      expect(error).toBe('Token has expired or is invalid');
      expect(service.isImpersonating()).toBeFalse();
    });
  });

  describe('stop()', () => {
    it('closes the audit row, signs out, clears state, and navigates to /login', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        targetUserId: 'target-1',
        targetLabel: 'Alex Rivera',
        targetOrgLabel: 'Studio Rio',
        startedAt: new Date().toISOString()
      }));
      const signOutSpy = jasmine.createSpy('signOut').and.resolveTo(undefined);
      const authService = createFakeAuthService(createFakeProfile({ id: 'target-1' }));
      (authService as unknown as { signOut: unknown }).signOut = signOutSpy;
      const { service, rpcSpy, navigateSpy } = setup({ authService });

      await service.stop();

      expect(rpcSpy).toHaveBeenCalledWith('end_current_impersonation');
      expect(signOutSpy).toHaveBeenCalled();
      expect(service.isImpersonating()).toBeFalse();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith(['/login'], { queryParams: { impersonationEnded: '1' } });
    });
  });

  describe('stale-flag cleanup', () => {
    // createFakeAuthService's own isAuthenticated is a computed() over a
    // plain captured boolean, fixed for the fake's lifetime (every other
    // spec that needs a session transition just constructs a fresh fake in
    // the new state instead) — this test needs the signal to genuinely flip
    // after construction, so it hand-rolls just the two members
    // ImpersonationService actually touches, backed by a real writable
    // signal(), rather than reassigning a property Angular's effect
    // wouldn't notice changed.
    function createReactiveFakeAuthService(initiallyAuthenticated: boolean) {
      const authenticated = signal(initiallyAuthenticated);
      const fake = {
        isAuthenticated: authenticated.asReadonly(),
        signOut: jasmine.createSpy('signOut').and.resolveTo(undefined)
      };
      return { authService: fake as unknown as AuthService, authenticated };
    }

    it('clears a stored flag once the session ends without stop() ever being called', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        targetUserId: 'target-1',
        targetLabel: 'Alex Rivera',
        targetOrgLabel: 'Studio Rio',
        startedAt: new Date().toISOString()
      }));
      // Starts authenticated (so the constructor's initial read is honored),
      // then the underlying session ends some other way — e.g. the ordinary
      // header Logout button, which has no idea this flag exists.
      const { authService, authenticated } = createReactiveFakeAuthService(true);
      const { service } = setup({ authService });
      expect(service.isImpersonating()).toBeTrue();

      authenticated.set(false);
      TestBed.flushEffects();

      expect(service.isImpersonating()).toBeFalse();
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });

    it('does nothing when there was never a stored flag to begin with', () => {
      const { authService, authenticated } = createReactiveFakeAuthService(true);
      const { service } = setup({ authService });

      authenticated.set(false);
      TestBed.flushEffects();

      expect(service.isImpersonating()).toBeFalse();
    });
  });
});
