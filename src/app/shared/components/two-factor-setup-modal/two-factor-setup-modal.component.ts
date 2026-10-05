import { Component, OnInit, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import * as QRCode from 'qrcode';
import { MfaService, TotpEnrollment } from '../../../core/mfa.service';

/** Self-contained (it does the actual enroll()/challengeAndVerify() calls
 *  itself, same convention every other self-contained modal in this app
 *  follows — see e.g. SupplierFormModalComponent's own doc comment). Opened
 *  from AccountComponent's "Two-factor authentication" card.
 *
 *  The confirm button is a plain `type="button" (click)="confirm()"`, not a
 *  `<form (ngSubmit)>` — deliberately mirroring ChangePasswordModalComponent's
 *  own choice rather than the shape that's bitten this codebase twice
 *  (LockUserAccountModalComponent, then AuditDetailComponent's own count
 *  form — see either's own doc comment): a bare `<form (ngSubmit)>` with no
 *  `[formGroup]` silently never fires without FormsModule also imported.
 *  Sidestepping the whole shape entirely is simpler than remembering the
 *  FormsModule fix on every future form.
 *
 *  Renders its own QR code via the `qrcode` package (`QRCode.toDataURL()`)
 *  fed with MfaService's own `enrollment.uri` — the same library and
 *  technique QrLabelModalComponent already uses elsewhere in this app —
 *  rather than trusting Supabase's own pre-rendered SVG string, which two
 *  earlier attempts at using directly (as a `data:` URL) failed to actually
 *  render in a real browser. `QRCode.toDataURL()` returns a plain
 *  `data:image/png;base64,...` string, which needs no DomSanitizer bypass
 *  at all to bind to `<img src>` (same as QrLabelModalComponent's own plain
 *  `[src]="qrDataUrl"` binding) — one less thing to get wrong. */
@Component({
  selector: 'app-two-factor-setup-modal',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './two-factor-setup-modal.component.html',
  styleUrl: './two-factor-setup-modal.component.scss'
})
export class TwoFactorSetupModalComponent implements OnInit {
  private readonly mfaService = inject(MfaService);
  readonly dialogRef = inject(MatDialogRef<TwoFactorSetupModalComponent>);

  isLoading = true;
  isSubmitting = false;
  errorMessage: string | null = null;
  enrollment: TotpEnrollment | null = null;
  qrDataUrl: string | null = null;

  codeControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d{6}$/)]
  });

  async ngOnInit() {
    const { enrollment, error } = await this.mfaService.enrollTotp();
    this.isLoading = false;

    if (error || !enrollment) {
      this.errorMessage = error ?? 'Could not start two-factor setup. Try again.';
      return;
    }

    this.enrollment = enrollment;

    try {
      this.qrDataUrl = await QRCode.toDataURL(enrollment.uri, { width: 240, margin: 2 });
    } catch {
      // The manual-entry secret still renders regardless (see the
      // template's own @else if (enrollment) branch) — a QR-render failure
      // shouldn't block someone from finishing setup by typing the code in
      // by hand instead.
      this.errorMessage = 'Could not render the QR code — enter the code below manually instead.';
    }
  }

  async confirm() {
    if (!this.enrollment || this.isSubmitting) {
      return;
    }
    if (this.codeControl.invalid) {
      this.codeControl.markAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;

    const error = await this.mfaService.confirmEnrollment(this.enrollment.factorId, this.codeControl.value);

    this.isSubmitting = false;

    if (error) {
      this.errorMessage = error;
      return;
    }

    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close(false);
  }
}
