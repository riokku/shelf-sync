import { Component, inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

export interface SuccessToastData {
  message: string;
  /** When set, renders a trailing text button with this label — clicking it
   *  calls dismissWithAction() so NotificationService.successWithUndo()'s
   *  own onAction() subscriber fires. Omitted entirely for a plain
   *  success() toast, which has nothing to undo. */
  undoLabel?: string;
}

/** Content component for NotificationService's success toast — swapped in
 *  for MatSnackBar's plain-text default specifically to get a checkmark
 *  icon with a playful pop-in animation onto every success toast in the
 *  app, rather than the flat default slide-up. Also backs
 *  successWithUndo()'s optional trailing "Undo" button — a bare
 *  openFromComponent() config has no built-in action slot the way the
 *  string-based open(message, action) API does, so the action has to be
 *  rendered inside this component's own template and routed back through
 *  its own MatSnackBarRef. */
@Component({
  selector: 'app-success-toast',
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './success-toast.component.html',
  styleUrl: './success-toast.component.scss',
})
export class SuccessToastComponent {
  data = inject<SuccessToastData>(MAT_SNACK_BAR_DATA);
  snackBarRef = inject<MatSnackBarRef<SuccessToastComponent>>(MatSnackBarRef);
}
