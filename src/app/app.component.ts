import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './core/auth.service';
import { SiteSettingsService } from './core/site-settings.service';
import { ThemeModeService } from './core/theme-mode.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false
})
export class AppComponent {
  title = 'ShelfSync';
  private authService = inject(AuthService);
  private siteSettings = inject(SiteSettingsService);
  private themeMode = inject(ThemeModeService);

  constructor(
    public router: Router
  ){
    // site_settings is per-organization, so branding has to reload whenever
    // the signed-in profile (and thus organization) changes — on startup, on
    // login, and back to the default theme/logo on logout.
    effect(() => {
      this.authService.profile();
      this.siteSettings.load();
    });

    // Personal light/dark preference — unlike site settings, this doesn't
    // depend on auth state at all (localStorage-only), so it's applied once
    // rather than inside the effect above. index.html's inline script
    // already applies it before Angular boots to avoid a flash; this covers
    // soft navigations and the case where nothing was in localStorage yet.
    this.themeMode.init();
  }

  /** Hides the header/footer chrome on the public/unauthenticated pages —
   *  the marketing landing page plus login/register/forgot-password/
   *  reset-password/privacy/terms. Compares path only (ignoring query
   *  params) so links like /register?org=<slug> still count as the
   *  register page. */
  showChrome(): boolean {
    const path = this.router.url.split('?')[0];
    return !['/', '/login', '/register', '/forgot-password', '/reset-password', '/privacy', '/terms'].includes(path);
  }

}
