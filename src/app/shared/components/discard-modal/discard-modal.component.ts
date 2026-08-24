import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { InventoryFieldOptionsService } from '../../../core/inventory-field-options.service';
import { InventoryItemContainer } from '../../models/inventory-item-container.model';

export interface DiscardModalData {
  itemName: string;
  /** Ignored (and the box picker shown instead) once containers.length > 0
   *  — see ModalTableComponent's own quantityDerivedFromContainers for the
   *  same "containers, once present, are the only source of truth" rule. */
  quantityRemaining: number;
  containers: InventoryItemContainer[];
}

export interface DiscardModalResult {
  quantity: number;
  /** One or more reasons picked from the org's admin-curated list (Settings
   *  > Data > "Discard reasons") — a multi-select, not free text, so
   *  manage/reports' "Top reasons" breakdown groups on a real controlled
   *  vocabulary instead of however differently two people phrase the same
   *  thing. */
  reasons: string[];
  /** null for a flat item (decrements quantityRemaining/quantityTotal
   *  directly); set to the picked box's id for a container-tracked item
   *  (decrements that one container instead). */
  containerId: string | null;
}

/** Reinstates (in a unified shape) the old DiscardInventoryModalComponent —
 *  a quantity + mandatory-reason way to reduce stock, removed when
 *  container editing became the (reason-less) way to do this for
 *  container-tracked items. This version covers both: a flat item discards
 *  straight off quantityRemaining, a container-tracked item discards from a
 *  specific picked box, but either way at least one reason is always
 *  required — the one thing plain field editing was never meant to capture. */
@Component({
  selector: 'app-discard-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './discard-modal.component.html',
  styleUrl: './discard-modal.component.scss',
})
export class DiscardModalComponent implements OnInit {
  dialogRef = inject(MatDialogRef<DiscardModalComponent, DiscardModalResult>);
  data = inject<DiscardModalData>(MAT_DIALOG_DATA);
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);

  /** Safe to call even if the page that opened this modal already loaded
   *  it — cheap, and this modal can't assume that (same reasoning every
   *  other consumer of this service already follows). */
  async ngOnInit() {
    await this.inventoryFieldOptions.load();
  }

  /** Only boxes that actually still hold something — an already-empty box
   *  has nothing left to discard and would just clutter the picker. */
  get availableContainers(): InventoryItemContainer[] {
    return this.data.containers.filter(container => container.quantity > 0);
  }

  discardForm = new FormGroup({
    containerId: new FormControl<string | null>(null),
    quantity: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1)] }),
    // Validators.required treats an empty array as invalid too (not just
    // null/''), so "pick at least one reason" needs nothing more than this.
    reasons: new FormControl<string[]>([], { nonNullable: true, validators: [Validators.required] })
  });

  error: string | null = null;

  /** The most that can be discarded right now — the picked box's own
   *  quantity for a container-tracked item, otherwise the item's flat
   *  quantityRemaining. Recomputed live as the box selection changes. */
  get maxQuantity(): number {
    if (this.data.containers.length === 0) {
      return this.data.quantityRemaining;
    }
    const containerId = this.discardForm.controls.containerId.value;
    return this.availableContainers.find(container => container.id === containerId)?.quantity ?? 0;
  }

  containerLabel(container: InventoryItemContainer): string {
    const boxNumber = this.data.containers.indexOf(container) + 1;
    return `Box ${boxNumber} (${container.quantity} remaining)${container.location ? ` — ${container.location}` : ''}`;
  }

  submit() {
    this.error = null;

    if (this.data.containers.length > 0 && !this.discardForm.controls.containerId.value) {
      this.error = 'Pick which box to discard from.';
      return;
    }
    if (this.discardForm.invalid) {
      this.discardForm.markAllAsTouched();
      return;
    }

    const value = this.discardForm.getRawValue();
    if (value.quantity! > this.maxQuantity) {
      this.error = `Only ${this.maxQuantity} available to discard.`;
      return;
    }

    this.dialogRef.close({
      quantity: value.quantity!,
      reasons: value.reasons,
      containerId: value.containerId
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}
