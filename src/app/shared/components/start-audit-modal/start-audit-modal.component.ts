import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { InventoryFieldOptionsService } from '../../../core/inventory-field-options.service';

/** Self-contained "calls an RPC directly" modal, same shape as
 *  PlaceReservationModalComponent — start_inventory_audit() itself does the
 *  bulk snapshot + activity logging server-side, so there's nothing for
 *  this modal to do client-side beyond collecting the scope (a physical
 *  location, or none for the whole org) and an optional note. Closes with
 *  the new audit's id (not a plain boolean) so the caller can navigate
 *  straight into its detail view rather than just reloading the list. */
@Component({
  selector: 'app-start-audit-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './start-audit-modal.component.html',
  styleUrl: './start-audit-modal.component.scss',
})
export class StartAuditModalComponent {
  private supabase = inject(SupabaseService).client;
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);
  dialogRef = inject(MatDialogRef<StartAuditModalComponent, string>);

  startForm = new FormGroup({
    physicalLocation: new FormControl<string | null>(null),
    note: new FormControl('', { nonNullable: true })
  });

  isSaving = false;
  error: string | null = null;

  async save() {
    if (this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.error = null;

    const value = this.startForm.getRawValue();
    const { data, error } = await this.supabase.rpc('start_inventory_audit', {
      p_physical_location: value.physicalLocation || undefined,
      p_note: value.note.trim() || undefined
    });

    this.isSaving = false;

    if (error) {
      this.error = error.message;
      return;
    }

    this.dialogRef.close(data);
  }

  cancel() {
    this.dialogRef.close();
  }
}
