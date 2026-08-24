import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ForgotPasswordComponent } from './forgot-password.component';
import { AuthService } from '../core/auth.service';
import { createFakeAuthService, installFakeTurnstile } from '../testing/fakes';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let authService: AuthService;

  beforeEach(async () => {
    installFakeTurnstile();
    authService = createFakeAuthService();

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
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

  it('does nothing if the email field is invalid', async () => {
    const resetSpy = spyOn(authService, 'requestPasswordReset');
    component.form.setValue({ email: 'not-an-email' });
    component.captchaToken = 'a-real-token';

    await component.requestReset();

    expect(resetSpy).not.toHaveBeenCalled();
    expect(component.requestSent).toBeFalse();
  });

  it('does nothing without a captcha token, same as an invalid form', async () => {
    const resetSpy = spyOn(authService, 'requestPasswordReset');
    component.form.setValue({ email: 'test@example.com' });

    await component.requestReset();

    expect(resetSpy).not.toHaveBeenCalled();
    expect(component.requestSent).toBeFalse();
  });

  it('shows the "check your email" state on success, regardless of whether the address is registered', async () => {
    spyOn(authService, 'requestPasswordReset').and.resolveTo(null);
    component.form.setValue({ email: 'test@example.com' });
    component.captchaToken = 'a-real-token';

    await component.requestReset();

    expect(component.requestSent).toBeTrue();
    expect(component.errorMessage).toBeNull();
  });

  it('surfaces a genuine failure (e.g. rate limit) instead of the confirmation state, and clears the captcha token', async () => {
    spyOn(authService, 'requestPasswordReset').and.resolveTo({ message: 'Email rate limit exceeded' } as never);
    component.form.setValue({ email: 'test@example.com' });
    component.captchaToken = 'a-real-token';

    await component.requestReset();

    expect(component.requestSent).toBeFalse();
    expect(component.errorMessage).toBe('Email rate limit exceeded');
    expect(component.captchaToken).toBeNull();
  });
});
