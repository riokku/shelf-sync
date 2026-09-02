import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { ChangePasswordModalComponent, ChangePasswordModalData } from './change-password-modal.component';
import { AuthService } from '../../../core/auth.service';
import { createFakeAuthService, createFakeMatDialogRef, installFakeTurnstile } from '../../../testing/fakes';

describe('ChangePasswordModalComponent', () => {
  let component: ChangePasswordModalComponent;
  let fixture: ComponentFixture<ChangePasswordModalComponent>;
  let dialogRef: MatDialogRef<ChangePasswordModalComponent>;
  let authService: AuthService;

  async function setup(data: ChangePasswordModalData = { email: 'staff@example.com' }) {
    installFakeTurnstile();
    authService = createFakeAuthService();
    dialogRef = createFakeMatDialogRef() as unknown as MatDialogRef<ChangePasswordModalComponent>;

    await TestBed.configureTestingModule({
      imports: [ChangePasswordModalComponent],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChangePasswordModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    delete window.turnstile;
  });

  function fillForm(overrides: { currentPassword?: string; newPassword?: string; confirmNewPassword?: string } = {}) {
    component.form.setValue({
      currentPassword: overrides.currentPassword ?? 'oldpassword',
      newPassword: overrides.newPassword ?? 'newpassword',
      confirmNewPassword: overrides.confirmNewPassword ?? 'newpassword'
    });
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('confirm() is a no-op without a captcha token, same as an invalid form', async () => {
    await setup();
    const signInSpy = spyOn(authService, 'signIn');
    fillForm();

    await component.confirm();

    expect(signInSpy).not.toHaveBeenCalled();
  });

  it('confirm() does nothing when the new password and confirmation do not match', async () => {
    await setup();
    const signInSpy = spyOn(authService, 'signIn');
    fillForm({ confirmNewPassword: 'different' });
    component.captchaToken = 'a-real-token';

    await component.confirm();

    expect(signInSpy).not.toHaveBeenCalled();
    expect(component.form.errors?.['passwordMismatch']).toBeTrue();
  });

  it('confirm() verifies the current password via signIn() before calling updatePassword()', async () => {
    await setup({ email: 'staff@example.com' });
    const signInSpy = spyOn(authService, 'signIn').and.resolveTo(null);
    const updateSpy = spyOn(authService, 'updatePassword').and.resolveTo(null);
    const closeSpy = spyOn(dialogRef, 'close');
    fillForm({ currentPassword: 'correct-old-password', newPassword: 'brandnewpassword', confirmNewPassword: 'brandnewpassword' });
    component.captchaToken = 'a-real-token';

    await component.confirm();

    expect(signInSpy).toHaveBeenCalledWith('staff@example.com', 'correct-old-password', 'a-real-token');
    expect(updateSpy).toHaveBeenCalledWith('brandnewpassword');
    expect(closeSpy).toHaveBeenCalledWith(true);
    expect(component.error).toBeNull();
  });

  it('confirm() surfaces an error and never calls updatePassword() when the current password is wrong', async () => {
    await setup();
    const signInSpy = spyOn(authService, 'signIn').and.resolveTo({ message: 'Invalid login credentials' } as never);
    const updateSpy = spyOn(authService, 'updatePassword');
    const closeSpy = spyOn(dialogRef, 'close');
    fillForm();
    component.captchaToken = 'a-real-token';

    await component.confirm();

    expect(signInSpy).toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(component.error).toBe('Invalid login credentials');
    expect(closeSpy).not.toHaveBeenCalled();
    // A Turnstile token is single-use — a failed reauth attempt needs a
    // fresh one before retrying, same as LoginComponent's own behavior.
    expect(component.captchaToken).toBeNull();
  });

  it('confirm() surfaces an error inline without closing when updatePassword() itself fails', async () => {
    await setup();
    spyOn(authService, 'signIn').and.resolveTo(null);
    spyOn(authService, 'updatePassword').and.resolveTo({ message: 'boom' } as never);
    const closeSpy = spyOn(dialogRef, 'close');
    fillForm();
    component.captchaToken = 'a-real-token';

    await component.confirm();

    expect(component.error).toBe('boom');
    expect(closeSpy).not.toHaveBeenCalled();
    expect(component.captchaToken).toBeNull();
  });

  it('cancel() closes the dialog with no result', async () => {
    await setup();
    const closeSpy = spyOn(dialogRef, 'close');

    component.cancel();

    expect(closeSpy).toHaveBeenCalledWith();
  });
});
