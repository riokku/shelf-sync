import { Component, inject } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DeleteOrganizationModalData {
  organizationName: string;
}

// FormsModule is imported alongside ReactiveFormsModule purely for NgForm —
// see LockUserAccountModalComponent's own doc comment for the full
// reasoning: the template's `<form (ngSubmit)="confirm()">` has no
// `[formGroup]` (confirmationControl is a bare FormControl), so nothing
// provided the `ngSubmit` output without this — the submit button silently
// fell through to a native, page-reloading form submission instead, with
// confirm() never actually running.
@Component({
  selector: 'app-delete-organization-modal',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './delete-organization-modal.component.html',
  styleUrl: './delete-organization-modal.component.scss',
})
export class DeleteOrganizationModalComponent {
  dialogRef = inject(MatDialogRef<DeleteOrganizationModalComponent, boolean>);
  data = inject<DeleteOrganizationModalData>(MAT_DIALOG_DATA);

  constructor() {
    // Same panel classes ConfirmDialogComponent's own danger variant uses
    // (see that component's own constructor) — this is a one-off dedicated
    // dialog rather than a use of that shared component (it needs an extra
    // typed-confirmation field ConfirmDialogComponent doesn't have room
    // for), but it's every bit as destructive and should read that way.
    this.dialogRef.addPanelClass('confirm-dialog');
    this.dialogRef.addPanelClass('confirm-dialog-danger');
  }

  confirmationControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, (control) => control.value === this.data.organizationName ? null : { mismatch: true }]
  });

  get canConfirm(): boolean {
    return this.confirmationControl.value === this.data.organizationName;
  }

  cancel() {
    this.dialogRef.close(false);
  }

  confirm() {
    if (!this.canConfirm) {
      return;
    }
    this.dialogRef.close(true);
  }
}
