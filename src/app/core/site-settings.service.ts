import { Injectable, computed, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

const LOGO_BUCKET = 'site-assets';

@Injectable({ providedIn: 'root' })
export class SiteSettingsService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly authService = inject(AuthService);

  private readonly _theme = signal('default');
  readonly theme = this._theme.asReadonly();

  private readonly _logoStoragePath = signal<string | null>(null);
  readonly logoUrl = computed(() => {
    const path = this._logoStoragePath();
    if (!path) {
      return null;
    }
    return this.supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
  });

  /** Loads the caller's own organization's settings row and applies the theme
   *  attribute. `site_settings` is per-organization and no longer readable by
   *  anon, so pre-login (and any signed-out state) just falls back to the
   *  built-in default theme/logo instead of querying. Call once a profile is
   *  available (e.g. after AuthService's session/profile resolve). */
  async load() {
    const profile = await this.authService.getProfile();
    if (!profile) {
      this._theme.set('default');
      this._logoStoragePath.set(null);
      this.applyTheme('default');
      return;
    }

    const { data } = await this.supabase
      .from('site_settings')
      .select('*')
      .eq('organization_id', profile.organization_id)
      .maybeSingle();

    this._theme.set(data?.theme ?? 'default');
    this._logoStoragePath.set(data?.logo_storage_path ?? null);
    this.applyTheme(this._theme());
  }

  /** Swaps the [data-theme] attribute driving the precompiled theme blocks
   *  in styles.scss, without persisting anything — used for live preview. */
  applyTheme(theme: string) {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  async updateTheme(theme: string): Promise<string | null> {
    const session = await this.authService.getSession();
    const organizationId = this.authService.organizationId();
    if (!session || !organizationId) {
      return 'You must be signed in to update the theme.';
    }

    const { error } = await this.supabase
      .from('site_settings')
      .upsert(
        { organization_id: organizationId, theme, updated_by: session.user.id },
        { onConflict: 'organization_id' }
      );

    if (error) {
      return error.message;
    }

    this._theme.set(theme);
    this.applyTheme(theme);
    return null;
  }

  async uploadLogo(file: File): Promise<string | null> {
    const session = await this.authService.getSession();
    const organizationId = this.authService.organizationId();
    if (!session || !organizationId) {
      return 'You must be signed in to upload a logo.';
    }

    const path = `${organizationId}/logo-${Date.now()}-${file.name}`;
    const { error: uploadError } = await this.supabase.storage.from(LOGO_BUCKET).upload(path, file);
    if (uploadError) {
      return uploadError.message;
    }

    const previousPath = this._logoStoragePath();
    const { error: updateError } = await this.supabase
      .from('site_settings')
      .upsert(
        { organization_id: organizationId, logo_storage_path: path, updated_by: session.user.id },
        { onConflict: 'organization_id' }
      );

    if (updateError) {
      return updateError.message;
    }

    this._logoStoragePath.set(path);
    if (previousPath) {
      await this.supabase.storage.from(LOGO_BUCKET).remove([previousPath]);
    }
    return null;
  }

  async removeLogo(): Promise<string | null> {
    const previousPath = this._logoStoragePath();
    if (!previousPath) {
      return null;
    }

    const session = await this.authService.getSession();
    const organizationId = this.authService.organizationId();
    if (!session || !organizationId) {
      return 'You must be signed in to remove the logo.';
    }

    const { error } = await this.supabase
      .from('site_settings')
      .update({ logo_storage_path: null, updated_by: session.user.id })
      .eq('organization_id', organizationId);

    if (error) {
      return error.message;
    }

    this._logoStoragePath.set(null);
    await this.supabase.storage.from(LOGO_BUCKET).remove([previousPath]);
    return null;
  }
}
