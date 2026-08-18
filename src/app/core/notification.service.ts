import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SuccessToastComponent, SuccessToastData } from '../shared/components/success-toast/success-toast.component';

/** Thin wrapper around MatSnackBar so every success toast in the app shares
 *  one duration/style rather than each call site configuring MatSnackBar
 *  itself — brief positive confirmation for actions that otherwise give no
 *  feedback beyond a spinner disappearing (approve/deny/remove/delete/
 *  transfer). Deliberately success-only: existing inline error messages
 *  stay put rather than moving to a toast, since a failure is more
 *  important to keep visible/persistent than a toast allows. */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private snackBar = inject(MatSnackBar);

  // openFromComponent() rather than the plain open(message) string API —
  // SuccessToastComponent gives every success toast a checkmark icon with a
  // playful pop-in animation instead of MatSnackBar's flat default text.
  success(message: string) {
    this.snackBar.openFromComponent<SuccessToastComponent, SuccessToastData>(SuccessToastComponent, {
      data: { message },
      duration: 3000,
      panelClass: 'app-success-snackbar',
      horizontalPosition: 'end',
      verticalPosition: 'bottom'
    });
  }
}
