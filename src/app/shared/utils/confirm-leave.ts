import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';

/** Opens ConfirmDialogComponent with this app's standard "Leave without
 *  saving?" wording and resolves whether the caller should actually go
 *  ahead — Promise<boolean> (not the Observable afterClosed() itself) so a
 *  dismissed-with-no-explicit-answer close (backdrop/Escape, resolving
 *  undefined) coerces to `false` rather than needing an RxJS `map` this
 *  app's own utils otherwise avoid (see debounce.ts's own no-RxJS-operators
 *  convention) just to satisfy a boolean-not-boolean|undefined return type.
 *  Shared by unsaved-changes.guard.ts (route deactivation) and every page
 *  that also needs the identical "confirm before discarding a dirty form"
 *  check for something that isn't itself a route change — a Back button, a
 *  tab switch, etc. — so the wording/shape can't drift between call sites. */
export function confirmLeaveWithoutSaving(dialog: MatDialog, message: string): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Leave without saving?',
        message,
        confirmLabel: 'Leave',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    }).afterClosed().subscribe(confirmed => resolve(!!confirmed));
  });
}
