import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { Profile } from '../../../core/auth.service';
import { Broadcast } from '../../models/broadcast.model';
import { createBroadcast, updateBroadcast } from '../../utils/broadcasts';
import { profileDisplayName } from '../../utils/profile-label';

export interface BroadcastableItem {
  id: string;
  name: string;
}

export interface BroadcastModalData {
  /** Approved org members only — same "not a pending join request" filter
   *  ManageTasksComponent's own approvedAssignableProfiles already applies
   *  to its own transfer/assignee picker, since referencing someone who
   *  can't even see this page yet wouldn't mean anything. */
  profiles: Profile[];
  items: BroadcastableItem[];
  /** Undefined means "post a new broadcast" — set means "editing this one",
   *  same optional-data-means-create shape SupplierFormModalComponent's own
   *  data.supplier already uses rather than two near-identical modals. */
  broadcast?: Broadcast;
}

/** Self-contained, like PlaceOrderModalComponent/PlaceReservationModalComponent
 *  — does the actual write itself (create_broadcast() RPC, or a plain update
 *  when editing — see shared/utils/broadcasts.ts) rather than handing a
 *  plain value back to BroadcastsComponent to persist. */
@Component({
  selector: 'app-broadcast-modal',
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
  templateUrl: './broadcast-modal.component.html',
  styleUrl: './broadcast-modal.component.scss',
})
export class BroadcastModalComponent {
  private supabase = inject(SupabaseService).client;
  dialogRef = inject(MatDialogRef<BroadcastModalComponent, boolean>);
  data = inject<BroadcastModalData>(MAT_DIALOG_DATA);

  readonly profileDisplayName = profileDisplayName;

  get isEditing(): boolean {
    return !!this.data.broadcast;
  }

  form = new FormGroup({
    title: new FormControl(this.data.broadcast?.title ?? '', { nonNullable: true, validators: [Validators.required] }),
    message: new FormControl(this.data.broadcast?.message ?? '', { nonNullable: true, validators: [Validators.required] }),
    memberIds: new FormControl<string[]>(
      this.data.broadcast?.referencedMembers.map(member => member.id) ?? [],
      { nonNullable: true }
    ),
    itemIds: new FormControl<string[]>(
      this.data.broadcast?.referencedItems.map(item => item.id) ?? [],
      { nonNullable: true }
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
      message: value.message.trim(),
      memberIds: value.memberIds,
      itemIds: value.itemIds
    };

    const error = this.data.broadcast
      ? await updateBroadcast(this.supabase, this.data.broadcast.id, input)
      : await createBroadcast(this.supabase, input);

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
