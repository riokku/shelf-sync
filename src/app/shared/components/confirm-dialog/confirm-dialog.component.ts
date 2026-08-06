import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red) — for actions like
   *  deleting/removing something, as opposed to routine confirmations. */
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
})
export class ConfirmDialogComponent {
  dialogRef = inject(MatDialogRef<ConfirmDialogComponent, boolean>);
  data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);

  constructor() {
    // Panel classes live on the CDK overlay pane, outside this component's
    // own view — adding them here (rather than requiring every dialog.open()
    // caller to remember the right panelClass) means any caller passing
    // danger: true automatically gets the alarming styling, no extra setup.
    this.dialogRef.addPanelClass('confirm-dialog');
    if (this.data.danger) {
      this.dialogRef.addPanelClass('confirm-dialog-danger');
    }
  }

  cancel() {
    this.dialogRef.close(false);
  }

  confirm() {
    this.dialogRef.close(true);
  }
}
