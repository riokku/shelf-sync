import { Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { Database } from '../../models/database.types';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../../models/task-status';
import { toInventoryItem } from '../../utils/inventory-item.mapper';
import { resolveProfileName } from '../../utils/profile-label';
import { loadInventoryImagesByItemId } from '../../utils/inventory-item-images';
import { loadInventoryActivityByItemId } from '../../utils/inventory-item-activity';
import { ModalTableComponent } from '../modal-table/modal-table.component';

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
  private dialog = inject(MatDialog);
  dialogRef = inject(MatDialogRef<TaskDetailModalComponent>);
  task = inject<Task>(MAT_DIALOG_DATA);

  readonly statusLabels = TASK_STATUS_LABELS;
  readonly statuses = TASK_STATUSES;

  selectedStatus: Task['status'] = this.task.status;
  isSaving = false;
  error: string | null = null;

  isLoadingRelatedItem = false;
  relatedItemError: string | null = null;

  taskIdCopied = false;

  async copyTaskId() {
    await navigator.clipboard.writeText(this.task.id);
    this.taskIdCopied = true;
    setTimeout(() => (this.taskIdCopied = false), 2000);
  }

  /** related_item_name is plain text (not a foreign key), so the linked item
   *  is resolved by name lookup on demand rather than being preloaded. */
  async openRelatedItem() {
    const name = this.task.related_item_name;
    if (!name || this.isLoadingRelatedItem) {
      return;
    }

    this.isLoadingRelatedItem = true;
    this.relatedItemError = null;

    const [{ data: item }, { data: profiles }] = await Promise.all([
      this.supabase.from('inventory_items').select('*').eq('name', name).limit(1).maybeSingle(),
      this.supabase.from('profiles').select('*')
    ]);

    if (!item) {
      this.isLoadingRelatedItem = false;
      this.relatedItemError = 'This item could not be found — it may have been renamed or deleted.';
      return;
    }

    const allProfiles = profiles ?? [];
    const [imagesByItemId, activityByItemId] = await Promise.all([
      loadInventoryImagesByItemId(this.supabase, [item.id]),
      loadInventoryActivityByItemId(this.supabase, [item.id], allProfiles)
    ]);

    this.isLoadingRelatedItem = false;

    this.dialog.open(ModalTableComponent, {
      data: toInventoryItem(
        item,
        imagesByItemId.get(item.id) ?? [],
        resolveProfileName(item.checked_out_to, allProfiles),
        activityByItemId.get(item.id) ?? []
      ),
      width: 'clamp(45rem, 78vw, 70rem)',
      maxWidth: '90vw',
      maxHeight: '95vh',
      panelClass: 'item-details-dialog'
    });
  }

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
