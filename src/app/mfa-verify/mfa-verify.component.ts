import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../core/auth.service';
import { MfaService } from '../core/mfa.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';

/** The post-login step for an account that has two-factor enabled — reached
 *  only via approvedGuard's own redirect (a session that still owes a TOTP
 *  challenge — see MfaService.isVerificationPending()), the same "guard
 *  redirects to a dedicated status page" shape PendingApprovalComponent
 *  already establishes for a pending/locked profile, right down to keeping
 *  the normal header/footer chrome (not added to AppComponent.showChrome()'s
 *  hide-list) since this is a real, already-authenticated session, not a
 *  pre-login page. Guarded by plain authGuard, not approvedGuard — guarding
 *  it with the very check it exists to satisfy would bounce it back to
 *  itself. */
@Component({
  selector: 'app-mfa-verify',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    BreadcrumbsComponent
  ],
  templateUrl: './mfa-verify.component.html',
  styleUrl: './mfa-verify.component.scss'
})
export class MfaVerifyComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly mfaService = inject(MfaService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  isLoading = true;
  isSubmitting = false;
  errorMessage: string | null = null;
  factorId: string | null = null;

  codeControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{6}$/)]
  });

  /** "Lost your device?" toggles this on, revealing a recovery-code field
   *  in place of the normal 6-digit one — see recoverWithCode()'s own doc
   *  comment for what a valid code actually does. */
  showRecoveryForm = false;
  isRecovering = false;
  recoveryError: string | null = null;
  recoveryCodeControl = new FormControl('', { nonNullable: true, validators: [Validators.required] });

  toggleRecoveryForm() {
    this.showRecoveryForm = !this.showRecoveryForm;
    this.errorMessage = null;
    this.recoveryError = null;
    this.recoveryCodeControl.reset();
  }

  async ngOnInit() {
    const pending = await this.mfaService.isVerificationPending();
    if (!pending) {
      // Stale bookmark/back-button, or this session already cleared the
      // challenge some other way — nothing to verify here. Same "bounce
      // away, nothing to show" shape PendingApprovalComponent's own
      // ngOnInit() already establishes for an already-approved profile.
      this.router.navigateByUrl(this.safeReturnUrl() ?? '/home');
      return;
    }

    this.factorId = await this.mfaService.getFactorIdToVerify();
    this.isLoading = false;

    if (!this.factorId) {
      this.errorMessage = 'Something went wrong loading your two-factor setup. Try signing in again.';
    }
  }

  async confirm() {
    if (!this.factorId || this.isSubmitting) {
      return;
    }
    if (this.codeControl.invalid) {
      this.codeControl.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;

    const error = await this.mfaService.verifyLogin(this.factorId, this.codeControl.value);

    this.isSubmitting = false;

    if (error) {
      this.errorMessage = error;
      this.codeControl.reset();
      return;
    }

    this.router.navigateByUrl(this.safeReturnUrl() ?? '/home');
  }

  /** Redeeming a valid code removes the account's TOTP factor server-side
   *  (see MfaService.redeemRecoveryCode()'s own doc comment) — which signs
   *  this session out along with every other active one, so there's no
   *  session left here to navigate onward with. signOut() clears this
   *  client's own local state to match, and /login?mfaRecovered=1 is where
   *  they land to sign back in and, once there, set up two-factor again
   *  from the Account page — the same "explain why you're back at login"
   *  shape /login?impersonationEnded=1 already establishes. */
  async recoverWithCode() {
    if (this.isRecovering) {
      return;
    }
    if (this.recoveryCodeControl.invalid) {
      this.recoveryCodeControl.markAsTouched();
      return;
    }

    this.isRecovering = true;
    this.recoveryError = null;

    const error = await this.mfaService.redeemRecoveryCode(this.recoveryCodeControl.value);

    if (error) {
      this.isRecovering = false;
      this.recoveryError = error;
      return;
    }

    await this.authService.signOut();
    this.router.navigate(['/login'], { queryParams: { mfaRecovered: '1' } });
  }

  /** Same relative-path-only check LoginComponent's own safeReturnUrl()
   *  already establishes — returnUrl comes from a query param
   *  (approvedGuard's own redirect), so it's user-controllable input and
   *  shouldn't be trusted blindly. */
  private safeReturnUrl(): string | null {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : null;
  }

  /** Matches PendingApprovalComponent's own logout() exactly — someone
   *  stuck here (lost their authenticator device) can at least get back to
   *  a clean sign-in screen rather than being stranded. */
  async logout() {
    await this.authService.signOut();
    this.router.navigate(['/']);
  }
}
