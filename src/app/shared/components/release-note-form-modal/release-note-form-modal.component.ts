import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { ReleaseNote, ReleaseNoteSeverity, RELEASE_NOTE_SEVERITY_OPTIONS } from '../../models/release-note.model';
import { createReleaseNote, updateReleaseNote } from '../../utils/release-notes';
import { getTodayIsoDate, parseIsoDate, toIsoDateString } from '../../utils/date';

/** Undefined releaseNote means "post a new entry" — same optional-data-
 *  means-create shape SupplierFormModalComponent's/BroadcastModalComponent's
 *  own data.supplier/data.broadcast already use rather than two
 *  near-identical modals. Self-contained like those two: does the actual
 *  write itself (createReleaseNote()/updateReleaseNote(), see
 *  shared/utils/release-notes.ts) rather than handing a plain value back to
 *  StudioReleaseNotesComponent to persist. */
export interface ReleaseNoteFormModalData {
  releaseNote?: ReleaseNote;
}

@Component({
  selector: 'app-release-note-form-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './release-note-form-modal.component.html',
  styleUrl: './release-note-form-modal.component.scss',
})
export class ReleaseNoteFormModalComponent {
  private supabase = inject(SupabaseService).client;
  dialogRef = inject(MatDialogRef<ReleaseNoteFormModalComponent, boolean>);
  data = inject<ReleaseNoteFormModalData>(MAT_DIALOG_DATA);

  readonly severityOptions = RELEASE_NOTE_SEVERITY_OPTIONS;

  get isEditing(): boolean {
    return !!this.data.releaseNote;
  }

  form = new FormGroup({
    title: new FormControl(this.data.releaseNote?.title ?? '', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl(this.data.releaseNote?.description ?? '', { nonNullable: true, validators: [Validators.required] }),
    severity: new FormControl<ReleaseNoteSeverity>(this.data.releaseNote?.severity ?? 'standard', { nonNullable: true }),
    // Defaults to today for a new entry — an admin backfilling an older
    // date can still change it, same "editable default" reasoning
    // DiscardModalComponent's own quantity field defaults give.
    postedAt: new FormControl<Date | null>(
      parseIsoDate(this.data.releaseNote?.postedAt ?? getTodayIsoDate()),
      { validators: [Validators.required] }
    )
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
    const input = {
      title: value.title.trim(),
      description: value.description.trim(),
      severity: value.severity,
      postedAt: toIsoDateString(value.postedAt)!
    };

    const error = this.data.releaseNote
      ? await updateReleaseNote(this.supabase, this.data.releaseNote.id, input)
      : await createReleaseNote(this.supabase, input);

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
