import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface DiscardInventoryModalData {
  itemName: string;
  /** Caller (ModalTableComponent) only ever opens this dialog when there's
   *  stock on hand, but a live value is passed in rather than hardcoding
   *  ">0" here so the quantity field's max stays in sync with whatever the
   *  item's current remaining count actually is. */
  quantityRemaining: number;
}

export interface DiscardInventoryModalResult {
  quantity: number;
  notes: string;
}

@Component({
  selector: 'app-discard-inventory-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './discard-inventory-modal.component.html',
  styleUrl: './discard-inventory-modal.component.scss',
})
export class DiscardInventoryModalComponent {
  dialogRef = inject(MatDialogRef<DiscardInventoryModalComponent, DiscardInventoryModalResult>);
  data = inject<DiscardInventoryModalData>(MAT_DIALOG_DATA);

  discardForm = new FormGroup({
    mode: new FormControl<'all' | 'partial'>('all', { nonNullable: true }),
    quantity: new FormControl(0, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(this.data.quantityRemaining)]
    }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });

  get isPartial(): boolean {
    return this.discardForm.controls.mode.value === 'partial';
  }

  get effectiveQuantity(): number {
    return this.isPartial ? this.discardForm.controls.quantity.value : this.data.quantityRemaining;
  }

  get canSubmit(): boolean {
    const quantityOk = !this.isPartial || this.discardForm.controls.quantity.valid;
    return quantityOk && this.discardForm.controls.notes.valid;
  }

  submit() {
    if (!this.canSubmit) {
      return;
    }
    this.dialogRef.close({
      quantity: this.effectiveQuantity,
      notes: this.discardForm.controls.notes.value.trim()
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}
