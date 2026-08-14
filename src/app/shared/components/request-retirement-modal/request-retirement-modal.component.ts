import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface RequestRetirementModalData {
  itemName: string;
}

export interface RequestRetirementModalResult {
  note: string;
}

@Component({
  selector: 'app-request-retirement-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './request-retirement-modal.component.html',
  styleUrl: './request-retirement-modal.component.scss',
})
export class RequestRetirementModalComponent {
  dialogRef = inject(MatDialogRef<RequestRetirementModalComponent, RequestRetirementModalResult>);
  data = inject<RequestRetirementModalData>(MAT_DIALOG_DATA);

  // Unlike DiscardInventoryModalComponent's notes field, a reason here is
  // optional — the item is already at zero, which is reason enough; the
  // note is just extra context for whoever reviews the request.
  requestForm = new FormGroup({
    notes: new FormControl('', { nonNullable: true })
  });

  submit() {
    this.dialogRef.close({ note: this.requestForm.controls.notes.value.trim() });
  }

  cancel() {
    this.dialogRef.close();
  }
}
