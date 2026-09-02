import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthService, Profile } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { SupabaseService } from '../core/supabase.service';
import { ThemeModeService } from '../core/theme-mode.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { ChangePasswordModalComponent } from '../shared/components/change-password-modal/change-password-modal.component';
import { UserAvatarComponent } from '../shared/components/user-avatar/user-avatar.component';
import { AVATAR_PRESETS } from '../shared/models/avatar-preset';
import { MAX_QUICK_MENU_ITEMS, QUICK_MENU_OPTIONS } from '../shared/models/quick-menu';

@Component({
  selector: 'app-account',
  imports: [
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    BreadcrumbsComponent,
    UserAvatarComponent,
  ],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent implements OnInit {
  protected authService = inject(AuthService);
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
