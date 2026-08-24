import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';

/** Shared "N selected" toolbar chrome for every page that supports bulk
 *  actions (Inventory, Manage Tasks, Manage Team's pending join requests) —
 *  a select-all checkbox, a live selected count, and a "Clear selection"
 *  button. Each page projects its own action buttons in via content
 *  projection (Inventory's "Reassign" button, Manage Tasks' status
 *  dropdown + Delete, Manage Team's Approve + Deny), since those differ per
 *  page — this component only owns the selection chrome common to all
 *  three, not any bulk-action behavior itself.
 *
 *  The projected actions (and the Clear button) only render once something
 *  is actually selected — an empty toolbar with disabled buttons would just
 *  be visual noise, and this way callers don't each need their own
 *  `[disabled]="selectedIds.size === 0"` bindings on every action button.
 *
 *  The caller is responsible for only rendering this component at all when
 *  its underlying list is non-empty (same as every other conditional
 *  toolbar/empty-state block in this app) — it has no opinion on that.
 *
 *  `hideSelectAllCheckbox` (default false) is for pages with their own
 *  compact "Select all" checkbox up in their header row, next to their Bulk
 *  edit toggle (Inventory, Manage Tasks' "All tasks" list) — this
 *  component's own copy would just be a redundant second control doing the
 *  same thing. Manage Team's pending-join-requests list has no such
 *  header-row checkbox (it has no Bulk edit toggle to sit next to at all —
 *  bulk actions are always available there), so it leaves this false and
 *  keeps the checkbox here exactly as before. When true, this component
 *  also stops rendering itself at all until something's actually selected —
 *  a bare "Select all" text label with no checkbox and no action buttons
 *  would be pure clutter once the header-row checkbox already covers it. */
@Component({
  selector: 'app-bulk-action-toolbar',
  imports: [MatButtonModule, MatCheckboxModule, MatIconModule],
  templateUrl: './bulk-action-toolbar.component.html',
  styleUrl: './bulk-action-toolbar.component.scss',
})
export class BulkActionToolbarComponent {
  @Input({ required: true }) selectedCount = 0;
  @Input({ required: true }) totalCount = 0;
  @Input() hideSelectAllCheckbox = false;
  @Output() selectAll = new EventEmitter<boolean>();
  @Output() clear = new EventEmitter<void>();

  get allSelected(): boolean {
    return this.totalCount > 0 && this.selectedCount === this.totalCount;
  }

  get partiallySelected(): boolean {
    return this.selectedCount > 0 && this.selectedCount < this.totalCount;
  }

  onSelectAllChange(checked: boolean) {
    this.selectAll.emit(checked);
  }
}
