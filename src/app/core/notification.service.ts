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

  /** Same success toast, plus a trailing "Undo" (or caller-supplied label)
   *  action that runs `onUndo` — for an action that's cheap and safe to
   *  reverse right after it happens (a bulk reassign, a bulk status change,
   *  a discard), rather than either a confirm dialog up front (friction on
   *  every single use, for a mistake that's rare) or no safety net at all.
   *  A longer duration than the plain success() toast (6s vs 3s) gives a
   *  reader an actual chance to click it before it disappears. Deliberately
   *  still success-only, same as success() above — this is a safety net for
   *  a *completed* action, not error handling. */
  successWithUndo(message: string, onUndo: () => void | Promise<void>, undoLabel = 'Undo') {
    const ref = this.snackBar.openFromComponent<SuccessToastComponent, SuccessToastData>(SuccessToastComponent, {
      data: { message, undoLabel },
      duration: 6000,
      panelClass: 'app-success-snackbar',
      horizontalPosition: 'end',
      verticalPosition: 'bottom'
    });
    ref.onAction().subscribe(() => {
      void onUndo();
    });
  }
}
