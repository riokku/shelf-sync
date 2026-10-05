import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { InventoryFieldOptionsService, InventoryFieldName } from '../../../core/inventory-field-options.service';

export interface AddFieldOptionModalData {
  field: InventoryFieldName;
  /** Lowercase, singular — used in this modal's own copy ("Add new
   *  category", "New category"), not a stored label of any kind. */
  label: string;
}

/** A small self-contained "add one new value" dialog for the inventory
 *  create/edit forms' category and physical-location pickers — opened only
 *  while an org's "Inline field creation" Workflow toggle is on (see
 *  SiteSettingsService.allowInlineFieldCreation's own doc comment). Mirrors
 *  SupplierFormModalComponent's own self-contained shape (it does the
 *  actual InventoryFieldOptionsService.addOption() write itself) rather
 *  than handing a typed value back for the caller to persist, and closes
 *  with the newly added value on success so the caller can select it
 *  directly. */
@Component({
  selector: 'app-add-field-option-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './add-field-option-modal.component.html',
  styleUrl: './add-field-option-modal.component.scss',
})
export class AddFieldOptionModalComponent {
  private fieldOptions = inject(InventoryFieldOptionsService);
  dialogRef = inject(MatDialogRef<AddFieldOptionModalComponent, string>);
  data = inject<AddFieldOptionModalData>(MAT_DIALOG_DATA);

  form = new FormGroup({
    value: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });

  isSaving = false;
  error: string | null = null;

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

    const value = this.form.controls.value.value.trim();
    const error = await this.fieldOptions.addOption(this.data.field, value);

    this.isSaving = false;

    if (error) {
      this.error = error;
      return;
    }

    this.dialogRef.close(value);
  }

  cancel() {
    this.dialogRef.close();
  }
}
