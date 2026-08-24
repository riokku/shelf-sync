import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
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
import { TurnstileWidgetComponent } from '../shared/components/turnstile-widget/turnstile-widget.component';

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
        BrandLogoComponent,
        TurnstileWidgetComponent
    ],
    templateUrl: './register.component.html',
    styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnInit {
  private authService = inject(AuthService);
  private siteSettings = inject(SiteSettingsService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  @ViewChild(TurnstileWidgetComponent) private turnstile?: TurnstileWidgetComponent;

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
  /** See LoginComponent's own field of the same name for why this exists
   *  and gets cleared/reset after a failed submit. */
  captchaToken: string | null = null;
  /** Set once an invite link's `?org=` slug resolves — locks the form into
   *  "join this organization" mode instead of creating a new one. */
  joiningOrganization: { id: string; name: string } | null = null;
  joiningOrganizationLogoUrl: string | null = null;
  invalidInviteLink = false;

  /** Toggles the value-prop pitch (benefits list + "Get started") for the
   *  actual signup form — see revealForm(). Starts true instead when
   *  arriving via an invite link (org= present in ngOnInit): that's
   *  already a different context than an organic signup, so skipping
   *  straight to the form rather than the generic marketing pitch. */
  protected readonly showForm = signal(false);

  async ngOnInit() {
    const slug = this.route.snapshot.queryParamMap.get('org');
    if (!slug) {
      this.requireOrganizationName();
      return;
    }

    this.showForm.set(true);

    const org = await this.authService.resolveOrganizationBySlug(slug);
    if (org) {
      this.joiningOrganization = org;
      this.joiningOrganizationLogoUrl = await this.siteSettings.loadLogoUrlForOrganization(org.id);
    } else {
      this.invalidInviteLink = true;
      this.requireOrganizationName();
    }
  }

  protected revealForm(): void {
    this.showForm.set(true);
  }

  private requireOrganizationName() {
    this.form.controls.organizationName.addValidators(Validators.required);
    this.form.controls.organizationName.updateValueAndValidity();
  }

  async attemptRegister() {
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

    const { organizationName, fullName, nickname, email, password } = this.form.getRawValue();
    const organization = this.joiningOrganization
      ? { inviteOrganizationId: this.joiningOrganization.id }
      : { organizationName };
    const { error, needsEmailConfirmation } = await this.authService.signUp(
      email,
      password,
      fullName,
      nickname,
      organization,
      this.captchaToken ?? undefined
    );

    this.isLoading = false;

    if (error) {
      this.errorMessage = error.message;
      this.captchaToken = null;
      this.turnstile?.reset();
      return;
    }

    if (needsEmailConfirmation) {
      this.confirmationSent = true;
      return;
    }

    this.router.navigate(['/home']);
  }
}
