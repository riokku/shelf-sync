import { Component, DestroyRef, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ImpersonationService } from '../../../core/impersonation.service';

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Persistent, unmissable "you are impersonating someone" indicator —
 *  rendered by AppComponent alongside the header whenever
 *  ImpersonationService.isImpersonating() is true. Hardcoded to
 *  --app-warning-bg/-on-bg (the same fixed, non-theme-derived tokens
 *  .status-badge's own warning pills already use) rather than any
 *  --mat-sys-* role — this has to read as unmissable regardless of which
 *  THEME_PRESETS color or light/dark mode the impersonated org happens to
 *  have picked, same "can't blend into the org's own branding" reasoning
 *  StudioOrgDetailComponent's hardcoded "Retire" red already establishes. */
@Component({
  selector: 'app-impersonation-banner',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './impersonation-banner.component.html',
  styleUrl: './impersonation-banner.component.scss',
})
export class ImpersonationBannerComponent {
  protected impersonationService = inject(ImpersonationService);
  private destroyRef = inject(DestroyRef);

  // Ticks the "started Xm ago" text below without needing a fresh
  // impersonationService.startedAt() value — a plain re-render trigger,
  // recomputed against the same stored startedAt each tick. 30s is frequent
  // enough for a label whose coarsest unit is "a minute".
  private readonly _tick = signal(0);

  constructor() {
    const intervalId = setInterval(() => this._tick.update(value => value + 1), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(intervalId));
  }

  get elapsedLabel(): string {
    this._tick();
    const startedAt = this.impersonationService.startedAt();
    if (!startedAt) {
      return '';
    }
    const diffMs = Date.now() - new Date(startedAt).getTime();
    if (diffMs < 45_000) {
      return 'started just now';
    }
    const minutes = Math.round(diffMs / 60_000);
    if (minutes < 60) {
      return `started ${relativeTimeFormatter.format(-minutes, 'minute')}`;
    }
    const hours = Math.round(diffMs / 3_600_000);
    return `started ${relativeTimeFormatter.format(-hours, 'hour')}`;
  }

  stop() {
    void this.impersonationService.stop();
  }
}
