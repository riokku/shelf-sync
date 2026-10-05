import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface BulkAddContainersModalData {
  locationOptions: string[];
  /** The box list's own first entry, if any — same "don't default to
   *  blank" reasoning a single Add container click now gets too, applied
   *  here as this field's own starting value rather than left for the
   *  caller to pre-fill after the fact. */
  defaultLocation: string;
}

export interface BulkAddContainersModalResult {
  count: number;
  location: string;
}

/** Collects "how many boxes, at what location" once and hands both back to
 *  the caller, which does the actual row creation — this dialog holds no
 *  container data of its own, the same "pure data collection, caller does
 *  the work" shape BulkReassignModalComponent already establishes. Every
 *  created box still gets its own quantity (the same per-item "Quantity per
 *  container" default a single Add container click already uses) and stays
 *  individually editable afterward, same as an item added one at a time. */
@Component({
  selector: 'app-bulk-add-containers-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './bulk-add-containers-modal.component.html',
  styleUrl: './bulk-add-containers-modal.component.scss',
})
export class BulkAddContainersModalComponent {
  dialogRef = inject(MatDialogRef<BulkAddContainersModalComponent, BulkAddContainersModalResult>);
  data = inject<BulkAddContainersModalData>(MAT_DIALOG_DATA);

  form = new FormGroup({
    count: new FormControl(1, { nonNullable: true, validators: [Validators.required, Validators.min(1)] }),
    location: new FormControl('', { nonNullable: true })
  });

  constructor() {
    this.form.controls.location.setValue(this.data.defaultLocation);
  }

  apply() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({ count: value.count, location: value.location });
  }

  cancel() {
    this.dialogRef.close();
  }
}
