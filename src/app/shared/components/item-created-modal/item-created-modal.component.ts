import { Component, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface ItemCreatedModalData {
  itemName: string;
}

export type ItemCreatedModalResult = 'view' | undefined;

/** Replaces the plain "Item created" success toast ManageInventoryComponent's
 *  create form used to show — a toast is a dead end (nothing to act on), so
 *  this offers the two things someone's actually likely to want right after
 *  creating an item: make another one (close with no result — the create
 *  form is already reset by the time this opens), or go see it in the full
 *  Inventory list (close with 'view', which the caller navigates on). Plain
 *  confirm/cancel semantics (ConfirmDialogComponent) don't fit here — neither
 *  button is a "cancel," both are equally valid next steps. */
@Component({
  selector: 'app-item-created-modal',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './item-created-modal.component.html',
  styleUrl: './item-created-modal.component.scss',
})
export class ItemCreatedModalComponent {
  dialogRef = inject(MatDialogRef<ItemCreatedModalComponent, ItemCreatedModalResult>);
  data = inject<ItemCreatedModalData>(MAT_DIALOG_DATA);

  addAnother() {
    this.dialogRef.close();
  }

  viewInventory() {
    this.dialogRef.close('view');
  }
}
