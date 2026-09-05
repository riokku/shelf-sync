import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthService, Profile } from '../core/auth.service';
import { MfaService } from '../core/mfa.service';
import { NotificationService } from '../core/notification.service';
import { SupabaseService } from '../core/supabase.service';
import { ThemeModeService } from '../core/theme-mode.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { ChangePasswordModalComponent } from '../shared/components/change-password-modal/change-password-modal.component';
import { ConfirmDialogComponent } from '../shared/components/confirm-dialog/confirm-dialog.component';
import { HelpTooltipComponent } from '../shared/components/help-tooltip/help-tooltip.component';
import { TwoFactorSetupModalComponent } from '../shared/components/two-factor-setup-modal/two-factor-setup-modal.component';
import { UserAvatarComponent } from '../shared/components/user-avatar/user-avatar.component';
import { AVATAR_PRESETS } from '../shared/models/avatar-preset';
import { MAX_QUICK_MENU_ITEMS, QUICK_MENU_OPTIONS } from '../shared/models/quick-menu';

@Component({
  selector: 'app-account',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    BreadcrumbsComponent,
    HelpTooltipComponent,
    UserAvatarComponent,
  ],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent implements OnInit {
  protected authService = inject(AuthService);
  private mfaService = inject(MfaService);
  private supabase = inject(SupabaseService).client;
  private notification = inject(NotificationService);
  private dialog = inject(MatDialog);
  protected themeMode = inject(ThemeModeService);

  profile: Profile | null = null;
  organizationName: string | null = null;
  isLoading = true;
  /** Repeat-counts for the loading-state skeleton cards below — see
   *  InventoryComponent.skeletonCards' own identical doc comment.
   *  skeletonAvatarOptions is fixed at 8 (roughly matching AVATAR_PRESETS'
   *  own count) since the real avatar-picker grid isn't itself loaded from
   *  a query — this is purely a placeholder for its typical row length. */
  readonly skeletonDetailRows = [1, 2, 3, 4, 5];
  readonly skeletonAvatarOptions = [1, 2, 3, 4, 5, 6, 7, 8];

  readonly avatarPresets = AVATAR_PRESETS;
  isSavingAvatar = false;
  avatarError: string | null = null;

  /** Whether this viewer can edit the full profile-info card (full
   *  name/nickname/email) rather than just their own nickname — an
   *  admin/manager-vs-staff *product* distinction, not a security boundary:
   *  full_name/nickname/email have all shared one flat, no-privilege-
   *  distinction-to-protect column grant since the day each was added (see
   *  add_last_active_at_to_profiles's own doc comment for the same
   *  reasoning already established for avatar_key/last_active_at) — a
   *  staff member could already write any of these to their own row
   *  directly before this feature existed, same as after. This just curates
   *  which fields the *form* offers, the same "UI-only" shape
   *  BARCODE_FEATURE_ENABLED already establishes for a client-side-only
   *  gate with nothing behind it at the RLS layer. Role/organization stay
   *  off the form entirely regardless of this — a role change is
   *  admin-only via admin_set_user_role() (Manage > Team), never
   *  self-service, and organization identity isn't a per-profile field to
   *  begin with. */
  get canEditFullProfile(): boolean {
    return this.authService.canManage();
  }

  isEditingProfile = false;
  isSavingProfile = false;
  profileSaveError: string | null = null;

  profileForm = new FormGroup({
    fullName: new FormControl('', { nonNullable: true }),
    nickname: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] })
  });

  /** Every destination a user could add to their own quick menu, filtered
   *  to whatever this viewer can actually reach — mirrors the nav drawer's
   *  own @if (canManage()) gate around the Manage link, so a staff member
   *  isn't offered (and can't check) an option that would just disappear
   *  from HeaderComponent's own resolution the moment they saved it. */
  get availableQuickMenuOptions() {
    return QUICK_MENU_OPTIONS.filter(option => !option.requiresManage || this.authService.canManage());
  }
  readonly maxQuickMenuItems = MAX_QUICK_MENU_ITEMS;
  selectedQuickMenuEnabled = false;
  selectedQuickMenuItems: string[] = [];
  isSavingQuickMenu = false;
  quickMenuError: string | null = null;

  /** Independent of isLoading/profile — MfaService talks to the Auth API
   *  directly, not the profiles table, so there's no reason to block the
   *  rest of the page's own load on it. */
  isLoadingMfaStatus = true;
  isMfaEnabled = false;
  isTogglingMfa = false;
  mfaError: string | null = null;

  async ngOnInit() {
    this.profile = await this.authService.getProfile();

    if (this.profile) {
      const { data } = await this.supabase
        .from('organizations')
        .select('name')
        .eq('id', this.profile.organization_id)
        .single();
      this.organizationName = data?.name ?? null;

      this.selectedQuickMenuEnabled = this.profile.quick_menu_enabled;
      this.selectedQuickMenuItems = [...this.profile.quick_menu_items];
    }

    this.isLoading = false;

    this.isMfaEnabled = await this.mfaService.isEnrolled();
    this.isLoadingMfaStatus = false;
  }

  /** Order-independent comparison against the persisted values, same shape
   *  SettingsComponent's own tableColumnsChanged/formFieldsChanged use —
   *  toggling an item off then back on shouldn't leave Save enabled just
   *  because the array happens to be rebuilt in a different order. */
  get quickMenuChanged(): boolean {
    if (!this.profile) {
      return false;
    }
    if (this.selectedQuickMenuEnabled !== this.profile.quick_menu_enabled) {
      return true;
    }
    const saved = this.profile.quick_menu_items;
    if (saved.length !== this.selectedQuickMenuItems.length) {
      return true;
    }
    const savedSet = new Set(saved);
    return this.selectedQuickMenuItems.some(key => !savedSet.has(key));
  }

  toggleQuickMenuItem(key: string, checked: boolean) {
    if (checked) {
      if (this.selectedQuickMenuItems.length >= MAX_QUICK_MENU_ITEMS) {
        return;
      }
      this.selectedQuickMenuItems = [...this.selectedQuickMenuItems, key];
    } else {
      this.selectedQuickMenuItems = this.selectedQuickMenuItems.filter(item => item !== key);
    }
  }

  async saveQuickMenu() {
    if (!this.profile || this.isSavingQuickMenu) {
      return;
    }

    this.isSavingQuickMenu = true;
    this.quickMenuError = null;

    const { error } = await this.supabase
      .from('profiles')
      .update({
        quick_menu_enabled: this.selectedQuickMenuEnabled,
        quick_menu_items: this.selectedQuickMenuItems
      })
      .eq('id', this.profile.id);

    this.isSavingQuickMenu = false;

    if (error) {
      this.quickMenuError = error.message;
      return;
    }

    this.profile = {
      ...this.profile,
      quick_menu_enabled: this.selectedQuickMenuEnabled,
      quick_menu_items: this.selectedQuickMenuItems
    };
    await this.authService.refreshProfile();
    this.notification.success('Quick menu saved');
  }

  /** Seeds the form from the current profile and enables/disables the
   *  full-name/email controls per canEditFullProfile — same "disabled
   *  controls still round-trip their current value via getRawValue() at
   *  save time" reasoning ModalTableComponent.startEdit() already
   *  establishes for its own permission-gated fields, so a staff member
   *  saving just their nickname can't accidentally null out a full
   *  name/email they never touched. Nickname stays enabled for everyone —
   *  it's the one field every role can edit. */
  startEditProfile() {
    if (!this.profile) {
      return;
    }

    this.profileSaveError = null;
    this.profileForm.setValue({
      fullName: this.profile.full_name ?? '',
      nickname: this.profile.nickname ?? '',
      email: this.profile.email
    });
    if (this.canEditFullProfile) {
      this.profileForm.controls.fullName.enable();
      this.profileForm.controls.email.enable();
    } else {
      this.profileForm.controls.fullName.disable();
      this.profileForm.controls.email.disable();
    }
    this.isEditingProfile = true;
  }

  cancelEditProfile() {
    this.isEditingProfile = false;
    this.profileSaveError = null;
  }

  async saveProfile() {
    if (!this.profile || this.isSavingProfile) {
      return;
    }
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.isSavingProfile = true;
    this.profileSaveError = null;

    // getRawValue(), not .value — a disabled control (full name/email, for
    // a staff viewer) is still included with its unchanged current value
    // rather than dropped, so this update can never accidentally clear a
    // field this viewer wasn't even offered a way to edit.
    const raw = this.profileForm.getRawValue();
    const updates: { full_name: string | null; nickname: string | null; email: string } = {
      full_name: raw.fullName.trim() || null,
      nickname: raw.nickname.trim() || null,
      email: raw.email.trim()
    };

    const { error } = await this.supabase.from('profiles').update(updates).eq('id', this.profile.id);

    this.isSavingProfile = false;

    if (error) {
      this.profileSaveError = error.message;
      return;
    }

    this.profile = { ...this.profile, ...updates };
    await this.authService.refreshProfile();
    this.isEditingProfile = false;
    this.notification.success('Profile updated');
  }

  /** ChangePasswordModalComponent is self-contained — it does the actual
   *  current-password reauth + updatePassword() itself (see its own doc
   *  comment) — so this just opens it and toasts on a truthy close, same
   *  shape ManageSuppliersComponent's own openForm() already establishes
   *  for a self-contained modal. */
  openChangePassword() {
    if (!this.profile) {
      return;
    }

    const dialogRef = this.dialog.open(ChangePasswordModalComponent, {
      data: { email: this.profile.email },
      width: 'clamp(26rem, 45vw, 32rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((changed: boolean | undefined) => {
      if (changed) {
        this.notification.success('Password updated');
      }
    });
  }

  /** TwoFactorSetupModalComponent is self-contained — it does the actual
   *  enroll()/challengeAndVerify() calls itself (see its own doc comment) —
   *  so this just opens it and updates the status line on a truthy close,
   *  same shape openChangePassword() just above already establishes for a
   *  self-contained modal. */
  openTwoFactorSetup() {
    const dialogRef = this.dialog.open(TwoFactorSetupModalComponent, {
      width: 'clamp(24rem, 40vw, 28rem)',
      maxWidth: '90vw'
    });

    dialogRef.afterClosed().subscribe((enabled: boolean | undefined) => {
      if (enabled) {
        this.isMfaEnabled = true;
        this.notification.success('Two-factor authentication is on');
      }
    });
  }

  /** Confirmed first (danger: false — unlike deleting something, turning
   *  this off is fully reversible, just worth a beat before weakening the
   *  account's own login security) via ConfirmDialogComponent, mirroring
   *  every other consequential-but-reversible action in this app. */
  disableTwoFactor() {
    if (this.isTogglingMfa) {
      return;
    }

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Turn off two-factor authentication?',
        message: 'You can turn it back on anytime from this page.',
        confirmLabel: 'Turn off'
      },
      width: 'clamp(75%, 25rem, 60%)'
    });

    dialogRef.afterClosed().subscribe(async confirmed => {
      if (!confirmed) {
        return;
      }

      this.isTogglingMfa = true;
      this.mfaError = null;

      const factor = await this.mfaService.getVerifiedTotpFactor();
      if (!factor) {
        // Already off somehow (another tab, a previous attempt that
        // actually succeeded despite an error surfacing) — just reflect
        // that rather than erroring over nothing left to do.
        this.isTogglingMfa = false;
        this.isMfaEnabled = false;
        return;
      }

      const error = await this.mfaService.unenroll(factor.id);
      this.isTogglingMfa = false;

      if (error) {
        this.mfaError = error;
        return;
      }

      this.isMfaEnabled = false;
      this.notification.success('Two-factor authentication turned off');
    });
  }

  async selectAvatar(avatarKey: string) {
    if (!this.profile || this.isSavingAvatar || this.profile.avatar_key === avatarKey) {
      return;
    }

    this.isSavingAvatar = true;
    this.avatarError = null;

    const { error } = await this.supabase
      .from('profiles')
      .update({ avatar_key: avatarKey })
      .eq('id', this.profile.id);

    this.isSavingAvatar = false;

    if (error) {
      this.avatarError = error.message;
      return;
    }

    this.profile = { ...this.profile, avatar_key: avatarKey };
    await this.authService.refreshProfile();
  }
}
