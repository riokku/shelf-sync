import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '../core/auth.service';
import { createFakeAuthService } from '../testing/fakes';

describe('ResetPasswordComponent', () => {
  async function createComponent(hasSession: boolean): Promise<{
    component: ResetPasswordComponent;
    fixture: ComponentFixture<ResetPasswordComponent>;
    authService: AuthService;
  }> {
    const authService = createFakeAuthService(null, { hasSession });

    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService }
      ]
    })
    .compileComponents();

    const fixture = TestBed.createComponent(ResetPasswordComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();

    return { component, fixture, authService };
  }

  it('should create', async () => {
    const { component } = await createComponent(true);
    expect(component).toBeTruthy();
  });

  it('flags the link as invalid when no recovery session was picked up from the URL', async () => {
    const { component } = await createComponent(false);
    expect(component.hasRecoverySession).toBeFalse();
  });

  it('shows the new-password form once a recovery session is present', async () => {
    const { component } = await createComponent(true);
    expect(component.hasRecoverySession).toBeTrue();
  });

  it('does nothing if the passwords do not match', async () => {
    const { component, authService } = await createComponent(true);
    const updateSpy = spyOn(authService, 'updatePassword');
    component.form.setValue({ password: 'password123', confirmPassword: 'different123' });

    await component.updatePassword();

    expect(updateSpy).not.toHaveBeenCalled();
    expect(component.passwordUpdated).toBeFalse();
  });

  it('updates the password and shows the confirmation state on success', async () => {
    const { component, authService } = await createComponent(true);
    spyOn(authService, 'updatePassword').and.resolveTo(null);
    component.form.setValue({ password: 'password123', confirmPassword: 'password123' });

    await component.updatePassword();

    expect(component.passwordUpdated).toBeTrue();
  });

  it('navigates to /home when continuing past the confirmation state', async () => {
    const { component } = await createComponent(true);
    const router = TestBed.inject(Router);
    const navigateSpy = spyOn(router, 'navigate');

    component.continueToApp();

    expect(navigateSpy).toHaveBeenCalledWith(['/home']);
  });
});
