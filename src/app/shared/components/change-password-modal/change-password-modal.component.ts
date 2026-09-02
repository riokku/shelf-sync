import { Component, ViewChild, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/auth.service';
import { TurnstileWidgetComponent } from '../turnstile-widget/turnstile-widget.component';

export interface ChangePasswordModalData {
  email: string;
}

function newPasswordsMatch(control: AbstractControl): ValidationErrors | null {
  const newPassword = control.get('newPassword')?.value;
  const confirmNewPassword = control.get('confirmNewPassword')?.value;
  return newPassword === confirmNewPassword ? null : { passwordMismatch: true };
}

/** Self-contained (it does the actual write itself, same convention every
 *  other self-contained modal in this app follows — see e.g.
 *  SupplierFormModalComponent's own doc comment). Opened from AccountComponent.
 *
 *  Supabase's `auth.updateUser({ password })` (AuthService.updatePassword())
 *  has no "reauthenticate first" step of its own — it succeeds for any
 *  currently-signed-in session regardless of whether the caller still knows
 *  their *current* password. To actually require that, this re-runs the
 *  entered current password through AuthService.signIn() (the same
 *  signInWithPassword() call Login itself uses) first; only once that
 *  succeeds does it call updatePassword() with the new one.
 *
 *  That reauth step needs a real Turnstile token, same as Login itself:
 *  Supabase's own Attack Protection captcha covers `/auth/v1/token?
 *  grant_type=password` project-wide the instant it's enabled (see
 *  CLAUDE.md), with no way to exempt an already-signed-in caller's own
 *  reauth attempt from it. TurnstileWidgetComponent's own doc comment calls
 *  out "the three pre-login auth forms" as its only consumers — this is the
 *  fourth, despite living behind approvedGuard rather than being reachable
 *  signed out. */
@Component({
  selector: 'app-change-password-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TurnstileWidgetComponent
  ],
  templateUrl: './change-password-modal.component.html',
  styleUrl: './change-password-modal.component.scss',
})
export class ChangePasswordModalComponent {
  private authService = inject(AuthService);
  dialogRef = inject(MatDialogRef<ChangePasswordModalComponent>);
  data = inject<ChangePasswordModalData>(MAT_DIALOG_DATA);

  @ViewChild(TurnstileWidgetComponent) private turnstile?: TurnstileWidgetComponent;

  form = new FormGroup(
    {
      currentPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      newPassword: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
      confirmNewPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] })
    },
    { validators: newPasswordsMatch }
  );

  isSaving = false;
  error: string | null = null;
  /** Set from the Turnstile widget's own `verified` output, cleared on
   *  `cleared` (expiry/error) or after a failed attempt — see
   *  LoginComponent's own identical field for the full reasoning. */
  captchaToken: string | null = null;

  async confirm() {
    if (this.isSaving) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // The confirm button's own [disabled] binding already covers this in
    // the template — this guard is defense-in-depth for any direct caller
    // of confirm(), same shape LoginComponent's own attemptLogin() has.
    if (!this.captchaToken) {
      return;
    }

    this.isSaving = true;
    this.error = null;

    const { currentPassword, newPassword } = this.form.getRawValue();

    const signInError = await this.authService.signIn(this.data.email, currentPassword, this.captchaToken);
    if (signInError) {
      this.isSaving = false;
      this.error = signInError.message;
      this.resetCaptcha();
      return;
    }

    const updateError = await this.authService.updatePassword(newPassword);
    this.isSaving = false;

    if (updateError) {
      this.error = updateError.message;
      this.resetCaptcha();
      return;
    }

    this.dialogRef.close(true);
  }

  /** A Turnstile token is single-use — Supabase already consumed (or
   *  rejected) it on the reauth attempt above, so the widget needs to hand
   *  back a fresh one before a retry can succeed. Called on any failure,
   *  not just a signIn one, since the token was already spent by the time
   *  either call could fail. */
  private resetCaptcha() {
    this.captchaToken = null;
    this.turnstile?.reset();
  }

  cancel() {
    this.dialogRef.close();
  }
}
