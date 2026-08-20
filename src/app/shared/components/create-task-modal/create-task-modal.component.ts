import { Component, OnInit, inject } from '@angular/core';
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
import { AuthService, Profile } from '../../../core/auth.service';
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatus } from '../../models/task-status';
import { toIsoDateString } from '../../utils/date';
import { logActivity } from '../../utils/activity-log';

export interface CreateTaskModalData {
  relatedItemName?: string;
}

@Component({
  selector: 'app-create-task-modal',
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
  templateUrl: './create-task-modal.component.html',
  styleUrl: './create-task-modal.component.scss',
})
export class CreateTaskModalComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);
  dialogRef = inject(MatDialogRef<CreateTaskModalComponent>);
  data = inject<CreateTaskModalData>(MAT_DIALOG_DATA, { optional: true }) ?? {};

  private currentUserId: string | null = null;
  assignableProfiles: Profile[] = [];

  readonly statuses = TASK_STATUSES;
  readonly statusLabels = TASK_STATUS_LABELS;

  taskForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    status: new FormControl<TaskStatus>('todo', { nonNullable: true }),
    assignedTo: new FormControl<string | null>(null),
    dueDate: new FormControl<Date | null>(null)
  });

  isSaving = false;
  error: string | null = null;

  async ngOnInit() {
    const session = await this.authService.getSession();
    this.currentUserId = session?.user.id ?? null;

    const { data } = await this.supabase.from('profiles').select('*').order('full_name');
    this.assignableProfiles = data ?? [];
  }

  profileLabel(profile: Profile): string {
    return profile.nickname || profile.full_name || profile.email;
  }

  async submit() {
    if (this.isSaving || !this.currentUserId) {
      return;
    }
    if (this.taskForm.invalid) {
      this.taskForm.markAllAsTouched();
      return;
    }

    // Captured up front (rather than re-reading this.currentUserId after
    // the await below) so its non-null narrowing from the guard above holds.
    const userId = this.currentUserId;

    this.isSaving = true;
    this.error = null;

    const value = this.taskForm.getRawValue();
    const { error } = await this.supabase.from('tasks').insert({
      title: value.title,
      description: value.description || null,
      status: value.status,
      assigned_to: value.assignedTo,
      due_date: toIsoDateString(value.dueDate),
      created_by: userId,
      related_item_name: this.data.relatedItemName ?? null
    });

    this.isSaving = false;

    if (error) {
      this.error = error.message;
      return;
    }

    // Best-effort — a failed log write shouldn't block the task having
    // already been created.
    const assignee = value.assignedTo ? this.assignableProfiles.find(profile => profile.id === value.assignedTo) : null;
    await logActivity(
      this.supabase,
      userId,
      'task',
      null,
      assignee ? `Created task "${value.title}" (assigned to ${this.profileLabel(assignee)})` : `Created task "${value.title}"`
    );

    this.dialogRef.close(true);
  }

  cancel() {
    this.dialogRef.close(false);
  }
}
