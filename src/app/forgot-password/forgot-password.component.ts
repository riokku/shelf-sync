import { Component, ViewChild, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandLogoComponent } from '../shared/components/brand-logo/brand-logo.component';
import { TurnstileWidgetComponent } from '../shared/components/turnstile-widget/turnstile-widget.component';

@Component({
  selector: 'app-forgot-password',
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
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss'
})
export class ForgotPasswordComponent {
  private authService = inject(AuthService);

  @ViewChild(TurnstileWidgetComponent) private turnstile?: TurnstileWidgetComponent;

  form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] })
  });

  isLoading = false;
  errorMessage: string | null = null;
  requestSent = false;
  /** See LoginComponent's own field of the same name for why this exists
   *  and gets cleared/reset after a failed submit. */
  captchaToken: string | null = null;

  async requestReset() {
    if (this.isLoading) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // See LoginComponent.attemptLogin()'s own comment on why this can't
    // rely on the submit button's [disabled] binding alone.
    if (!this.captchaToken) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    const { email } = this.form.getRawValue();
    const error = await this.authService.requestPasswordReset(email, this.captchaToken ?? undefined);

    this.isLoading = false;

    // An unregistered email isn't an error at all here — see
    // requestPasswordReset()'s doc comment — so anything that does come
    // back is a genuine failure (rate limit, network) worth surfacing.
    if (error) {
      this.errorMessage = error.message;
      this.captchaToken = null;
      this.turnstile?.reset();
      return;
    }

    this.requestSent = true;
  }
}
