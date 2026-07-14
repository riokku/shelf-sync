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

  /** Loads the singleton settings row and applies the theme attribute.
   *  Called once from AppComponent on startup, regardless of auth state —
   *  the row is readable by anon too so branding applies pre-login. */
  async load() {
    const { data } = await this.supabase.from('site_settings').select('*').eq('id', 1).single();
    if (data) {
      this._theme.set(data.theme);
      this._logoStoragePath.set(data.logo_storage_path);
    }
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
    const { error } = await this.supabase
      .from('site_settings')
      .update({ theme, updated_by: session?.user.id ?? null })
      .eq('id', 1);

    if (error) {
      return error.message;
    }

    this._theme.set(theme);
    this.applyTheme(theme);
    return null;
  }

  async uploadLogo(file: File): Promise<string | null> {
    const path = `logo-${Date.now()}-${file.name}`;
    const { error: uploadError } = await this.supabase.storage.from(LOGO_BUCKET).upload(path, file);
    if (uploadError) {
      return uploadError.message;
    }

    const session = await this.authService.getSession();
    const previousPath = this._logoStoragePath();
    const { error: updateError } = await this.supabase
      .from('site_settings')
      .update({ logo_storage_path: path, updated_by: session?.user.id ?? null })
      .eq('id', 1);

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
    const { error } = await this.supabase
      .from('site_settings')
      .update({ logo_storage_path: null, updated_by: session?.user.id ?? null })
      .eq('id', 1);

    if (error) {
      return error.message;
    }

    this._logoStoragePath.set(null);
    await this.supabase.storage.from(LOGO_BUCKET).remove([previousPath]);
    return null;
  }
}
