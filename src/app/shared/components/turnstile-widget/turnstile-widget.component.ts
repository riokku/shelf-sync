import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { environment } from '../../../../environments/environment';

/** Cloudflare's own script — loaded lazily (not in index.html) since only
 *  the three pre-login auth forms that embed this component ever need it.
 *  Module-level (not a class field) so every instance of this component on
 *  the page shares one load, same "load once, reuse" shape this app's other
 *  singleton-ish browser-API wrappers already use. */
const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
let turnstileScriptPromise: Promise<void> | null = null;

interface TurnstileRenderOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

interface TurnstileApi {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/** Resolves once `window.turnstile` is available — either because a fake
 *  already set it (every spec that mounts this component does, so tests
 *  never trigger a real network request) or because the real script has
 *  finished loading. Checked fresh on every call (not just once via the
 *  cached promise) so a test-provided fake always short-circuits this
 *  regardless of whether some earlier test already resolved the real
 *  promise. */
function loadTurnstile(): Promise<void> {
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (!turnstileScriptPromise) {
    turnstileScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load the Turnstile script'));
      document.head.appendChild(script);
    });
  }
  return turnstileScriptPromise;
}

/** Cloudflare Turnstile widget, embedded on the three pre-login auth forms
 *  (Register/Login/Forgot password — see AuthService.signUp()/signIn()/
 *  requestPasswordReset()'s own `captchaToken` params) to stop scripted
 *  signup/credential-stuffing/password-reset abuse. Supabase enforces
 *  captcha verification project-wide across all three of those Auth
 *  endpoints together once enabled (Auth > Attack Protection on the hosted
 *  project's dashboard, not something this repo's migrations/config.toml
 *  can turn on for the hosted project by themselves) — there's no way to
 *  require it on just one of the three, which is why this same component is
 *  reused on all three rather than only Register.
 *
 *  A fourth usage, ChangePasswordModalComponent, is post-login rather than
 *  pre-login — it needs a token for the same reason Login does, since it
 *  reauthenticates the caller's current password via the same
 *  signInWithPassword() call, which the project-wide captcha requirement
 *  above covers regardless of whether the caller already has a session.
 *
 *  `verified`/`cleared` (not a two-way-bindable token property) mirror
 *  Turnstile's own callback/expired-callback/error-callback shape directly:
 *  the parent form owns the actual token value and is what needs to clear
 *  it (disabling submit again) on expiry/error, not this component. */
@Component({
  selector: 'app-turnstile-widget',
  imports: [],
  templateUrl: './turnstile-widget.component.html',
  styleUrl: './turnstile-widget.component.scss'
})
export class TurnstileWidgetComponent implements OnInit, OnDestroy {
  @ViewChild('container', { static: true }) private containerRef!: ElementRef<HTMLDivElement>;

  @Output() readonly verified = new EventEmitter<string>();
  @Output() readonly cleared = new EventEmitter<void>();

  private widgetId: string | null = null;

  async ngOnInit() {
    await loadTurnstile();
    // The container could already be gone if this component was destroyed
    // (e.g. navigated away) while the script load above was still pending —
    // window.turnstile itself doesn't check that for us.
    if (!this.containerRef?.nativeElement.isConnected) {
      return;
    }
    this.widgetId = window.turnstile!.render(this.containerRef.nativeElement, {
      sitekey: environment.turnstileSiteKey,
      callback: token => this.verified.emit(token),
      'expired-callback': () => this.cleared.emit(),
      'error-callback': () => this.cleared.emit()
    });
  }

  /** Called by the parent form after a failed submit — a Turnstile token is
   *  single-use, so retrying with the same one would just fail Supabase's
   *  own verification a second time. Fetches a fresh token from the same
   *  widget instead of tearing down and re-rendering a new one. */
  reset() {
    if (this.widgetId !== null) {
      window.turnstile?.reset(this.widgetId);
    }
  }

  ngOnDestroy() {
    if (this.widgetId !== null) {
      window.turnstile?.remove(this.widgetId);
    }
  }
}
