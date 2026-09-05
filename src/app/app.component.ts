import { Component, effect, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
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

  /** Path-only (matching showChrome()'s own convention below), so a
   *  same-page query-param change — a Settings tab switch, an `?item=`/
   *  `?task=` deep link, a Reports `?range=`, etc. — never re-triggers
   *  focusPageHeading(): those don't swap in a new routed component, so
   *  there's no new page for a screen reader user to be told about, and
   *  yanking focus back to the top on every such click would just be
   *  disruptive. Set from the constructor body, not a field initializer —
   *  `router` is a constructor parameter property, and field initializers
   *  aren't reliably guaranteed to run *after* parameter property
   *  assignment. */
  private lastNavigationPath!: string;

  constructor(
    public router: Router
  ){
    this.lastNavigationPath = this.router.url.split('?')[0];

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

    // Move focus to the new page's own heading on every real navigation —
    // without this, a screen reader (or keyboard-only) user navigating via
    // the drawer/command palette/quick menu gets no signal a navigation
    // even happened, since Angular's router doesn't move focus on its own
    // the way a full page load naturally would. This is a root singleton
    // that lives for the app's whole lifetime, same as the effect() above,
    // so there's no DestroyRef to unsubscribe through.
    this.router.events.subscribe(event => {
      if (!(event instanceof NavigationEnd)) {
        return;
      }
      const path = event.urlAfterRedirects.split('?')[0];
      if (path === this.lastNavigationPath) {
        return;
      }
      this.lastNavigationPath = path;
      this.focusPageHeading();
    });
  }

  /** Looks for a real `<h1>` first, falling back to PageHeaderComponent's
   *  own `role="heading"`/`aria-level="1"` override (see that component's
   *  `headingLevel` input's own doc comment for why some pages' "h1" isn't
   *  a literal `<h1>` tag) — scoped to #main-content so this can never
   *  land on the header/footer's own chrome instead. Headings aren't
   *  natively focusable, so a heading that doesn't already have one gets a
   *  `tabindex="-1"` — off the normal Tab order, but still a valid target
   *  for this one programmatic .focus() call — left in place afterward
   *  rather than removed again, the same harmless-to-leave-set convention
   *  every other "moved focus here on purpose" spot in this app already
   *  uses. Deferred a tick: NavigationEnd fires once the route itself has
   *  resolved, but the routed component's own template — and its heading
   *  — hasn't necessarily painted into the DOM yet at that exact moment. */
  private focusPageHeading() {
    setTimeout(() => {
      const heading = document.querySelector<HTMLElement>('#main-content h1, #main-content [role="heading"][aria-level="1"]');
      if (!heading) {
        return;
      }
      if (!heading.hasAttribute('tabindex')) {
        heading.setAttribute('tabindex', '-1');
      }
      heading.focus();
    });
  }

  /** Hides the header/footer chrome on the public/unauthenticated pages —
   *  the marketing landing page plus pricing/login/register/forgot-password/
   *  reset-password/privacy/terms. Compares path only (ignoring query
   *  params) so links like /register?org=<slug> still count as the
   *  register page. */
  showChrome(): boolean {
    const path = this.router.url.split('?')[0];
    return !['/', '/pricing', '/login', '/register', '/forgot-password', '/reset-password', '/privacy', '/terms'].includes(path);
  }

}
