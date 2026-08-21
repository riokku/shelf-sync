import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface BulkReassignModalData {
  itemCount: number;
  categoryOptions: string[];
  physicalLocationOptions: string[];
}

/** `null` on either field means "don't touch this field at all" — distinct
 *  from `{ value: '' }`, which means "clear it to empty" (the explicit
 *  "(None)" option in each dropdown below). Lets an admin bulk-set just one
 *  field without touching the other, and still bulk-*clear* a field if
 *  that's genuinely what they want. */
export interface BulkReassignModalResult {
  category: { value: string } | null;
  physicalLocation: { value: string } | null;
}

@Component({
  selector: 'app-bulk-reassign-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './bulk-reassign-modal.component.html',
  styleUrl: './bulk-reassign-modal.component.scss',
})
export class BulkReassignModalComponent {
  dialogRef = inject(MatDialogRef<BulkReassignModalComponent, BulkReassignModalResult>);
  data = inject<BulkReassignModalData>(MAT_DIALOG_DATA);

  // Two independently toggleable fields, each gating its own dropdown —
  // updateCategory/updatePhysicalLocation control whether that field is
  // included in the result at all (see BulkReassignModalResult's own doc
  // comment), category/physicalLocation just hold the dropdown's current
  // value regardless of whether its checkbox is on.
  form = new FormGroup({
    updateCategory: new FormControl(false, { nonNullable: true }),
    category: new FormControl('', { nonNullable: true }),
    updatePhysicalLocation: new FormControl(false, { nonNullable: true }),
    physicalLocation: new FormControl('', { nonNullable: true })
  });

  get canApply(): boolean {
    const value = this.form.getRawValue();
    return value.updateCategory || value.updatePhysicalLocation;
  }

  apply() {
    if (!this.canApply) {
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({
      category: value.updateCategory ? { value: value.category } : null,
      physicalLocation: value.updatePhysicalLocation ? { value: value.physicalLocation } : null
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}
