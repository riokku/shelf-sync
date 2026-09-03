import { Injectable, NgZone, inject } from '@angular/core';
import { SiteSettingsService } from './site-settings.service';
import { ConfettiService } from './confetti.service';

const PARTY_THEME = 'party';
const DURATION_MS = 8000;
const BURST_INTERVAL_MS = 1400;

/** Triggered by HeaderComponent's own Konami code easter egg — a genuinely
 *  pointless bit of fun, same spirit as that code's existing confetti burst
 *  + toast, just a bigger version: temporarily swaps the whole app into the
 *  'party' theme (see that [data-theme] block's own comment in styles.scss)
 *  and fires a confetti burst every BURST_INTERVAL_MS, then reverts back to
 *  whatever the org's real theme actually is once DURATION_MS has passed.
 *
 *  Reuses SiteSettingsService.applyTheme() — the same non-persisting
 *  `[data-theme]`-attribute swap that service's own Settings-page live
 *  preview already uses — rather than adding a second way to change the
 *  theme attribute; nothing here ever calls updateTheme() (the persisting
 *  version), so an org's actual saved theme is never touched.
 *
 *  Root-provided, same "thin wrapper other components call instead of
 *  reaching for the underlying machinery directly" shape
 *  NotificationService/ConfettiService already have. */
@Injectable({ providedIn: 'root' })
export class PartyModeService {
  private siteSettings = inject(SiteSettingsService);
  private confetti = inject(ConfettiService);
  private ngZone = inject(NgZone);

  private isActive = false;

  start() {
    // Already partying — let the run already in progress finish on its own
    // rather than restacking a second set of timers (which would also
    // capture the *party* theme as "the theme to revert to" instead of the
    // org's real one).
    if (this.isActive) {
      return;
    }
    this.isActive = true;

    const themeToRestore = this.siteSettings.theme();
    this.siteSettings.applyTheme(PARTY_THEME);
    this.confetti.burst();

    // Scheduled outside Angular's zone — a live interval/timeout left
    // running *inside* the zone is a real, previously-hit gotcha in this
    // app: NgZone/ComponentFixture.whenStable() treat one as permanently-
    // pending work for as long as it's ticking, which would silently hang
    // any future spec that triggers party mode and then awaits
    // whenStable() (see LoadingCaptionComponent's own identical fix and
    // doc comment for the exact failure this class of bug causes).
    // ngZone.run() below re-enters the zone for the two calls that need
    // Angular to actually notice them.
    this.ngZone.runOutsideAngular(() => {
      const intervalId = window.setInterval(() => this.ngZone.run(() => this.confetti.burst()), BURST_INTERVAL_MS);
      window.setTimeout(() => {
        window.clearInterval(intervalId);
        this.ngZone.run(() => {
          this.siteSettings.applyTheme(themeToRestore);
          this.isActive = false;
        });
      }, DURATION_MS);
    });
  }
}
