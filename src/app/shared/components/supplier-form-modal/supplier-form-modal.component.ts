import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupplierService } from '../../../core/supplier.service';
import { Supplier } from '../../models/supplier.model';

/** Undefined supplier means "add new" — same optional-data-means-create
 *  shape ModalTableComponent's own edit flow doesn't need (it's always
 *  editing an existing item), but matches how a lot of this app's other
 *  add/edit modals are kept to one component instead of two near-identical
 *  ones. */
export interface SupplierFormModalData {
  supplier?: Supplier;
}

@Component({
  selector: 'app-supplier-form-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './supplier-form-modal.component.html',
  styleUrl: './supplier-form-modal.component.scss',
})
export class SupplierFormModalComponent {
  private supplierService = inject(SupplierService);
  dialogRef = inject(MatDialogRef<SupplierFormModalComponent>);
  data = inject<SupplierFormModalData>(MAT_DIALOG_DATA);

  get isEditing(): boolean {
    return !!this.data.supplier;
  }

  form = new FormGroup({
    name: new FormControl(this.data.supplier?.name ?? '', { nonNullable: true, validators: [Validators.required] }),
    contactName: new FormControl(this.data.supplier?.contactName ?? '', { nonNullable: true }),
    email: new FormControl(this.data.supplier?.email ?? '', { nonNullable: true, validators: [Validators.email] }),
    phone: new FormControl(this.data.supplier?.phone ?? '', { nonNullable: true }),
    website: new FormControl(this.data.supplier?.website ?? '', { nonNullable: true }),
    notes: new FormControl(this.data.supplier?.notes ?? '', { nonNullable: true })
  });

  isSaving = false;
  error: string | null = null;

  // SupplierService.create()/update() already refresh its own suppliers
  // signal on success, so ManageSuppliersComponent's list is current the
  // moment this modal closes — closing with a plain `true` is enough to
  // tell the caller a save happened (e.g. to show a toast), not a copy of
  // the record itself.
  async save() {
    if (this.isSaving) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.error = null;

    const value = this.form.getRawValue();
    const error = this.data.supplier
      ? await this.supplierService.update(this.data.supplier.id, value)
      : await this.supplierService.create(value);

    this.isSaving = false;

    if (error) {
      this.error = error;
      return;
    }

    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close();
  }
}
