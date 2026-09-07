import { Component, ViewChild, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MfaService } from '../core/mfa.service';
import { BrandLogoComponent } from '../shared/components/brand-logo/brand-logo.component';
import { TurnstileWidgetComponent } from '../shared/components/turnstile-widget/turnstile-widget.component';

@Component({
    selector: 'app-login',
    imports: [
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatIconModule,
        MatProgressSpinnerModule,
        RouterModule,
        BrandLogoComponent,
        TurnstileWidgetComponent
    ],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss'
})
export class LoginComponent {
  private authService = inject(AuthService);
  private mfaService = inject(MfaService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @ViewChild(TurnstileWidgetComponent) private turnstile?: TurnstileWidgetComponent;

  form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });

  isLoading = false;
  errorMessage: string | null = null;
  /** Set from the Turnstile widget's own `verified` output, cleared on
   *  `cleared` (expiry/error) or after a failed submit — see
   *  attemptLogin()'s own comment for why a failed attempt needs a fresh
   *  one rather than retrying with the same token. */
  captchaToken: string | null = null;

  async attemptLogin() {
    if (this.isLoading) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // The submit button's own [disabled] binding already covers a mouse
    // click, but (ngSubmit) also fires on pressing Enter in a form field
    // regardless of the button's disabled state — this is what actually
    // stops that path from reaching signIn() without a token.
    if (!this.captchaToken) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    const { email, password } = this.form.getRawValue();
    const error = await this.authService.signIn(email, password, this.captchaToken ?? undefined);

    this.isLoading = false;

    if (error) {
      this.errorMessage = error.message;
      // A Turnstile token is single-use — Supabase already consumed (or
      // rejected) it on this attempt, so the widget needs to hand back a
      // fresh one before the next submit can succeed.
      this.captchaToken = null;
      this.turnstile?.reset();
      return;
    }

    // approvedGuard would catch this on the very next navigation regardless
    // (see its own doc comment) — checking here too just avoids a visible
    // flash of whichever destination this would otherwise land on before
    // being bounced back out.
    const returnUrl = this.safeReturnUrl();
    if (await this.mfaService.isVerificationPending()) {
      this.router.navigate(['/mfa-verify'], returnUrl ? { queryParams: { returnUrl } } : {});
      return;
    }

    // Same shortcut, for the "this org requires two-factor and this account
    // has never enrolled at all" case approvedGuard also redirects to
    // /account for (see that guard's own doc comment) — there's no factor
    // yet to send this to /mfa-verify against.
    if (await this.mfaService.isRequiredOrgWide() && !(await this.mfaService.isEnrolled())) {
      this.router.navigateByUrl('/account');
      return;
    }

    this.router.navigateByUrl(returnUrl ?? '/home');
  }

  /** Only follow returnUrl if it's a same-app relative path — it comes from
   *  a query param (authGuard's redirect, see auth.guard.ts), so it's
   *  user-controllable input and shouldn't be trusted blindly. `//host/...`
   *  is rejected too: browsers treat a leading `//` as protocol-relative,
   *  i.e. an external URL, even though it "starts with /". */
  private safeReturnUrl(): string | null {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : null;
  }

  /** ImpersonationService.stop() lands here with this query param — "sign
   *  back in manually" was the deliberate design (see that service's own
   *  doc comment: no admin session is cached anywhere for this feature), so
   *  this just explains why a platform admin was suddenly signed out rather
   *  than leaving them to wonder. */
  get impersonationEnded(): boolean {
    return this.route.snapshot.queryParamMap.get('impersonationEnded') === '1';
  }

  /** MfaVerifyComponent.recoverWithCode() lands here after a successful
   *  recovery-code redemption — that removes the account's TOTP factor and
   *  signs it out everywhere (see that method's own doc comment), so this
   *  explains why they're suddenly back at login and nudges them to set
   *  two-factor up again, same "explain the surprise sign-out" shape
   *  impersonationEnded just above already establishes. */
  get mfaRecovered(): boolean {
    return this.route.snapshot.queryParamMap.get('mfaRecovered') === '1';
  }
}
