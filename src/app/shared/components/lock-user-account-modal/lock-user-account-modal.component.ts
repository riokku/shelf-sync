import { Component, inject } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface LockUserAccountModalData {
  userName: string;
}

/** Captures a mandatory reason before calling platform_lock_user_account() —
 *  same "a consequential-but-reversible action should still say why"
 *  reasoning SuspendOrganizationModalComponent's own identical modal already
 *  establishes for suspending a whole org, applied here to locking one
 *  user's account instead. Reversible (platform_unlock_user_account undoes
 *  it completely), so a plain reason field is enough — no type-to-confirm
 *  friction the way retiring an org needs. Resolves with the entered reason
 *  string, or undefined on cancel.
 *
 *  FormsModule is imported alongside ReactiveFormsModule purely for NgForm —
 *  the template's `<form (ngSubmit)="confirm()">` has no `[formGroup]`
 *  (reasonControl is a bare FormControl, not wrapped in one), so nothing
 *  provides the `ngSubmit` output without it. Angular's strict template
 *  checking doesn't catch a missing event binding the way it does a missing
 *  property binding (any string is a legal event name to listen for via
 *  addEventListener), so this compiled fine but silently never fired:
 *  clicking the submit button fell through to the browser's own native form
 *  submission instead — a real page reload, with confirm() never actually
 *  running. NgForm's own selector (`form:not([ngNoForm]):not([formGroup])`)
 *  matches a bare `<form>` like this one and is what actually listens for
 *  the native `submit` event and calls `preventDefault()` before emitting
 *  `ngSubmit` — it needs no ngModel-bound children to do that job, so this
 *  coexists safely with the reactive-driven `[formControl]` below. */
@Component({
  selector: 'app-lock-user-account-modal',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './lock-user-account-modal.component.html',
  styleUrl: './lock-user-account-modal.component.scss',
})
export class LockUserAccountModalComponent {
  dialogRef = inject(MatDialogRef<LockUserAccountModalComponent, string>);
  data = inject<LockUserAccountModalData>(MAT_DIALOG_DATA);

  constructor() {
    // Same "reads as consequential" panel treatment SuspendOrganizationModalComponent's
    // own constructor establishes — this immediately blocks a real person's
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
