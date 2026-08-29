import { Component, inject } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface SuspendOrganizationModalData {
  organizationName: string;
}

/** Captures a mandatory reason before calling platform_suspend_organization()
 *  — same "a consequential-but-reversible action should still say why"
 *  reasoning DiscardModalComponent's own mandatory reason field already
 *  establishes for stock discards, applied here to locking a whole org out.
 *  Simpler than DeleteOrganizationModalComponent's type-to-confirm shape —
 *  suspension is reversible (platform_unsuspend_organization undoes it
 *  completely), so it doesn't need that same deliberate-friction treatment,
 *  just a reason. Resolves with the entered reason string, or undefined on
 *  cancel.
 *
 *  FormsModule is imported alongside ReactiveFormsModule purely for NgForm —
 *  see LockUserAccountModalComponent's own identical doc comment (a near-
 *  exact copy of this component) for why a bare `<form (ngSubmit)>` with no
 *  `[formGroup]` silently falls through to a native, page-reloading form
 *  submission without it, caught only once that copy was actually clicked
 *  through in a real browser rather than just unit-tested. */
@Component({
  selector: 'app-suspend-organization-modal',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './suspend-organization-modal.component.html',
  styleUrl: './suspend-organization-modal.component.scss',
})
export class SuspendOrganizationModalComponent {
  dialogRef = inject(MatDialogRef<SuspendOrganizationModalComponent, string>);
  data = inject<SuspendOrganizationModalData>(MAT_DIALOG_DATA);

  constructor() {
    // Same "reads as consequential" panel treatment DeleteOrganizationModalComponent's
    // own constructor establishes — this immediately blocks a real org's
    // access, even though it's reversible.
    this.dialogRef.addPanelClass('confirm-dialog');
    this.dialogRef.addPanelClass('confirm-dialog-danger');
  }

  reasonControl = new FormControl('', { nonNullable: true, validators: [Validators.required] });

  cancel() {
    this.dialogRef.close(undefined);
  }

  confirm() {
    if (this.reasonControl.invalid) {
      this.reasonControl.markAsTouched();
      return;
    }
    this.dialogRef.close(this.reasonControl.value.trim());
  }
}
