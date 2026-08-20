import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { Session } from '@supabase/supabase-js';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

function createFakeSession(userId: string): Session {
  return { user: { id: userId } } as unknown as Session;
}

/** AuthService talks to supabase.auth directly (getSession/onAuthStateChange/
 *  signOut) rather than through anything this app already has a fake for —
 *  every other spec fakes AuthService itself instead of constructing the
 *  real thing. Built narrowly for just what the heartbeat below exercises:
 *  a controllable initial session, a captured onAuthStateChange callback so
 *  tests can simulate sign-in/out without a real auth round-trip, and a
 *  spy-able profiles.update() (the heartbeat's own write) chainable the
 *  same way the real query builder is. */
function createFakeSupabaseService(initialSession: Session | null) {
  const updateSpy = jasmine.createSpy('update').and.callFake(() => builder);
  const signOutSpy = jasmine.createSpy('signOut').and.returnValue(Promise.resolve({ error: null }));
  let authStateCallback: ((event: string, session: Session | null) => void) | null = null;

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    single: () => Promise.resolve({ data: null, error: null }),
    update: updateSpy,
    then: (resolve: (value: unknown) => void) => resolve({ data: null, error: null }),
  };

  const fake = {
    client: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: initialSession } }),
        onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
          authStateCallback = callback;
          return { data: { subscription: { unsubscribe: () => {} } } };
        },
        signOut: signOutSpy,
      },
      from: () => builder,
    },
  };

  return {
    service: fake as unknown as SupabaseService,
    updateSpy,
    signOutSpy,
    // A function rather than exposing the callback directly, since it isn't
    // assigned until onAuthStateChange() runs inside AuthService's own
    // constructor (after this fake is constructed but before it's used).
    emitAuthStateChange: (event: string, session: Session | null) => authStateCallback?.(event, session),
  };
}

describe('AuthService heartbeat (last_active_at)', () => {
  it('touches last_active_at immediately and every 60s while a session is open', fakeAsync(() => {
    const { service, updateSpy } = createFakeSupabaseService(createFakeSession('user-1'));
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: service }] });
    TestBed.inject(AuthService);

    tick(); // flushes the constructor's getSession().then(...)
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.calls.mostRecent().args[0].last_active_at).toEqual(jasmine.any(String));

    tick(60_000);
    expect(updateSpy).toHaveBeenCalledTimes(2);

    tick(60_000);
    expect(updateSpy).toHaveBeenCalledTimes(3);

    discardPeriodicTasks();
  }));

  it('never starts a heartbeat when there is no session on load', fakeAsync(() => {
    const { updateSpy, service } = createFakeSupabaseService(null);
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: service }] });
    TestBed.inject(AuthService);

    tick();
    tick(60_000);

    expect(updateSpy).not.toHaveBeenCalled();
  }));

  it('starts the heartbeat once onAuthStateChange reports a new session', fakeAsync(() => {
    const { updateSpy, service, emitAuthStateChange } = createFakeSupabaseService(null);
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: service }] });
    TestBed.inject(AuthService);
    tick();
    expect(updateSpy).not.toHaveBeenCalled();

    emitAuthStateChange('SIGNED_IN', createFakeSession('user-2'));
    tick();
    expect(updateSpy).toHaveBeenCalledTimes(1);

    tick(60_000);
    expect(updateSpy).toHaveBeenCalledTimes(2);

    discardPeriodicTasks();
  }));

  it('stops the heartbeat once onAuthStateChange reports the session ending', fakeAsync(() => {
    const { updateSpy, service, emitAuthStateChange } = createFakeSupabaseService(createFakeSession('user-1'));
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: service }] });
    TestBed.inject(AuthService);
    tick();
    updateSpy.calls.reset();

    emitAuthStateChange('SIGNED_OUT', null);
    tick(60_000 * 3);

    expect(updateSpy).not.toHaveBeenCalled();
  }));

  it('signOut() touches last_active_at one final time before ending the session and stopping the heartbeat', fakeAsync(() => {
    const { updateSpy, service, signOutSpy } = createFakeSupabaseService(createFakeSession('user-1'));
    TestBed.configureTestingModule({ providers: [{ provide: SupabaseService, useValue: service }] });
    const authService = TestBed.inject(AuthService);
    tick();
    updateSpy.calls.reset();

    authService.signOut();
    tick();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(signOutSpy).toHaveBeenCalled();

    updateSpy.calls.reset();
    tick(60_000 * 3);
    expect(updateSpy).not.toHaveBeenCalled();
  }));
});
