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
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { SiteSettingsService } from '../core/site-settings.service';
import { BrandLogoComponent } from '../shared/components/brand-logo/brand-logo.component';

function passwordsMatch(control: AbstractControl): ValidationErrors | null {
  const password = control.get('password')?.value;
  const confirmPassword = control.get('confirmPassword')?.value;
  return password === confirmPassword ? null : { passwordMismatch: true };
}

@Component({
    selector: 'app-register',
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
    templateUrl: './register.component.html',
    styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnInit {
  private authService = inject(AuthService);
  private siteSettings = inject(SiteSettingsService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  form = new FormGroup(
    {
      organizationName: new FormControl('', { nonNullable: true }),
      fullName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      nickname: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
      password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(6)] }),
      confirmPassword: new FormControl('', { nonNullable: true, validators: [Validators.required] })
    },
    { validators: passwordsMatch }
  );

  isLoading = false;
  errorMessage: string | null = null;
  confirmationSent = false;
  /** Set once an invite link's `?org=` slug resolves — locks the form into
   *  "join this organization" mode instead of creating a new one. */
  joiningOrganization: { id: string; name: string } | null = null;
  joiningOrganizationLogoUrl: string | null = null;
  invalidInviteLink = false;

  async ngOnInit() {
    const slug = this.route.snapshot.queryParamMap.get('org');
    if (!slug) {
      this.requireOrganizationName();
      return;
    }

    const org = await this.authService.resolveOrganizationBySlug(slug);
    if (org) {
      this.joiningOrganization = org;
      this.joiningOrganizationLogoUrl = await this.siteSettings.loadLogoUrlForOrganization(org.id);
    } else {
      this.invalidInviteLink = true;
      this.requireOrganizationName();
    }
  }

  private requireOrganizationName() {
    this.form.controls.organizationName.addValidators(Validators.required);
    this.form.controls.organizationName.updateValueAndValidity();
  }

  async attemptRegister() {
    if (this.form.invalid || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    const { organizationName, fullName, nickname, email, password } = this.form.getRawValue();
    const organization = this.joiningOrganization
      ? { inviteOrganizationId: this.joiningOrganization.id }
      : { organizationName };
    const { error, needsEmailConfirmation } = await this.authService.signUp(
      email,
      password,
      fullName,
      nickname,
      organization
    );

    this.isLoading = false;

    if (error) {
      this.errorMessage = error.message;
      return;
    }

    if (needsEmailConfirmation) {
      this.confirmationSent = true;
      return;
    }

    this.router.navigate(['/dashboard']);
  }
}
