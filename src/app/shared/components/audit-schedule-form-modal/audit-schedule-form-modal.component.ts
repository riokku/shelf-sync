import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { SupabaseService } from '../../../core/supabase.service';
import { InventoryFieldOptionsService } from '../../../core/inventory-field-options.service';
import { AUDIT_FREQUENCY_LABELS, AuditFrequency, InventoryAuditSchedule } from '../../models/inventory-audit.model';
import { toIsoDateString } from '../../utils/date';

/** Undefined schedule means "create new" — same optional-data-means-create
 *  shape SupplierFormModalComponent/ReleaseNoteFormModalComponent already
 *  use. Editing only ever touches location/frequency/note —
 *  update_audit_schedule() has no way to move next_occurrence_date at all
 *  (see that RPC's own migration comment) — so the first-occurrence
 *  datepicker only renders, and is only required, in create mode. */
export interface AuditScheduleFormModalData {
  schedule?: InventoryAuditSchedule;
}

@Component({
  selector: 'app-audit-schedule-form-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDatepickerModule
  ],
  templateUrl: './audit-schedule-form-modal.component.html',
  styleUrl: './audit-schedule-form-modal.component.scss',
})
export class AuditScheduleFormModalComponent {
  private supabase = inject(SupabaseService).client;
  protected inventoryFieldOptions = inject(InventoryFieldOptionsService);
  dialogRef = inject(MatDialogRef<AuditScheduleFormModalComponent, boolean>);
  data = inject<AuditScheduleFormModalData>(MAT_DIALOG_DATA, { optional: true }) ?? {};

  readonly frequencies: AuditFrequency[] = ['weekly', 'monthly', 'quarterly'];
  readonly frequencyLabels = AUDIT_FREQUENCY_LABELS;
  /** Datepicker floor — create_audit_schedule() itself also refuses a past
   *  first occurrence; this is purely a UX nicety, the RPC is what actually
   *  enforces it. */
  readonly minDate = new Date();

  get isEditing(): boolean {
    return !!this.data.schedule;
  }

  form = new FormGroup({
    physicalLocation: new FormControl<string | null>(this.data.schedule?.physicalLocation || null),
    frequency: new FormControl<AuditFrequency>(this.data.schedule?.frequency ?? 'monthly', {
      nonNullable: true,
      validators: [Validators.required]
    }),
    firstOccurrenceDate: new FormControl<Date | null>(null, this.isEditing ? [] : [Validators.required]),
    note: new FormControl(this.data.schedule?.note ?? '', { nonNullable: true })
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

    const value = this.form.getRawValue();
    const { error } = this.data.schedule
      ? await this.supabase.rpc('update_audit_schedule', {
          p_schedule_id: this.data.schedule.id,
          p_physical_location: value.physicalLocation || undefined,
          p_frequency: value.frequency,
          p_note: value.note.trim() || undefined
        })
      : await this.supabase.rpc('create_audit_schedule', {
          p_physical_location: value.physicalLocation || undefined,
          p_frequency: value.frequency,
          p_note: value.note.trim() || undefined,
          p_first_occurrence_date: toIsoDateString(value.firstOccurrenceDate) ?? undefined
        });

    this.isSaving = false;

    if (error) {
      this.error = error.message;
      return;
    }

    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close();
  }
}
