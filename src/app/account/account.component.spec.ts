import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { AccountComponent } from './account.component';
import { AuthService, Profile } from '../core/auth.service';
import { MfaService } from '../core/mfa.service';
import { NotificationService } from '../core/notification.service';
import { SupabaseService } from '../core/supabase.service';
import { ChangePasswordModalComponent } from '../shared/components/change-password-modal/change-password-modal.component';
import { ConfirmDialogComponent } from '../shared/components/confirm-dialog/confirm-dialog.component';
import { RecoveryCodesModalComponent } from '../shared/components/recovery-codes-modal/recovery-codes-modal.component';
import { TwoFactorSetupModalComponent } from '../shared/components/two-factor-setup-modal/two-factor-setup-modal.component';
import { createFakeAuthService, createFakeMfaService, createFakeProfile } from '../testing/fakes';
import { MAX_QUICK_MENU_ITEMS } from '../shared/models/quick-menu';

function createFakeDialogRef(result: unknown): MatDialogRef<unknown> {
  return { afterClosed: () => of(result) } as unknown as MatDialogRef<unknown>;
}

describe('AccountComponent', () => {
  let component: AccountComponent;
  let fixture: ComponentFixture<AccountComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile()) },
        { provide: MfaService, useValue: createFakeMfaService() }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AccountComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('AccountComponent quick menu', () => {
  let component: AccountComponent;
  let updateSpy: jasmine.Spy;
  let notificationSuccessSpy: jasmine.Spy;

  /** A narrow, table-aware fake rather than the shared
   *  createFakeSupabaseService() helper — saveQuickMenu()'s own assertions
   *  need to inspect exactly what was passed to profiles.update(), which
   *  that shared helper's one-fixed-result-for-every-call shape can't
   *  expose. */
  async function setup(profileOverrides: Partial<Profile> = {}): Promise<ComponentFixture<AccountComponent>> {
    const profile = createFakeProfile({ quick_menu_enabled: false, quick_menu_items: [], ...profileOverrides });
    updateSpy = jasmine.createSpy('update').and.returnValue({ eq: () => Promise.resolve({ error: null }) });
    const supabase = {
      client: {
        from: (table: string) => {
          if (table === 'profiles') {
            return { update: updateSpy };
          }
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
        }
      }
    } as unknown as SupabaseService;

    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(profile) },
        { provide: MfaService, useValue: createFakeMfaService() },
        { provide: SupabaseService, useValue: supabase }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(AccountComponent);
    component = fixture.componentInstance;
    // Real service, spied rather than replaced — same convention every
    // other spec asserting a save toast in this app already uses (see
    // settings.component.spec.ts's own identical note).
    notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('toggleQuickMenuItem() adds and removes keys', async () => {
    await setup();

    component.toggleQuickMenuItem('inventory', true);
    expect(component.selectedQuickMenuItems).toEqual(['inventory']);

    component.toggleQuickMenuItem('inventory', false);
    expect(component.selectedQuickMenuItems).toEqual([]);
  });

  it('toggleQuickMenuItem() refuses to add past the max-item cap', async () => {
    await setup({ quick_menu_items: [] });

    for (let i = 0; i < MAX_QUICK_MENU_ITEMS; i++) {
      component.toggleQuickMenuItem(`item-${i}`, true);
    }
    expect(component.selectedQuickMenuItems.length).toBe(MAX_QUICK_MENU_ITEMS);

    component.toggleQuickMenuItem('one-too-many', true);
    expect(component.selectedQuickMenuItems.length).toBe(MAX_QUICK_MENU_ITEMS);
    expect(component.selectedQuickMenuItems).not.toContain('one-too-many');
  });

  it('quickMenuChanged is order-independent and reacts to the enabled flag', async () => {
    await setup({ quick_menu_enabled: true, quick_menu_items: ['home', 'tasks'] });

    expect(component.quickMenuChanged).toBeFalse();

    component.selectedQuickMenuItems = ['tasks', 'home'];
    expect(component.quickMenuChanged).toBeFalse();

    component.selectedQuickMenuItems = ['home'];
    expect(component.quickMenuChanged).toBeTrue();

    component.selectedQuickMenuItems = ['home', 'tasks'];
    component.selectedQuickMenuEnabled = false;
    expect(component.quickMenuChanged).toBeTrue();
  });

  it('saveQuickMenu() persists both fields, updates the local profile, and shows a success toast', async () => {
    await setup();

    component.selectedQuickMenuEnabled = true;
    component.selectedQuickMenuItems = ['inventory', 'tasks'];
    await component.saveQuickMenu();

    expect(updateSpy).toHaveBeenCalledWith({
      quick_menu_enabled: true,
      quick_menu_items: ['inventory', 'tasks']
    });
    expect(component.profile?.quick_menu_enabled).toBeTrue();
    expect(component.profile?.quick_menu_items).toEqual(['inventory', 'tasks']);
    expect(component.quickMenuError).toBeNull();
    expect(notificationSuccessSpy).toHaveBeenCalledWith('Quick menu saved');
  });

  it('saveQuickMenu() surfaces an error message and skips the toast on failure', async () => {
    await setup();
    updateSpy.and.returnValue({ eq: () => Promise.resolve({ error: { message: 'boom' } }) });

    component.selectedQuickMenuEnabled = true;
    await component.saveQuickMenu();

    expect(component.quickMenuError).toBe('boom');
    expect(notificationSuccessSpy).not.toHaveBeenCalled();
  });
});

describe('AccountComponent editing profile info', () => {
  let component: AccountComponent;
  let updateSpy: jasmine.Spy;
  let notificationSuccessSpy: jasmine.Spy;

  /** Same narrow, table-aware fake the quick-menu describe block's own
   *  setup() uses — saveProfile()'s assertions need to inspect exactly
   *  what was passed to profiles.update(). */
  async function setup(profileOverrides: Partial<Profile> = {}): Promise<ComponentFixture<AccountComponent>> {
    const profile = createFakeProfile({
      full_name: 'Original Name',
      nickname: 'Orig',
      email: 'original@example.com',
      ...profileOverrides
    });
    updateSpy = jasmine.createSpy('update').and.returnValue({ eq: () => Promise.resolve({ error: null }) });
    const supabase = {
      client: {
        from: (table: string) => {
          if (table === 'profiles') {
            return { update: updateSpy };
          }
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
        }
      }
    } as unknown as SupabaseService;

    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(profile) },
        { provide: MfaService, useValue: createFakeMfaService() },
        { provide: SupabaseService, useValue: supabase }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(AccountComponent);
    component = fixture.componentInstance;
    notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('a staff viewer can only edit nickname — full name and email stay disabled', async () => {
    await setup({ role: 'staff' });

    expect(component.canEditFullProfile).toBeFalse();
    component.startEditProfile();

    expect(component.profileForm.controls.nickname.enabled).toBeTrue();
    expect(component.profileForm.controls.fullName.disabled).toBeTrue();
    expect(component.profileForm.controls.email.disabled).toBeTrue();
  });

  it('an admin/manager viewer can edit every field', async () => {
    await setup({ role: 'manager' });

    expect(component.canEditFullProfile).toBeTrue();
    component.startEditProfile();

    expect(component.profileForm.controls.nickname.enabled).toBeTrue();
    expect(component.profileForm.controls.fullName.enabled).toBeTrue();
    expect(component.profileForm.controls.email.enabled).toBeTrue();
  });

  it('a staff save only sends the nickname change — full name/email round-trip unchanged', async () => {
    await setup({ role: 'staff' });
    component.startEditProfile();
    component.profileForm.controls.nickname.setValue('New Nickname');

    await component.saveProfile();

    // getRawValue() still round-trips the disabled fullName/email controls'
    // seeded (unchanged) values — this update can't accidentally null out
    // a field a staff viewer was never offered a way to edit.
    expect(updateSpy).toHaveBeenCalledWith({
      full_name: 'Original Name',
      nickname: 'New Nickname',
      email: 'original@example.com'
    });
    expect(component.profile?.nickname).toBe('New Nickname');
    expect(component.isEditingProfile).toBeFalse();
    expect(notificationSuccessSpy).toHaveBeenCalledWith('Profile updated');
  });

  it('an admin/manager save sends every field, including a changed full name and email', async () => {
    await setup({ role: 'admin' });
    component.startEditProfile();
    component.profileForm.setValue({ fullName: 'New Name', nickname: 'New Nick', email: 'new@example.com' });

    await component.saveProfile();

    expect(updateSpy).toHaveBeenCalledWith({
      full_name: 'New Name',
      nickname: 'New Nick',
      email: 'new@example.com'
    });
    expect(component.profile?.full_name).toBe('New Name');
    expect(component.profile?.email).toBe('new@example.com');
  });

  it('rejects saving with an invalid email and never calls update()', async () => {
    await setup({ role: 'admin' });
    component.startEditProfile();
    component.profileForm.controls.email.setValue('not-an-email');

    await component.saveProfile();

    expect(updateSpy).not.toHaveBeenCalled();
    expect(component.isEditingProfile).toBeTrue();
    expect(component.profileForm.controls.email.touched).toBeTrue();
  });

  it('surfaces an error message and leaves editing open on a failed save', async () => {
    await setup({ role: 'admin' });
    updateSpy.and.returnValue({ eq: () => Promise.resolve({ error: { message: 'boom' } }) });
    component.startEditProfile();

    await component.saveProfile();

    expect(component.profileSaveError).toBe('boom');
    expect(component.isEditingProfile).toBeTrue();
    expect(notificationSuccessSpy).not.toHaveBeenCalled();
  });

  it('cancelEditProfile() exits editing without saving', async () => {
    await setup({ role: 'admin' });
    component.startEditProfile();
    component.profileForm.controls.nickname.setValue('Ignored');

    component.cancelEditProfile();

    expect(component.isEditingProfile).toBeFalse();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(component.profile?.nickname).toBe('Orig');
  });
});

describe('AccountComponent change password', () => {
  let component: AccountComponent;
  let notificationSuccessSpy: jasmine.Spy;

  async function setup(): Promise<ComponentFixture<AccountComponent>> {
    const profile = createFakeProfile({ email: 'staff@example.com' });
    // ngOnInit's own organizations lookup needs a stubbed SupabaseService —
    // without one, it hits the real client and fixture.whenStable() below
    // never resolves. Same shape the quick-menu describe block's own setup()
    // uses for every table but 'profiles'.
    const supabase = {
      client: {
        from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) })
      }
    } as unknown as SupabaseService;

    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(profile) },
        { provide: MfaService, useValue: createFakeMfaService() },
        { provide: SupabaseService, useValue: supabase }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(AccountComponent);
    component = fixture.componentInstance;
    notificationSuccessSpy = spyOn((component as unknown as { notification: NotificationService }).notification, 'success');
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  it('openChangePassword() opens ChangePasswordModalComponent with the caller\'s own email', async () => {
    await setup();
    const dialog = TestBed.inject(MatDialog);
    const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

    component.openChangePassword();

    expect(openSpy).toHaveBeenCalledWith(
      ChangePasswordModalComponent,
      jasmine.objectContaining({ data: { email: 'staff@example.com' } })
    );
  });

  it('toasts on a truthy close', async () => {
    await setup();
    const dialog = TestBed.inject(MatDialog);
    spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));

    component.openChangePassword();

    expect(notificationSuccessSpy).toHaveBeenCalledWith('Password updated');
  });

  it('does not toast when the modal is dismissed without changing the password', async () => {
    await setup();
    const dialog = TestBed.inject(MatDialog);
    spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

    component.openChangePassword();

    expect(notificationSuccessSpy).not.toHaveBeenCalled();
  });
});

describe('AccountComponent two-factor authentication', () => {
  async function setup(mfaService: MfaService): Promise<ComponentFixture<AccountComponent>> {
    const profile = createFakeProfile();
    const supabase = {
      client: {
        from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) })
      }
    } as unknown as SupabaseService;

    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(profile) },
        { provide: MfaService, useValue: mfaService },
        { provide: SupabaseService, useValue: supabase }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(AccountComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    // whenStable() only waits for ngOnInit's own async work to finish — it
    // doesn't itself re-render, so the DOM still reflects the pre-resolve
    // state until this second pass.
    fixture.detectChanges();
    return fixture;
  }

  it('reflects an already-enrolled account after loading', async () => {
    const fixture = await setup(createFakeMfaService({ isEnrolled: true }));

    expect(fixture.componentInstance.isMfaEnabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Two-factor authentication is on');
  });

  it('reflects an account with nothing enrolled', async () => {
    const fixture = await setup(createFakeMfaService({ isEnrolled: false }));

    expect(fixture.componentInstance.isMfaEnabled).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Two-factor authentication is off');
  });

  it('shows a "your organization requires this" banner when required org-wide and unenrolled', async () => {
    const fixture = await setup(createFakeMfaService({ isRequiredOrgWide: true, isEnrolled: false }));

    expect(fixture.componentInstance.mfaRequiredByOrg).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Your organization requires two-factor authentication');
  });

  it('does not show the banner when the org does not require two-factor', async () => {
    const fixture = await setup(createFakeMfaService({ isRequiredOrgWide: false, isEnrolled: false }));

    expect(fixture.nativeElement.textContent).not.toContain('Your organization requires two-factor authentication');
  });

  it('does not show the banner once already enrolled, even if the org requires it', async () => {
    const fixture = await setup(createFakeMfaService({ isRequiredOrgWide: true, isEnrolled: true }));

    expect(fixture.nativeElement.textContent).not.toContain('Your organization requires two-factor authentication');
  });

  it('openTwoFactorSetup() opens TwoFactorSetupModalComponent and flips the status on a truthy close', async () => {
    const fixture = await setup(createFakeMfaService({ isEnrolled: false }));
    const dialog = TestBed.inject(MatDialog);
    const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
    const notificationSuccessSpy = spyOn(
      (fixture.componentInstance as unknown as { notification: NotificationService }).notification,
      'success'
    );

    fixture.componentInstance.openTwoFactorSetup();

    expect(openSpy).toHaveBeenCalledWith(TwoFactorSetupModalComponent, jasmine.anything());
    expect(fixture.componentInstance.isMfaEnabled).toBeTrue();
    expect(notificationSuccessSpy).toHaveBeenCalledWith('Two-factor authentication is on');
  });

  it('does not flip the status when the setup modal is cancelled', async () => {
    const fixture = await setup(createFakeMfaService({ isEnrolled: false }));
    const dialog = TestBed.inject(MatDialog);
    spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(false));

    fixture.componentInstance.openTwoFactorSetup();

    expect(fixture.componentInstance.isMfaEnabled).toBeFalse();
  });

  it('disableTwoFactor() confirms first, then unenrolls the verified factor on confirm', async () => {
    const mfaService = createFakeMfaService({ isEnrolled: true, verifiedFactorId: 'factor-1' });
    const unenrollSpy = spyOn(mfaService, 'unenroll').and.callThrough();
    const fixture = await setup(mfaService);
    const dialog = TestBed.inject(MatDialog);
    const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));
    const notificationSuccessSpy = spyOn(
      (fixture.componentInstance as unknown as { notification: NotificationService }).notification,
      'success'
    );

    fixture.componentInstance.disableTwoFactor();
    await fixture.whenStable();
    // Two sequential awaits inside the confirm subscription (getVerifiedTotpFactor()
    // then unenroll()) — a single whenStable() pass isn't reliably enough to
    // drain both hops, so this waits again to be sure the second one has too.
    await fixture.whenStable();

    expect(openSpy).toHaveBeenCalledWith(ConfirmDialogComponent, jasmine.anything());
    expect(unenrollSpy).toHaveBeenCalledWith('factor-1');
    expect(fixture.componentInstance.isMfaEnabled).toBeFalse();
    expect(notificationSuccessSpy).toHaveBeenCalledWith('Two-factor authentication turned off');
  });

  it('does not unenroll anything when the confirm dialog is dismissed', async () => {
    const mfaService = createFakeMfaService({ isEnrolled: true, verifiedFactorId: 'factor-1' });
    const unenrollSpy = spyOn(mfaService, 'unenroll').and.callThrough();
    const fixture = await setup(mfaService);
    const dialog = TestBed.inject(MatDialog);
    spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(false));

    fixture.componentInstance.disableTwoFactor();
    await fixture.whenStable();

    expect(unenrollSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.isMfaEnabled).toBeTrue();
  });

  it('surfaces an error inline rather than toasting when unenroll() fails', async () => {
    const mfaService = createFakeMfaService({
      isEnrolled: true,
      verifiedFactorId: 'factor-1',
      unenrollError: 'Something went wrong.'
    });
    const fixture = await setup(mfaService);
    const dialog = TestBed.inject(MatDialog);
    spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(true));

    fixture.componentInstance.disableTwoFactor();
    await fixture.whenStable();
    await fixture.whenStable();

    expect(fixture.componentInstance.mfaError).toBe('Something went wrong.');
    expect(fixture.componentInstance.isMfaEnabled).toBeTrue();
  });

  it('loads and shows the remaining recovery-code count once enrolled', async () => {
    const fixture = await setup(createFakeMfaService({ isEnrolled: true, recoveryCodeCount: 7 }));

    expect(fixture.componentInstance.recoveryCodeCount).toBe(7);
    expect(fixture.nativeElement.textContent).toContain('7');
    expect(fixture.nativeElement.textContent).toContain('recovery codes remaining');
  });

  it('does not load a recovery-code count when unenrolled', async () => {
    const fixture = await setup(createFakeMfaService({ isEnrolled: false }));

    expect(fixture.componentInstance.recoveryCodeCount).toBeNull();
  });

  it('regenerateRecoveryCodes() confirms first, then opens RecoveryCodesModalComponent and refreshes the count', async () => {
    const mfaService = createFakeMfaService({ isEnrolled: true, recoveryCodeCount: 10 });
    const fixture = await setup(mfaService);
    const dialog = TestBed.inject(MatDialog);
    const openSpy = spyOn(dialog, 'open').and.callFake(
      component => component === ConfirmDialogComponent ? createFakeDialogRef(true) : createFakeDialogRef(undefined)
    );
    // Refreshed once RecoveryCodesModalComponent closes.
    const countSpy = spyOn(mfaService, 'getRecoveryCodeCount').and.resolveTo(10);

    fixture.componentInstance.regenerateRecoveryCodes();
    await fixture.whenStable();
    await fixture.whenStable();

    expect(openSpy).toHaveBeenCalledWith(ConfirmDialogComponent, jasmine.anything());
    expect(openSpy).toHaveBeenCalledWith(RecoveryCodesModalComponent, jasmine.objectContaining({ disableClose: true }));
    expect(countSpy).toHaveBeenCalled();
    expect(fixture.componentInstance.isRegeneratingRecoveryCodes).toBeFalse();
  });

  it('does not open RecoveryCodesModalComponent when regeneration is not confirmed', async () => {
    const fixture = await setup(createFakeMfaService({ isEnrolled: true }));
    const dialog = TestBed.inject(MatDialog);
    const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(false));

    fixture.componentInstance.regenerateRecoveryCodes();
    await fixture.whenStable();

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.isRegeneratingRecoveryCodes).toBeFalse();
  });
});
