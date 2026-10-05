import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';

import { LoginComponent } from './login.component';
import { AuthService } from '../core/auth.service';
import { MfaService } from '../core/mfa.service';
import { createFakeActivatedRoute, createFakeAuthService, createFakeMfaService, installFakeTurnstile } from '../testing/fakes';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;

  beforeEach(async () => {
    installFakeTurnstile();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: MfaService, useValue: createFakeMfaService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    delete window.turnstile;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('disables the submit button until a captcha token has been verified', () => {
    expect(component.captchaToken).toBeNull();

    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBeTrue();

    component.captchaToken = 'a-real-token';
    fixture.detectChanges();

    expect(submitButton.disabled).toBeFalse();
  });

  it('attemptLogin() is a no-op without a captcha token, same as an invalid form', async () => {
    const authService = TestBed.inject(AuthService);
    const signInSpy = spyOn(authService, 'signIn');
    component.form.setValue({ email: 'test@example.com', password: 'password123' });

    await component.attemptLogin();

    expect(signInSpy).not.toHaveBeenCalled();
  });

  it('clears the captcha token and resets the widget after a failed attempt', async () => {
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'signIn').and.returnValue(Promise.resolve({ message: 'Invalid credentials' } as never));
    component.form.setValue({ email: 'test@example.com', password: 'wrong' });
    component.captchaToken = 'a-real-token';

    await component.attemptLogin();

    expect(component.captchaToken).toBeNull();
  });
});

/** Covers the returnUrl handling added alongside authGuard's redirect (see
 *  auth.guard.ts) — in particular that the open-redirect guard actually
 *  blocks a protocol-relative returnUrl, since that's the one case where
 *  getting this wrong would be a real security bug, not just a UX papercut. */
describe('LoginComponent post-login redirect', () => {
  afterEach(() => {
    delete window.turnstile;
  });

  async function attemptLoginWithReturnUrl(returnUrl: string | null): Promise<jasmine.Spy> {
    installFakeTurnstile();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: MfaService, useValue: createFakeMfaService() },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute(returnUrl ? { returnUrl } : {}) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigateByUrl');

    component.form.setValue({ email: 'test@example.com', password: 'password123' });
    component.captchaToken = 'a-real-token';
    await component.attemptLogin();

    return navigateSpy;
  }

  it('goes to /home when there is no returnUrl', async () => {
    const navigateSpy = await attemptLoginWithReturnUrl(null);
    expect(navigateSpy).toHaveBeenCalledWith('/home');
  });

  it('follows a same-app returnUrl (e.g. a deep link that bounced through login)', async () => {
    const navigateSpy = await attemptLoginWithReturnUrl('/inventory?item=abc-123');
    expect(navigateSpy).toHaveBeenCalledWith('/inventory?item=abc-123');
  });

  it('ignores a protocol-relative returnUrl rather than treating it as safe', async () => {
    const navigateSpy = await attemptLoginWithReturnUrl('//evil.example.com');
    expect(navigateSpy).toHaveBeenCalledWith('/home');
  });
});

/** approvedGuard would catch this on the very next navigation regardless
 *  (see its own doc comment) — this covers attemptLogin()'s own shortcut so
 *  a two-factor account doesn't briefly flash /home (or a deep-linked
 *  returnUrl) before being bounced back out to /mfa-verify. */
describe('LoginComponent MFA redirect', () => {
  afterEach(() => {
    delete window.turnstile;
  });

  async function attemptLoginWithMfaPending(returnUrl: string | null): Promise<jasmine.Spy> {
    installFakeTurnstile();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: MfaService, useValue: createFakeMfaService({ isVerificationPending: true }) },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute(returnUrl ? { returnUrl } : {}) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate');

    component.form.setValue({ email: 'test@example.com', password: 'password123' });
    component.captchaToken = 'a-real-token';
    await component.attemptLogin();

    return navigateSpy;
  }

  it('goes to /mfa-verify instead of /home when this session still owes a challenge', async () => {
    const navigateSpy = await attemptLoginWithMfaPending(null);
    expect(navigateSpy).toHaveBeenCalledWith(['/mfa-verify'], {});
  });

  it('carries a returnUrl through to /mfa-verify so it can finish the trip afterward', async () => {
    const navigateSpy = await attemptLoginWithMfaPending('/inventory?item=abc-123');
    expect(navigateSpy).toHaveBeenCalledWith(['/mfa-verify'], { queryParams: { returnUrl: '/inventory?item=abc-123' } });
  });
});

/** Same "avoid a visible flash before approvedGuard would bounce it back out
 *  anyway" reasoning as the /mfa-verify block above, for the sibling case:
 *  an org that requires two-factor for everyone, hit by an account that's
 *  never enrolled at all — there's no factor yet to send to /mfa-verify
 *  against, so this goes to /account instead (see approvedGuard's own doc
 *  comment on the identical redirect). */
describe('LoginComponent org-wide "require two-factor" redirect', () => {
  afterEach(() => {
    delete window.turnstile;
  });

  async function attemptLoginWhenMfaRequiredButUnenrolled(): Promise<jasmine.Spy> {
    installFakeTurnstile();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: MfaService, useValue: createFakeMfaService({ isRequiredOrgWide: true, isEnrolled: false }) },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute() }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    const router = TestBed.inject(Router);
    const navigateByUrlSpy = spyOn(router, 'navigateByUrl');

    component.form.setValue({ email: 'test@example.com', password: 'password123' });
    component.captchaToken = 'a-real-token';
    await component.attemptLogin();

    return navigateByUrlSpy;
  }

  it('goes to /account instead of /home when the org requires two-factor and nothing is enrolled', async () => {
    const navigateByUrlSpy = await attemptLoginWhenMfaRequiredButUnenrolled();
    expect(navigateByUrlSpy).toHaveBeenCalledWith('/account');
  });
});

/** ImpersonationService.stop() lands here with ?impersonationEnded=1 (see
 *  that service's own doc comment for why signing back in is manual rather
 *  than a cached-session one-click return), and MfaVerifyComponent.recoverWithCode()
 *  lands here with ?mfaRecovered=1 (see that method's own doc comment) —
 *  this covers the small info messages that explain why, without needing
 *  either service/component itself in the picture at all. */
describe('LoginComponent login-notice messages', () => {
  afterEach(() => {
    delete window.turnstile;
  });

  async function createComponent(queryParams: Record<string, string>) {
    installFakeTurnstile();

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService() },
        { provide: MfaService, useValue: createFakeMfaService() },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute(queryParams) }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the message when landing with ?impersonationEnded=1', async () => {
    const fixture = await createComponent({ impersonationEnded: '1' });

    expect(fixture.componentInstance.impersonationEnded).toBeTrue();
    expect(fixture.nativeElement.querySelector('.login-notice-message')?.textContent)
      .toContain('Impersonation ended');
  });

  it('shows the message when landing with ?mfaRecovered=1', async () => {
    const fixture = await createComponent({ mfaRecovered: '1' });

    expect(fixture.componentInstance.mfaRecovered).toBeTrue();
    expect(fixture.nativeElement.querySelector('.login-notice-message')?.textContent)
      .toContain('Two-factor authentication was removed');
  });

  it('stays hidden on an ordinary visit', async () => {
    const fixture = await createComponent({});

    expect(fixture.componentInstance.impersonationEnded).toBeFalse();
    expect(fixture.componentInstance.mfaRecovered).toBeFalse();
    expect(fixture.nativeElement.querySelector('.login-notice-message')).toBeNull();
  });
});
