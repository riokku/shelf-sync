import { Component, OnInit, inject } from '@angular/core';
import {
  AbstractControl,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandLogoComponent } from '../shared/components/brand-logo/brand-logo.component';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

/** The page a password-reset email link lands on. Unguarded (like
 *  login/register) rather than behind authGuard — the "session" here is
 *  the short-lived recovery one supabase-js's `detectSessionInUrl` pulls
 *  out of the link's URL fragment on load, not a normal signed-in visit,
 *  and gating on authGuard would race that detection on a hard load. */
@Component({
  selector: 'app-reset-password',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    RouterModule,
    BrandLogoComponent
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  form = new FormGroup(
    {
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
      confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] })
    },
    { validators: passwordsMatch }
  );

  isLoading = false;
  errorMessage: string | null = null;
  passwordUpdated = false;

  /** Null while the initial getSession() check is still in flight — the
   *  form stays hidden until this resolves one way or the other, rather
   *  than flashing a "link expired" message before detectSessionInUrl has
   *  had a chance to run. */
  hasRecoverySession: boolean | null = null;

  async ngOnInit() {
    const session = await this.authService.getSession();
    this.hasRecoverySession = session !== null;
  }

  async updatePassword() {
    if (this.isLoading) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    const { password } = this.form.getRawValue();
    const error = await this.authService.updatePassword(password);

    this.isLoading = false;

    if (error) {
      this.errorMessage = error.message;
      return;
    }

    this.passwordUpdated = true;
  }

  continueToApp() {
    this.router.navigate(['/home']);
  }
}
