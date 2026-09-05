import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface TotpEnrollment {
  factorId: string;
  /** The otpauth:// URI an authenticator app would scan — the caller (this
   *  app's own setup modal) renders this into an actual QR image itself via
   *  the `qrcode` package, the same library QrLabelModalComponent already
   *  uses elsewhere in this app, rather than trusting Supabase's own
   *  pre-rendered `qr_code` SVG string — see enrollTotp()'s own doc comment
   *  for why. */
  uri: string;
  secret: string;
}

/** Wraps `supabase.auth.mfa.*` (TOTP only — Supabase also offers phone and
 *  WebAuthn/passkey factors, but TOTP needs no extra infrastructure, no SMS
 *  provider bill, and is the universally-supported baseline every
 *  authenticator app already handles, so it's the only one offered here for
 *  this first pass) for the Account page's enrollment flow, the
 *  /mfa-verify post-login challenge, and approvedGuard's own "does this
 *  session still owe a challenge" check.
 *
 *  Kept as its own root-provided service rather than folded into
 *  AuthService — a genuinely separate concern from session/profile
 *  identity, the same "pull a cohesive slice out to its own service"
 *  reasoning SupplierService/ReservationKitService/ImpersonationService
 *  already establish for themselves. */
@Injectable({ providedIn: 'root' })
export class MfaService {
  private readonly supabase = inject(SupabaseService).client;

  /** True once the account has a factor that's actually `verified` — a
   *  `listFactors()` call can also return a leftover `unverified` factor
   *  from an abandoned enrollment (closed the modal before entering a
   *  code), which shouldn't read as "two-factor is on" anywhere it's
   *  checked. */
  async isEnrolled(): Promise<boolean> {
    return (await this.getVerifiedTotpFactor()) !== null;
  }

  async getVerifiedTotpFactor() {
    const { data, error } = await this.supabase.auth.mfa.listFactors();
    if (error || !data) {
      return null;
    }
    return data.totp.find(factor => factor.status === 'verified') ?? null;
  }

  /** True exactly when this specific session still owes a TOTP challenge
   *  before it can do anything org-scoped — the account has a verified
   *  factor, but this session hasn't completed the aal2 step yet (a fresh
   *  sign-in, most commonly). Drives approvedGuard's redirect to
   *  /mfa-verify and that route's own "nothing to do here" bounce-away once
   *  it's already been satisfied. */
  async isVerificationPending(): Promise<boolean> {
    const { data, error } = await this.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) {
      return false;
    }
    return data.currentLevel === 'aal1' && data.nextLevel === 'aal2';
  }

  /** The one verified factor this session still needs to challenge against,
   *  for /mfa-verify's own code-entry step. `listFactors()` only ever
   *  returns `verified` entries under the `totp` key (see its own generic
   *  signature) — an `unverified` one wouldn't be a real pending-login
   *  challenge to solve, only a leftover from an abandoned enrollment. */
  async getFactorIdToVerify(): Promise<string | null> {
    const factor = await this.getVerifiedTotpFactor();
    return factor?.id ?? null;
  }

  /** Starts enrollment. Clears out any stale `unverified` factor from a
   *  previously abandoned attempt first (closed the setup dialog before
   *  entering a code) — otherwise a retry would pile up an ever-growing set
   *  of dead factors with nothing ever cleaning them up.
   *
   *  Deliberately hands the caller `data.totp.uri` (the raw otpauth:// URI)
   *  rather than Supabase's own pre-rendered `qr_code` SVG string — two
   *  earlier attempts at using that string directly (as a `data:` URL, both
   *  percent-encoded and not) failed to render in a real browser for
   *  reasons that never fully resolved despite matching Supabase's own
   *  documented approach; rendering the QR ourselves via the `qrcode`
   *  package instead — the exact same library and technique
   *  QrLabelModalComponent already uses successfully elsewhere in this
   *  app — sidesteps that whole class of doubt rather than continuing to
   *  debug an unfamiliar third-party string format blind. */
  async enrollTotp(): Promise<{ enrollment: TotpEnrollment | null; error: string | null }> {
    await this.clearUnverifiedTotpFactors();

    const { data, error } = await this.supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error || !data) {
      return { enrollment: null, error: error?.message ?? 'Could not start two-factor setup.' };
    }

    return {
      enrollment: {
        factorId: data.id,
        uri: data.totp.uri,
        secret: data.totp.secret
      },
      error: null
    };
  }

  private async clearUnverifiedTotpFactors(): Promise<void> {
    const { data } = await this.supabase.auth.mfa.listFactors();
    const stale = data?.all.filter(factor => factor.factor_type === 'totp' && factor.status === 'unverified') ?? [];
    await Promise.all(stale.map(factor => this.supabase.auth.mfa.unenroll({ factorId: factor.id })));
  }

  /** Confirms enrollment with the 6-digit code from the authenticator app.
   *  Supabase's own enroll() doc comment: verifying a factor promotes this
   *  session straight to aal2, so there's no separate "now go verify at
   *  login" step required right after setup. */
  async confirmEnrollment(factorId: string, code: string): Promise<string | null> {
    const { error } = await this.supabase.auth.mfa.challengeAndVerify({ factorId, code });
    return error?.message ?? null;
  }

  /** The /mfa-verify step at login — same underlying call as
   *  confirmEnrollment above, kept as its own method purely so each call
   *  site reads as what it's actually doing. */
  async verifyLogin(factorId: string, code: string): Promise<string | null> {
    const { error } = await this.supabase.auth.mfa.challengeAndVerify({ factorId, code });
    return error?.message ?? null;
  }

  async unenroll(factorId: string): Promise<string | null> {
    const { error } = await this.supabase.auth.mfa.unenroll({ factorId });
    return error?.message ?? null;
  }
}
