import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface PlaceOrderModalData {
  itemName: string;
  supplierName: string;
}

export interface PlaceOrderModalResult {
  quantity: number;
  note: string;
}

@Component({
  selector: 'app-place-order-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './place-order-modal.component.html',
  styleUrl: './place-order-modal.component.scss',
})
export class PlaceOrderModalComponent {
  dialogRef = inject(MatDialogRef<PlaceOrderModalComponent, PlaceOrderModalResult>);
  data = inject<PlaceOrderModalData>(MAT_DIALOG_DATA);

  orderForm = new FormGroup({
    quantity: new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1)] }),
    note: new FormControl('', { nonNullable: true })
  });

  submit() {
    if (this.orderForm.invalid) {
      this.orderForm.markAllAsTouched();
      return;
    }
    this.dialogRef.close({
      quantity: this.orderForm.controls.quantity.value!,
      note: this.orderForm.controls.note.value.trim()
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}
