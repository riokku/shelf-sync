import { Component, OnDestroy, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SiteSettingsService } from '../core/site-settings.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { THEME_PRESETS } from '../shared/models/theme-preset';

@Component({
  selector: 'app-customize',
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule, BreadcrumbsComponent],
  templateUrl: './customize.component.html',
  styleUrl: './customize.component.scss'
})
export class CustomizeComponent implements OnDestroy {
  protected siteSettings = inject(SiteSettingsService);

  readonly presets = THEME_PRESETS;
  selectedTheme = this.siteSettings.theme();

  isSavingTheme = false;
  themeError: string | null = null;
  themeSaved = false;

  logoPreviewUrl: string | null = null;
  selectedLogoFile: File | null = null;
  isSavingLogo = false;
  logoError: string | null = null;

  get currentLogoUrl(): string | null {
    return this.logoPreviewUrl ?? this.siteSettings.logoUrl();
  }

  ngOnDestroy() {
    // Revert any unsaved live preview back to the persisted theme so it
    // doesn't leak into the rest of the app after navigating away.
    this.siteSettings.applyTheme(this.siteSettings.theme());
    if (this.logoPreviewUrl) {
      URL.revokeObjectURL(this.logoPreviewUrl);
    }
  }

  selectTheme(key: string) {
    this.selectedTheme = key;
    this.themeSaved = false;
    this.siteSettings.applyTheme(key);
  }

  async saveTheme() {
    if (this.isSavingTheme) {
      return;
    }

    this.isSavingTheme = true;
    this.themeError = null;
    this.themeSaved = false;

    const error = await this.siteSettings.updateTheme(this.selectedTheme);
    this.isSavingTheme = false;

    if (error) {
      this.themeError = error;
      return;
    }
    this.themeSaved = true;
  }

  onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) {
      return;
    }

    if (this.logoPreviewUrl) {
      URL.revokeObjectURL(this.logoPreviewUrl);
    }
    this.selectedLogoFile = file;
    this.logoPreviewUrl = URL.createObjectURL(file);
    this.logoError = null;
  }

  async saveLogo() {
    if (!this.selectedLogoFile || this.isSavingLogo) {
      return;
    }

    this.isSavingLogo = true;
    this.logoError = null;

    const error = await this.siteSettings.uploadLogo(this.selectedLogoFile);
    this.isSavingLogo = false;

    if (error) {
      this.logoError = error;
      return;
    }

    if (this.logoPreviewUrl) {
      URL.revokeObjectURL(this.logoPreviewUrl);
    }
    this.logoPreviewUrl = null;
    this.selectedLogoFile = null;
  }

  async removeLogo() {
    if (this.isSavingLogo) {
      return;
    }

    this.isSavingLogo = true;
    this.logoError = null;

    const error = await this.siteSettings.removeLogo();
    this.isSavingLogo = false;

    if (error) {
      this.logoError = error;
    }
  }
}
