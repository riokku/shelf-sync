import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';

import { RegisterComponent } from './register.component';
import { AuthService } from '../core/auth.service';
import { installFakeTurnstile } from '../testing/fakes';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;

  beforeEach(async () => {
    installFakeTurnstile();

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
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
    (component as unknown as { revealForm: () => void }).revealForm();
    fixture.detectChanges();
    expect(component.captchaToken).toBeNull();

    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBeTrue();

    component.captchaToken = 'a-real-token';
    fixture.detectChanges();

    expect(submitButton.disabled).toBeFalse();
  });

  it('attemptRegister() is a no-op without a captcha token, same as an invalid form', async () => {
    const authService = TestBed.inject(AuthService);
    const signUpSpy = spyOn(authService, 'signUp');
    component.form.setValue({
      organizationName: 'Acme Co',
      fullName: 'Test User',
      nickname: 'Tester',
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'password123'
    });

    await component.attemptRegister();

    expect(signUpSpy).not.toHaveBeenCalled();
  });

  it('clears the captcha token and resets the widget after a failed attempt', async () => {
    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'signUp').and.returnValue(Promise.resolve({ error: { message: 'Email already registered' }, needsEmailConfirmation: false } as never));
    component.form.setValue({
      organizationName: 'Acme Co',
      fullName: 'Test User',
      nickname: 'Tester',
      email: 'test@example.com',
      password: 'password123',
      confirmPassword: 'password123'
    });
    component.captchaToken = 'a-real-token';

    await component.attemptRegister();

    expect(component.captchaToken).toBeNull();
  });
});
