import { Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './core/auth.service';
import { SiteSettingsService } from './core/site-settings.service';

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
  }

  /** Hides the header/footer chrome on the unauthenticated login/register
   *  pages. Compares path only (ignoring query params) so links like
   *  /register?org=<slug> still count as the register page. */
  showChrome(): boolean {
    const path = this.router.url.split('?')[0];
    return path !== '/' && path !== '/register';
  }

}
