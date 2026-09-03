import { Component, inject } from '@angular/core';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ImpersonateUserModalData {
  userName: string;
  orgName: string;
}

/** Captures a mandatory reason before ImpersonationService.start() — same
 *  "consequential-but-reversible action should still say why" reasoning
 *  LockUserAccountModalComponent's own identical modal already establishes,
 *  copied from it almost verbatim (see that component's own doc comment for
 *  the FormsModule/NgForm gotcha this template shares: a bare
 *  <form (ngSubmit)> with no [formGroup] gets no ngSubmit output at all
 *  without FormsModule imported alongside ReactiveFormsModule, and Angular's
 *  strict template checking doesn't catch a missing *event* binding the way
 *  it does a missing property one — this compiles clean either way, but
 *  silently falls through to a real native form submit/page reload without
 *  it). Resolves with the entered reason string, or undefined on cancel. */
@Component({
  selector: 'app-impersonate-user-modal',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './impersonate-user-modal.component.html',
  styleUrl: './impersonate-user-modal.component.scss',
})
export class ImpersonateUserModalComponent {
  dialogRef = inject(MatDialogRef<ImpersonateUserModalComponent, string>);
  data = inject<ImpersonateUserModalData>(MAT_DIALOG_DATA);

  constructor() {
    // Same "reads as consequential" panel treatment LockUserAccountModalComponent's
    // own constructor establishes.
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
