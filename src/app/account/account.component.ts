import { Component, OnInit, inject } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService, Profile } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { ThemeModeService } from '../core/theme-mode.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { UserAvatarComponent } from '../shared/components/user-avatar/user-avatar.component';
import { AVATAR_PRESETS } from '../shared/models/avatar-preset';

@Component({
  selector: 'app-account',
  imports: [
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    BreadcrumbsComponent,
    UserAvatarComponent,
  ],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent implements OnInit {
  private authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;
  protected themeMode = inject(ThemeModeService);

  profile: Profile | null = null;
  organizationName: string | null = null;
  isLoading = true;

  readonly avatarPresets = AVATAR_PRESETS;
  isSavingAvatar = false;
  avatarError: string | null = null;

  async ngOnInit() {
    this.profile = await this.authService.getProfile();

    if (this.profile) {
      const { data } = await this.supabase
        .from('organizations')
        .select('name')
        .eq('id', this.profile.organization_id)
        .single();
      this.organizationName = data?.name ?? null;
    }

    this.isLoading = false;
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
