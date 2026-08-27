import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService } from '../../../core/auth.service';
import { FEEDBACK_TYPES, FEEDBACK_TYPE_LABELS, FeedbackType } from '../../models/feedback';

/** Self-contained, like PlaceOrderModalComponent/PlaceReservationModalComponent
 *  — does the actual `feedback` insert itself rather than handing a plain
 *  value back to its caller (HelpComponent) to persist. Unlike those two,
 *  there's no dual activity-log write to make afterward: feedback isn't
 *  tied to an inventory item or task, so inventory_item_activity/
 *  activity_log don't apply here — the insert alone is what a Postgres
 *  trigger (see the add_feedback migration) picks up to email the app's
 *  own maintainer. */
@Component({
  selector: 'app-feedback-modal',
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
  templateUrl: './feedback-modal.component.html',
  styleUrl: './feedback-modal.component.scss',
})
export class FeedbackModalComponent {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  dialogRef = inject(MatDialogRef<FeedbackModalComponent, boolean>);

  readonly feedbackTypes = FEEDBACK_TYPES;
  readonly feedbackTypeLabels = FEEDBACK_TYPE_LABELS;

  // No default type — the Submit button stays disabled (see the template's
  // [disabled]="feedbackForm.invalid") until both fields are actually
  // filled in, rather than a pre-picked "General feedback" silently
  // counting as "chosen".
  feedbackForm = new FormGroup({
    type: new FormControl<FeedbackType | null>(null, { validators: [Validators.required] }),
    message: new FormControl('', { nonNullable: true, validators: [Validators.required] })
  });

  isSaving = false;
  error: string | null = null;

  async submit() {
    if (this.isSaving) {
      return;
    }
    if (this.feedbackForm.invalid) {
      this.feedbackForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.error = null;

    const session = await this.authService.getSession();
    if (!session) {
      this.isSaving = false;
      this.error = 'You must be signed in to send feedback.';
      return;
    }

    const value = this.feedbackForm.getRawValue();

    // organization_id is left off — it defaults to current_user_org_id()
    // (see the add_feedback migration), same convention activity_log's own
    // client inserts already follow.
    const { error } = await this.supabase.from('feedback').insert({
      // Non-null by construction — the invalid-form guard above already
      // requires type to be non-null before this line ever runs.
      type: value.type!,
      message: value.message.trim(),
      user_id: session.user.id
    });

    if (error) {
      this.isSaving = false;
      this.error = error.message;
      return;
    }

    this.isSaving = false;
    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close();
  }
}
