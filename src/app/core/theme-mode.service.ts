import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'shelfsync-theme-mode';

/** Drives the [data-mode] attribute on <html> that selects the light or
 *  dark half of styles.scss's light-dark() color-scheme tokens. This is a
 *  personal, per-browser display preference (localStorage) — unrelated to
 *  SiteSettingsService's [data-theme] color preset, which is org-wide and
 *  persisted in Supabase. Keep the storage key in sync with the inline
 *  no-flash script in index.html if it ever changes. */
@Injectable({ providedIn: 'root' })
export class ThemeModeService {
  private readonly _mode = signal<ThemeMode>(this.readInitialMode());
  readonly mode = this._mode.asReadonly();

  private readInitialMode(): ThemeMode {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    return stored === 'light' ? 'light' : 'dark';
  }

  /** Applies the current mode to the DOM — call once on app startup. Safe
   *  to call even though index.html's inline script has usually already
   *  set the attribute; this just keeps AppComponent as the one place that
   *  visibly wires services up on load, matching SiteSettingsService.load(). */
  init() {
    this.apply(this._mode());
  }

  toggle() {
    this.set(this._mode() === 'dark' ? 'light' : 'dark');
  }

  set(mode: ThemeMode) {
    this._mode.set(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    this.apply(mode);
  }

  private apply(mode: ThemeMode) {
    document.documentElement.setAttribute('data-mode', mode);
  }
}
