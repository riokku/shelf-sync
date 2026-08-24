import { Component, ViewChild, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../core/auth.service';
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

    this.router.navigateByUrl(this.safeReturnUrl() ?? '/home');
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
}
