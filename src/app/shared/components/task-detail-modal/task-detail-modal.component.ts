import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { Database } from '../../models/database.types';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../../models/task-status';

type Task = Database['public']['Tables']['tasks']['Row'];

@Component({
  selector: 'app-task-detail-modal',
  imports: [
    DatePipe,
    FormsModule,
    MatDialogModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './task-detail-modal.component.html',
  styleUrl: './task-detail-modal.component.scss',
})
export class TaskDetailModalComponent {
  private supabase = inject(SupabaseService).client;
  dialogRef = inject(MatDialogRef<TaskDetailModalComponent>);
  task = inject<Task>(MAT_DIALOG_DATA);

  readonly statusLabels = TASK_STATUS_LABELS;
  readonly statuses = TASK_STATUSES;

  selectedStatus: Task['status'] = this.task.status;
  isSaving = false;
  error: string | null = null;

  async saveStatus() {
    if (this.selectedStatus === this.task.status) {
      this.dialogRef.close();
      return;
    }

    this.isSaving = true;
    this.error = null;

    const { error } = await this.supabase
      .from('tasks')
      .update({ status: this.selectedStatus })
      .eq('id', this.task.id);

    this.isSaving = false;

    if (error) {
      this.error = error.message;
      return;
    }

    this.dialogRef.close({ ...this.task, status: this.selectedStatus });
  }

  closeModal() {
    this.dialogRef.close();
  }
}
