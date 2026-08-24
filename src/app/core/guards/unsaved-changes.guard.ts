import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

export interface HasUnsavedChanges {
  /** True whenever leaving right now would silently lose real, unsaved
   *  input (a dirty create form, an in-progress photo/container add) —
   *  independent of which tab/view is currently on screen, since that
   *  state doesn't go away just because a different tab happens to be
   *  showing at the moment (this component instance survives switching
   *  between them; only navigating off the page or a successful submit
   *  actually clears it). */
  hasUnsavedChanges(): boolean;
}

/** Guards route navigation *away* from a page with real unsaved work sitting
 *  in a create form — `manage/inventory`/`manage/tasks` are the two routes
 *  that use this (see their own `hasUnsavedChanges()`). Reuses
 *  `ConfirmDialogComponent` the same way every other confirm-before-acting
 *  flow in this app already does — `afterClosed()` resolving `undefined`
 *  (dialog dismissed via backdrop/Escape rather than an explicit button)
 *  is falsy, so anything other than an explicit "Leave" click blocks the
 *  navigation, the safe default. This only covers *route* navigation —
 *  switching between a page's own tabs (e.g. Create task -> All tasks) is
 *  plain component state, not a route change, so each of those two
 *  components' own `setViewMode()` has its own matching confirm check; see
 *  their own doc comments. A browser tab close/refresh is covered
 *  separately too, via a `beforeunload` listener on each component,
 *  since `CanDeactivate` guards never run for that. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = component => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }

  const dialog = inject(MatDialog);
  // Promise<boolean> (not the Observable afterClosed() itself) so a
  // dismissed-with-no-explicit-answer close (backdrop/Escape, resolving
  // undefined) coerces to `false` rather than needing an RxJS `map` this
  // app's own utils otherwise avoid (see shared/utils/debounce.ts's own
  // "no-RxJS-operators" convention) just to satisfy CanDeactivateFn's
  // `boolean`-not-`boolean | undefined` return type.
  return new Promise<boolean>(resolve => {
    dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Leave without saving?',
        message: 'You have unsaved changes that will be lost if you leave this page.',
        confirmLabel: 'Leave',
        danger: true
      },
      width: 'clamp(75%, 25rem, 60%)'
    }).afterClosed().subscribe(confirmed => resolve(!!confirmed));
  });
};
