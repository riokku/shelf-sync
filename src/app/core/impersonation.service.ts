import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { AuthService, Profile } from './auth.service';

const STORAGE_KEY = 'shelf-sync:impersonation';

interface ImpersonationState {
  targetUserId: string;
  targetLabel: string;
  targetOrgLabel: string;
  startedAt: string;
}

/** Backs StudioUserDetailComponent's "Impersonate" button and the app-wide
 *  ImpersonationBannerComponent — see impersonate-user's own doc comment and
 *  CLAUDE.md's Project Overview for the full feature/mechanism. This is a
 *  real Auth session swap (start() calls the impersonate-user Edge Function,
 *  then supabase.auth.verifyOtp() on the app's one shared client), not a
 *  client-side "view as" — so beyond the flag this service tracks for the
 *  banner, it does nothing else: every page/guard/RLS check already
 *  reflects the target user correctly because it genuinely is their
 *  session, and AuthService's existing onAuthStateChange listener already
 *  reloads profile/role/organizationId/organizationName on any session
 *  change with no changes needed here.
 *
 *  Only a small, non-sensitive flag (target name/org/start time — never
 *  tokens, since "sign back in manually" was the chosen design, not a
 *  cached-admin-session one-click return) persists to localStorage, so the
 *  banner survives a refresh or even a browser restart, matching how the
 *  underlying Supabase session itself already persists there. */
@Injectable({ providedIn: 'root' })
export class ImpersonationService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  private readonly _state = signal<ImpersonationState | null>(this.readStoredState());
  readonly isImpersonating = computed(() => this._state() !== null);
  readonly targetLabel = computed(() => this._state()?.targetLabel ?? null);
  readonly targetOrgLabel = computed(() => this._state()?.targetOrgLabel ?? null);
  readonly startedAt = computed(() => this._state()?.startedAt ?? null);

  constructor() {
    // Covers the case where impersonation ended some other way than
    // stop() below — most likely the ordinary header Logout button, which
    // signs out directly with no idea this flag exists. Without this, the
    // banner would incorrectly reappear the next time the platform admin
    // signs back in normally as themselves.
    effect(() => {
      if (!this.authService.isAuthenticated() && this._state() !== null) {
        this.clearState();
      }
    });
  }

  /** Starts impersonating `target` — ends the caller's own session and
   *  replaces it with a real one for `target`. Returns an error message on
   *  failure, or null on success (in which case the caller is about to
   *  navigate away as a different user entirely, so there's nothing left
   *  for the caller itself to update). */
  async start(target: Profile, targetOrgLabel: string, reason: string): Promise<string | null> {
    const { data, error } = await this.supabase.functions.invoke<{ email: string; hashedToken: string }>(
      'impersonate-user',
      { body: { targetUserId: target.id, reason } }
    );
    if (error) {
      return await this.extractFunctionErrorMessage(error);
    }
    if (!data) {
      return 'Failed to start impersonation session.';
    }

    // token_hash, not token — a real bug caught live ("Token has expired or
    // is invalid" on every attempt): auth-js's VerifyOtpParams has two
    // distinct shapes, { email, token, type } for a raw OTP code actually
    // sent to that address, and { token_hash, type } for a hashed token
    // pulled straight out of a magic link (exactly what
    // admin.generateLink()'s own hashed_token is for). Passing hashedToken
    // as `token` fed an already-hashed value through the server's own
    // hashing step a second time, which can never match the stored record —
    // this variant needs no email at all.
    const { error: otpError } = await this.supabase.auth.verifyOtp({
      token_hash: data.hashedToken,
      type: 'magiclink'
    });
    if (otpError) {
      return otpError.message;
    }

    const state: ImpersonationState = {
      targetUserId: target.id,
      targetLabel: target.nickname || target.full_name || target.email,
      targetOrgLabel,
      startedAt: new Date().toISOString()
    };
    this._state.set(state);
    this.persistState(state);
    await this.router.navigate(['/home']);
    return null;
  }

  /** Ends impersonation entirely — closes this session's own audit row
   *  (has to happen first, while still authenticated as the target), then
   *  signs out for real and sends the platform admin back to /login to sign
   *  back in as themselves. There's no cached admin session to restore by
   *  design (see this service's own doc comment). */
  async stop(): Promise<void> {
    await this.supabase.rpc('end_current_impersonation');
    this.clearState();
    await this.authService.signOut();
    await this.router.navigate(['/login'], { queryParams: { impersonationEnded: '1' } });
  }

  private clearState() {
    this._state.set(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Best-effort — a private browsing mode or blocked storage just means
      // the flag never persisted in the first place.
    }
  }

  private persistState(state: ImpersonationState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Best-effort — the banner still reflects the in-memory signal for
      // the rest of this tab's session even if it can't persist.
    }
  }

  private readStoredState(): ImpersonationState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      if (
        typeof parsed?.targetUserId === 'string' &&
        typeof parsed?.targetLabel === 'string' &&
        typeof parsed?.targetOrgLabel === 'string' &&
        typeof parsed?.startedAt === 'string'
      ) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  }

  /** The Edge Function returns a real JSON {error: message} body on
   *  failure, but supabase-js's own FunctionsHttpError.message is just a
   *  generic "non-2xx status code" string — the actual reason lives in
   *  error.context, the raw Response, which has to be read (and JSON
   *  parsed) separately to surface it. */
  private async extractFunctionErrorMessage(error: unknown): Promise<string> {
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        if (typeof body?.error === 'string') {
          return body.error;
        }
      } catch {
        // Fall through to the generic message below.
      }
    }
    return error instanceof Error ? error.message : 'Failed to start impersonation session.';
  }
}
