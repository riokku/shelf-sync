import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { confirmLeaveWithoutSaving } from '../../shared/utils/confirm-leave';

export interface HasUnsavedChanges {
  /** True whenever leaving right now would silently lose real, unsaved
   *  input — a dirty create form, an in-progress photo/container add, or
   *  (InventoryComponent/ManageInventoryComponent, and any page whose task
   *  detail can open a related item — TasksComponent/ManageTasksComponent/
   *  ManageTeamComponent) a dirty in-place item edit sitting in an embedded
   *  ModalTableComponent — independent of which tab/view is currently on
   *  screen, since that state doesn't go away just because a different
   *  tab/view happens to be showing at the moment (this component instance
   *  survives switching between them; only navigating off the page or a
   *  successful submit actually clears it). */
  hasUnsavedChanges(): boolean;
}

/** Guards route navigation *away* from a page with real unsaved work sitting
 *  in a create form or an in-place item edit — see HasUnsavedChanges's own
 *  doc comment for the full shape, and each page's own `hasUnsavedChanges()`
 *  for which of those it actually covers. Reuses `ConfirmDialogComponent`
 *  the same way every other confirm-before-acting flow in this app already
 *  does, via confirmLeaveWithoutSaving() — see its own doc comment for why
 *  a dismissed-with-no-explicit-answer close is treated as "don't leave."
 *  This only covers *route* navigation — switching between a page's own
 *  tabs, or clicking that page's own Back button to leave a related-item/
 *  item-detail view, is plain component state, not a route change, so each
 *  of those has its own matching confirm check that also calls
 *  confirmLeaveWithoutSaving() directly; see their own doc comments. A
 *  browser tab close/refresh is covered separately too, via a
 *  `beforeunload` listener on each component, since `CanDeactivate` guards
 *  never run for that. */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = component => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }

  const dialog = inject(MatDialog);
  return confirmLeaveWithoutSaving(dialog, 'You have unsaved changes that will be lost if you leave this page.');
};
