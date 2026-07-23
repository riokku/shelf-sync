import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandLogoComponent } from '../shared/components/brand-logo/brand-logo.component';

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
        BrandLogoComponent
    ],
    templateUrl: './login.component.html',
    styleUrl: './login.component.scss'
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });

  isLoading = false;
  errorMessage: string | null = null;

  async attemptLogin() {
    if (this.form.invalid || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    const { email, password } = this.form.getRawValue();
    const error = await this.authService.signIn(email, password);

    this.isLoading = false;

    if (error) {
      this.errorMessage = error.message;
      return;
    }

    this.router.navigateByUrl(this.safeReturnUrl() ?? '/dashboard');
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
